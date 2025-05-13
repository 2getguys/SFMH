/**
 * Головний файл додатку.
 * Тут ми ініціалізуємо сервер та налаштовуємо маршрути.
 */

import express, { Request, Response } from 'express'; // Імпортуємо express та типи для запитів/відповідей
import bodyParser from 'body-parser'; // Імпортуємо body-parser для розбору тіла запиту

// Імпортуємо наші обробники вебхуків
import { handleInstagramWebhook, verifyInstagramWebhook } from './api/webhookHandler';

// Імпортуємо конфігурацію, включаючи PORT
import { PORT } from './config/env'; // <--- ЗМІНА: Імпортуємо PORT

const app = express(); // Створюємо екземпляр Express-додатку

// Використовуємо middleware для розбору JSON у тілі запиту
// Це дозволить нам легко отримувати дані, які надсилає message-queue-processor
app.use(bodyParser.json());

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

// Запускаємо сервер
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Instagram DM Agent started successfully!');
    console.log(`Webhook URL for POST (events): http://localhost:${PORT}/webhook/instagram`);
    console.log(`Webhook URL for GET (verification): http://localhost:${PORT}/webhook/instagram`);
}); 