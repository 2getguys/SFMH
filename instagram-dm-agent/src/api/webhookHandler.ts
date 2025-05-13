/**
 * Цей файл буде містити логіку для обробки вхідних вебхуків від Instagram.
 * Коли Instagram надсилає нам нове повідомлення, цей обробник буде його приймати,
 * перевіряти та передавати далі на обробку головному агенту.
 */

import { Request, Response } from 'express';
import { INSTAGRAM_VERIFY_TOKEN } from '../config/env';
import { legolasAgent } from '../agents/main-agent/LegolasAgent';

export const handleInstagramWebhook = (req: Request, res: Response) => {
    console.log('Instagram webhook received (POST request). Processing...');
    const body = req.body;

    // Логуємо повне тіло запиту для діагностики
    // console.log('Full request body:', JSON.stringify(body, null, 2));

    // Перевіряємо, що це подія від Instagram
    if (body.object === 'instagram') {
        body.entry.forEach((entry: any) => {
            // entry.messaging може містити кілька повідомлень, якщо вони були згруповані
            entry.messaging.forEach((event: any) => {
                const senderId = event.sender.id;
                const recipientId = event.recipient.id; // ID нашої сторінки

                console.log(`Processing event for sender: ${senderId}, recipient (our page): ${recipientId}`);

                // Перевіряємо, чи є текстове повідомлення
                if (event.message && event.message.text && !event.message.is_echo) {
                    const messageText = event.message.text;
                    const messageId = event.message.mid;
                    
                    console.log(`Received TEXT message from ${senderId}:`);
                    console.log(`  Text: "${messageText}"`);
                    console.log(`  Message ID: ${messageId}`);

                    // Передаємо senderId та messageText головному агенту для обробки
                    legolasAgent.handleMessage(senderId, messageText).catch(error => {
                        console.error('Помилка під час обробки повідомлення Леголас Агентом:', error);
                        // Тут можна додати логіку для надсилання повідомлення про помилку користувачеві або розробнику
                    });

                } else if (event.message && event.message.is_echo) {
                    // Це відлуння повідомлення, надісланого нашою сторінкою. Ігноруємо.
                    console.log(`Received ECHO from our page to ${event.recipient.id}. Ignoring.`);
                } else {
                    // Інші типи подій (реакції, медіа, які ми поки не обробляємо тут)
                    console.log(`Received a non-text or non-message event from ${senderId}. Event:`, JSON.stringify(event, null, 2));
                }
            });
        });

        // Відповідаємо Instagram, що ми успішно отримали подію
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Якщо це не подія від Instagram, відповідаємо помилкою
        console.warn('Received a webhook event that is not from Instagram:', body);
        res.sendStatus(404); // Not Found
    }
};

// Функція для верифікації вебхука Instagram (GET запит)
export const verifyInstagramWebhook = (req: Request, res: Response) => {
    console.log('Attempting to verify Instagram webhook (GET request)...');

    // Токен верифікації, який ви вказали при налаштуванні вебхука в Facebook for Developers.
    // Він має співпадати зі значенням INSTAGRAM_VERIFY_TOKEN з вашого .env файлу.
    const verifyToken = INSTAGRAM_VERIFY_TOKEN;

    // Параметри, які надсилає Instagram
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Verification params from Instagram:');
    console.log(`- hub.mode: ${mode}`);
    console.log(`- hub.verify_token: ${token}`);
    console.log(`- hub.challenge: ${challenge}`);
    console.log(`- Our INSTAGRAM_VERIFY_TOKEN: ${verifyToken}`);

    // Перевіряємо, чи mode та token присутні та чи співпадають
    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('WEBHOOK_VERIFIED successfully!');
            res.status(200).send(challenge);
        } else {
            // Якщо токени не співпадають, або mode неправильний
            console.warn('Failed webhook verification: mode or token mismatch.');
            res.sendStatus(403); // Forbidden
        }
    } else {
        // Якщо mode або token відсутні
        console.warn('Failed webhook verification: mode or token missing from query params.');
        res.sendStatus(400); // Bad Request, хоча Instagram зазвичай надсилає 403, якщо щось не так
    }
}; 