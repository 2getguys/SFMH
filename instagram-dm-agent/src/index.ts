/**
 * Головний файл додатку.
 * Тут ми ініціалізуємо сервер та налаштовуємо маршрути.
 */

import express, { Request, Response, NextFunction } from 'express'; // Імпортуємо express та типи для запитів/відповідей
import bodyParser from 'body-parser'; // Імпортуємо body-parser для розбору тіла запиту

// Імпортуємо наші обробники вебхуків
import { handleInstagramWebhook, verifyInstagramWebhook } from './api/webhookHandler';
import LegolasAgent from './agents/main-agent/LegolasAgent'; // <--- ДОДАНО: Імпорт LegolasAgent

// Імпортуємо конфігурацію, включаючи PORT та інші необхідні змінні
import { 
    PORT,
    OPENAI_API_KEY, // <--- ДОДАНО: Переконайся, що ці змінні є в env.ts і завантажуються
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    INSTAGRAM_PAGE_ACCESS_TOKEN,
    INSTAGRAM_PAGE_SENDER_ID
} from './config/env';

// Валідація ключових змінних середовища, необхідних для роботи агента
if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !INSTAGRAM_PAGE_ACCESS_TOKEN || !INSTAGRAM_PAGE_SENDER_ID) {
    console.error("КРИТИЧНА ПОМИЛКА: Не всі необхідні змінні середовища для LegolasAgent завантажені!");
    console.error("Перевірте ваш .env файл та конфігурацію в src/config/env.ts");
    // Можна додати перевірку конкретних змінних, які відсутні
    process.exit(1); 
}

const app = express(); // Створюємо екземпляр Express-додатку

// Використовуємо middleware для розбору JSON у тілі запиту
// Це дозволить нам легко отримувати дані, які надсилає message-queue-processor
app.use(bodyParser.json());

// <--- ДОДАНО: Ініціалізація LegolasAgent -->
let legolasAgentInstance: LegolasAgent;
try {
    legolasAgentInstance = new LegolasAgent();
    console.log("Екземпляр LegolasAgent успішно створено в src/index.ts.");
} catch (error) {
    console.error("КРИТИЧНА ПОМИЛКА: Не вдалося створити екземпляр LegolasAgent:", error);
    process.exit(1);
}
// <--- Кінець доданої ініціалізації -->

// Головна сторінка (для перевірки, що сервер працює)
app.get('/', (req: Request, res: Response) => {
    res.send('Instagram DM Agent is running!');
});

// Маршрут для верифікації вебхука Instagram (GET-запит)
// Instagram надсилає GET-запит на цей URL при налаштуванні вебхука
app.get('/webhook/instagram', verifyInstagramWebhook); 

// Маршрут для прийому повідомлень від Instagram (POST-запит)
// Сюди message-queue-processor буде надсилати дані, отримані з черги
// Також, якщо налаштовувати вебхук Instagram напряму сюди (без черги), то Instagram буде сюди слати події.
app.post('/webhook/instagram', handleInstagramWebhook);

// <--- ДОДАНО: Маршрут для обробки повідомлень від message-queue-processor -->
app.post('/process-message', (req: Request, res: Response, next: NextFunction) => {
    const handleRequest = async () => {
        const { userId, processed_messages } = req.body;

        if (!userId || typeof userId !== 'string') {
            console.error('[LegolasServer Index] Некоректний запит: відсутній або невірний формат userId.', req.body);
            return res.status(400).send('Некоректний запит: потрібен userId (string).');
        }
        if (!processed_messages || !Array.isArray(processed_messages) || !processed_messages.every(m => typeof m === 'string')) {
            console.error('[LegolasServer Index] Некоректний запит: відсутній або невірний формат processed_messages (масив рядків).', req.body);
            return res.status(400).send('Некоректний запит: потрібні processed_messages (масив рядків).');
        }

        console.log(`[LegolasServer Index] Отримано запит на /process-message для userId: ${userId}. Кількість повідомлень: ${processed_messages.length}`);
        
        const combinedMessageText = processed_messages.join('\n\n'); 
        console.log(`[LegolasServer Index] Об'єднаний текст для агента (${userId}): "${combinedMessageText.substring(0, 200)}..."`);

        await legolasAgentInstance.handleMessage(userId, combinedMessageText);
        
        res.status(200).send('Повідомлення успішно прийнято та передано агенту Legolas.');
    };

    handleRequest().catch(error => {
        console.error('[LegolasServer Index] Внутрішня помилка під час асинхронної обробки запиту на /process-message:', error);
        if (!res.headersSent) {
            res.status(500).send('Внутрішня помилка сервера під час передачі повідомлення агенту Legolas.');
        }
        // next(error); // Розкоментуй, якщо є глобальний обробник помилок Express
    });
});
// <--- Кінець доданого маршруту -->

// Запускаємо сервер
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Instagram DM Agent (з інтегрованим LegolasAgent) started successfully!'); // Оновлено лог
    console.log(`Webhook URL for POST (events to /webhook/instagram): http://localhost:${PORT}/webhook/instagram`); // Залишаємо для ясності
    console.log(`Webhook URL for GET (verification at /webhook/instagram): http://localhost:${PORT}/webhook/instagram`); // Залишаємо для ясності
    console.log(`LegolasAgent очікує POST-запитів на /process-message від message-queue-processor.`); // <--- ДОДАНО: Новий лог
}); 