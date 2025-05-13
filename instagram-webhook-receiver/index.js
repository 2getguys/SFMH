// Завантажуємо змінні середовища з .env файлу
require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
// Використовуємо змінну PORT з .env, або 3000 за замовчуванням
const port = process.env.PORT || 3000;

// Middleware для парсингу JSON тіла запитів
app.use(express.json());

// Ініціалізація клієнта Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Помилка: SUPABASE_URL або SUPABASE_ANON_KEY не визначені. Перевірте ваш .env файл.");
    process.exit(1); // Зупиняємо додаток, якщо ключі не знайдено
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const instagramPageId = process.env.INSTAGRAM_PAGE_ID;

// ----- ВАЖЛИВО: Структура вебхука Instagram -----
// Вам потрібно буде адаптувати цю частину під реальну структуру вебхука,
// яку надсилає Instagram. Це лише ПРИКЛАД.
// Дізнайтеся, як Instagram передає:
// 1. ID користувача (sender_id)
// 2. Текст повідомлення
// 3. URL для медіа (аудіо, зображення)
// 4. Тип повідомлення
// -----------------------------------------------

// Додаємо обробку GET-запиту для верифікації вебхука Instagram
app.get('/webhook/instagram', (req, res) => {
    console.log('Отримано GET-запит для верифікації вебхука Instagram:');
    console.log('Query params:', req.query);

    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "ngroktoken228"; // Використовуйте змінну середовища або ваш токен

    // Розбір параметрів запиту, які надсилає Facebook
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Перевірка, чи є mode та token
    if (mode && token) {
        // Перевірка, чи mode та token правильні
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            // Відповідаємо на запит значенням challenge
            console.log('Верифікація вебхука успішна! Відправка challenge.');
            res.status(200).send(challenge);
        } else {
            // Якщо токени не збігаються, відповідаємо '403 Forbidden'
            console.warn('Верифікація не вдалася: неправильний токен.');
            res.sendStatus(403);
        }
    } else {
        console.warn('Верифікація не вдалася: відсутні hub.mode або hub.verify_token.');
        res.sendStatus(400); // Bad Request, якщо відсутні потрібні параметри
    }
});

// Приклад обробника вебхука
app.post('/webhook/instagram', async (req, res) => {
    console.log('Отримано вебхук Instagram:', JSON.stringify(req.body, null, 2));

    let senderId;
    let messageContent;
    let messageType = 'text'; 
    let isEcho = false;

    try {
        const messagingEvent = req.body.entry?.[0]?.messaging?.[0];

        if (!messagingEvent) {
            console.warn('Не вдалося знайти messagingEvent у вебхуку');
            return res.status(400).send('Некоректний формат вебхука: відсутній messagingEvent');
        }

        senderId = messagingEvent.sender?.id;
        // Перевірка на "відлуння" повідомлення від вашої сторінки
        isEcho = messagingEvent.message?.is_echo === true;

        if (isEcho) {
            console.log(`Повідомлення-відлуння від ${senderId} проігноровано.`);
            return res.status(200).send('Повідомлення-відлуння проігноровано');
        }

        // Альтернативна або додаткова перевірка, якщо is_echo не завжди присутній:
        // if (instagramPageId && senderId === instagramPageId) {
        //     console.log(`Повідомлення від власної сторінки ${senderId} проігноровано.`);
        //     return res.status(200).send('Повідомлення від власної сторінки проігноровано');
        // }

        if (messagingEvent.message?.text) {
            messageContent = messagingEvent.message.text;
            messageType = 'text';
        } else if (messagingEvent.message?.attachments?.[0]?.type === 'image') {
            messageContent = messagingEvent.message.attachments[0].payload.url;
            messageType = 'image';
        } else if (messagingEvent.message?.attachments?.[0]?.type === 'audio') {
            messageContent = messagingEvent.message.attachments[0].payload.url;
            messageType = 'audio';
        } else if (messagingEvent.message?.attachments?.[0]?.type === 'share') {
            messageContent = messagingEvent.message.attachments[0].payload.url;
            messageType = 'image';
        } else {
            console.warn('Невідомий тип повідомлення або відсутній контент (після перевірки на відлуння)');
            return res.status(200).send('Повідомлення проігноровано: невідомий тип або відсутній контент');
        }

        if (!senderId || !messageContent) {
            console.warn('Відсутній senderId або messageContent (після перевірки на відлуння)');
            return res.status(400).send('Некоректний формат вебхука: відсутній senderId або messageContent');
        }

        console.log(`Обробка повідомлення: User ID: ${senderId}, Type: ${messageType}, Content: ${messageContent.substring(0, 50)}...`);

        const newMessageObject = {
            type: messageType,
            content: messageContent
            // original_message_id: messagingEvent.message?.mid // Опціонально, якщо потрібно
        };

        // Перевіряємо, чи існує буфер для цього користувача
        // Використовуємо назву таблиці sfmh_message_buffer
        const { data: existingBuffer, error: fetchError } = await supabase
            .from('sfmh_message_buffer') 
            .select('messages') // Вибираємо тільки поле messages для оптимізації
            .eq('user_id', senderId)
            .single(); // .single() очікує один або нуль записів

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116: 'No rows found' - це не помилка в даному випадку
            console.error('Помилка при пошуку існуючого буфера:', fetchError);
            return res.status(500).send('Помилка сервера при роботі з базою даних');
        }

        if (existingBuffer) {
            // Буфер існує, додаємо повідомлення та оновлюємо час, встановлюємо статус 'new'
            console.log(`Існуючий буфер для ${senderId} знайдено. Додавання повідомлення.`);
            const updatedMessages = [...existingBuffer.messages, newMessageObject];

            const { error: updateError } = await supabase
                .from('sfmh_message_buffer')
                .update({
                    messages: updatedMessages,
                    last_message_timestamp: new Date().toISOString(),
                    status: 'new' // Встановлюємо/оновлюємо статус на 'new'
                })
                .eq('user_id', senderId);

            if (updateError) {
                console.error('Помилка при оновленні буфера:', updateError);
                return res.status(500).send('Помилка сервера при оновленні буфера');
            }
            console.log(`Буфер для ${senderId} успішно оновлено, статус 'new'.`);
        } else {
            // Буфер не існує, створюємо новий зі статусом 'new'
            console.log(`Буфер для ${senderId} не знайдено. Створення нового.`);
            const { error: insertError } = await supabase
                .from('sfmh_message_buffer')
                .insert({
                    user_id: senderId,
                    messages: [newMessageObject],
                    last_message_timestamp: new Date().toISOString(),
                    status: 'new' // Встановлюємо статус 'new' при створенні
                });

            if (insertError) {
                console.error('Помилка при створенні нового буфера:', insertError);
                return res.status(500).send('Помилка сервера при створенні буфера');
            }
            console.log(`Новий буфер для ${senderId} успішно створено, статус 'new'.`);
        }

        res.status(200).send('Вебхук успішно отримано та оброблено');

    } catch (error) {
        console.error('Непередбачена помилка при обробці вебхука:', error);
        res.status(500).send('Внутрішня помилка сервера');
    }
});

// Тестовий GET-ендпоінт для перевірки, що сервер працює
app.get('/', (req, res) => {
    res.send('Сервер прийому вебхуків Instagram працює!');
});

app.listen(port, () => {
    console.log(`Сервер прийому вебхуків запущено на http://localhost:${port}`);
    console.log(`Очікування вебхуків на POST /webhook/instagram`);
});
