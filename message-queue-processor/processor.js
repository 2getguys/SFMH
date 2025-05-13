require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Configuration ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
const agentWebhookUrl = process.env.AGENT_WEBHOOK_URL;
const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MS || '2000', 10);
const messageDelaySeconds = parseInt(process.env.MESSAGE_DELAY_SECONDS || '7', 10);
const maxRetries = parseInt(process.env.MAX_PROCESSING_RETRIES || '5', 10);
const baseRetryDelayMinutes = parseInt(process.env.BASE_RETRY_DELAY_MINUTES || '1', 10);

if (!supabaseUrl || !supabaseAnonKey || !openaiApiKey || !n8nWebhookUrl || !agentWebhookUrl) {
    console.error('Помилка: Не всі необхідні змінні середовища визначені (Supabase, OpenAI, N8N Webhook URL, AGENT_WEBHOOK_URL). Перевірте .env файл.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

const TEMP_DIR = path.join(os.tmpdir(), 'sfmh_media_temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- Helper Functions ---
async function downloadMedia(url, fileName) {
    const filePath = path.join(TEMP_DIR, fileName);
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Помилка завантаження медіа з ${url}:`, error.message);
        return null;
    }
}

async function transcribeAudio(filePath) {
    if (!filePath) return '[Не вдалося завантажити аудіо для транскрибації]';
    try {
        const transcription = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: fs.createReadStream(filePath),
        });
        return transcription.text;
    } catch (error) {
        console.error('Помилка транскрибації аудіо:', error.message);
        return '[Помилка транскрибації аудіо]';
    }
}

async function analyzeImage(mediaUrl) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Опиши це зображення детально українською мовою.' },
                        {
                            type: 'image_url',
                            image_url: { "url": mediaUrl },
                        },
                    ],
                },
            ],
            max_tokens: 300,
        });
        return response.choices[0]?.message?.content || '[Не вдалося отримати опис зображення]';
    } catch (error) {
        console.error('Помилка аналізу зображення:', error.message);
        if (error.status) {
            console.error('Статус помилки OpenAI:', error.status);
        }
        if (error.response && error.response.data) {
            console.error('Відповідь помилки OpenAI:', error.response.data);
        }
        return '[Помилка аналізу зображення]';
    }
}

async function sendToN8N(userId, processedMessages) {
    const payload = {
        userId: userId,
        processed_messages: processedMessages 
    };
    try {
        console.log(`Відправка даних на АГЕНТ (${agentWebhookUrl}) для користувача ${userId}:`, JSON.stringify(payload).substring(0, 200) + '...');
        const response = await axios.post(agentWebhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`Дані для ${userId} успішно відправлені на АГЕНТ. Статус: ${response.status}`);
        return true;
    } catch (error) {
        console.error(`Помилка відправки даних на АГЕНТ (${agentWebhookUrl}) для ${userId}:`, error.response ? error.response.data : error.message);
        return false;
    }
}

// --- Main Processing Logic ---
async function processQueues() {
    console.log(`\n[${new Date().toISOString()}] Перевірка черги повідомлень...`);
    const now = new Date(); // Використовуємо один і той самий "now" для всіх перевірок у цьому циклі
    const thresholdTimestamp = new Date(now.getTime() - messageDelaySeconds * 1000).toISOString();

    try {
        const { data: ripeBuffers, error: fetchError } = await supabase
            .from('sfmh_message_buffer')
            .select('*')
            .or(`status.eq.new,and(status.eq.failed,next_retry_at.lte.${now.toISOString()})`)
            .lt('retry_count', maxRetries) // Не брати ті, що вичерпали спроби
            .lt('last_message_timestamp', thresholdTimestamp) // Тільки "дозрілі" за часом повідомлення
            .order('last_message_timestamp', { ascending: true }) // Обробляти старіші першими
            .limit(5); // Обробляти не більше 5 за раз, щоб не перевантажувати

        if (fetchError) {
            console.error('Помилка отримання "дозрілих" буферів:', fetchError);
            return;
        }

        if (!ripeBuffers || ripeBuffers.length === 0) {
            console.log('Немає доступних буферів для обробки (new або failed з простроченим retry).');
            return;
        }

        console.log(`Знайдено ${ripeBuffers.length} буфер(ів) для обробки.`);

        for (const buffer of ripeBuffers) {
            console.log(`\nОбробка буфера ID: ${buffer.id}, User ID: ${buffer.user_id}, Status: ${buffer.status}, Retries: ${buffer.retry_count}`);

            const newRetryCount = (buffer.retry_count || 0) + 1;
            let nextRetryTimestamp = new Date(now.getTime() + baseRetryDelayMinutes * 60000 * Math.pow(2, newRetryCount -1)); // Експоненційна затримка
            // Обмеження максимальної затримки, наприклад, 1 година
            if (nextRetryTimestamp.getTime() > now.getTime() + 3600000) {
                nextRetryTimestamp = new Date(now.getTime() + 3600000);
            }

            // Оновлюємо статус на 'processing' та збільшуємо лічильник спроб
            // Це робиться перед обробкою, щоб інші процесори не підхопили той самий запис.
            const { error: updateToProcessingError } = await supabase
                .from('sfmh_message_buffer')
                .update({ status: 'processing', retry_count: newRetryCount -1 , last_processed_at: now.toISOString() }) // last_processed_at може бути корисним
                .eq('id', buffer.id);

            if (updateToProcessingError) {
                console.error(`Помилка оновлення статусу на 'processing' для буфера ID ${buffer.id}:`, updateToProcessingError);
                continue; 
            }
            console.log(`Статус буфера ID ${buffer.id} оновлено на 'processing'.`);

            let processedTexts = [];
            let processingErrorOccurred = false;

            for (const message of buffer.messages) {
                console.log(`  Обробка повідомлення типу: ${message.type}`);
                if (message.type === 'text') {
                    processedTexts.push(message.content);
                } else if (message.type === 'audio') {
                    const audioFileName = `audio_${buffer.user_id}_${Date.now()}.mp3`;
                    const downloadedAudioPath = await downloadMedia(message.content, audioFileName);
                    if (downloadedAudioPath) {
                        const transcription = await transcribeAudio(downloadedAudioPath);
                        processedTexts.push(transcription);
                        if (transcription.startsWith('[Помилка') || transcription.startsWith('[Не вдалося')) processingErrorOccurred = true;
                        try { fs.unlinkSync(downloadedAudioPath); } catch (e) { console.warn(`Не вдалося видалити тимчасовий аудіофайл: ${downloadedAudioPath}`, e.message); }
                    } else {
                        processedTexts.push('[Не вдалося завантажити аудіо]');
                        processingErrorOccurred = true;
                    }
                } else if (message.type === 'image') {
                    const description = await analyzeImage(message.content);
                    processedTexts.push(description);
                    if (description.startsWith('[Помилка') || description.startsWith('[Не вдалося')) processingErrorOccurred = true;
                } else {
                    console.warn(`Невідомий тип повідомлення в буфері: ${message.type}`);
                    processedTexts.push(`[Невідомий тип повідомлення: ${message.type}]`);
                }
            }

            console.log(`  Всі повідомлення для буфера ID ${buffer.id} оброблені.`);

            let finalStatus = 'failed'; // За замовчуванням, якщо щось піде не так
            let updatePayload = {
                retry_count: newRetryCount,
                next_retry_at: nextRetryTimestamp.toISOString(),
                status: finalStatus
            };

            if (processingErrorOccurred) {
                console.warn(`Виникли помилки під час обробки медіа для буфера ID ${buffer.id}.`);
                if (newRetryCount >= maxRetries) {
                    console.error(`Буфер ID ${buffer.id} досяг максимальної кількості спроб (${maxRetries}). Встановлення статусу 'permanently_failed'.`);
                    updatePayload.status = 'permanently_failed';
                }
                // Запис помилки в БД (статус 'failed' або 'permanently_failed')
                const { error: updateStatusError } = await supabase.from('sfmh_message_buffer').update(updatePayload).eq('id', buffer.id);
                if (updateStatusError) console.error(`Помилка оновлення статусу на ${updatePayload.status} для буфера ID ${buffer.id}:`, updateStatusError);
                continue; // Переходимо до наступного буфера
            }

            const n8nSuccess = await sendToN8N(buffer.user_id, processedTexts);

            if (n8nSuccess) {
                const { error: deleteError } = await supabase
                    .from('sfmh_message_buffer')
                    .delete()
                    .eq('id', buffer.id);

                if (deleteError) {
                    console.error(`Помилка видалення обробленого буфера ID ${buffer.id}:`, deleteError);
                    updatePayload.status = 'delete_error'; // Позначаємо, що відправлено, але не видалено
                    if (newRetryCount >= maxRetries) updatePayload.status = 'permanently_failed_delete_error';
                    const { error: updateStatusError } = await supabase.from('sfmh_message_buffer').update(updatePayload).eq('id', buffer.id);
                    if (updateStatusError) console.error(`Помилка оновлення статусу на ${updatePayload.status} для буфера ID ${buffer.id}:`, updateStatusError);
                } else {
                    console.log(`Буфер ID ${buffer.id} успішно оброблено, відправлено на АГЕНТ та видалено.`);
                }
            } else {
                console.warn(`Відправка на АГЕНТ для буфера ID ${buffer.id} не вдалася.`);
                if (newRetryCount >= maxRetries) {
                    console.error(`Буфер ID ${buffer.id} досяг максимальної кількості спроб (${maxRetries}) після невдалої відправки на АГЕНТ. Встановлення статусу 'permanently_failed'.`);
                    updatePayload.status = 'permanently_failed';
                }
                 // Запис помилки в БД (статус 'failed' або 'permanently_failed')
                const { error: updateStatusError } = await supabase.from('sfmh_message_buffer').update(updatePayload).eq('id', buffer.id);
                if (updateStatusError) console.error(`Помилка оновлення статусу на ${updatePayload.status} для буфера ID ${buffer.id}:`, updateStatusError);
            }
        }
    } catch (error) {
        console.error('Загальна помилка в циклі обробки черг:', error);
    }
}

// --- Start Polling ---
console.log('Сервіс обробки черг повідомлень запущено.');
console.log(`Інтервал опитування: ${pollingInterval / 1000} сек.`);
console.log(`Затримка повідомлення перед обробкою: ${messageDelaySeconds} сек.`);

setInterval(processQueues, pollingInterval);

// Початковий запуск, щоб не чекати першого інтервалу
processQueues();
