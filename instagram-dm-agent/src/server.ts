import express, { Request, Response, NextFunction } from 'express';
import LegolasAgent from './agents/main-agent/LegolasAgent'; // Шлях до твого LegolasAgent
import { 
    OPENAI_API_KEY, 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    INSTAGRAM_PAGE_ACCESS_TOKEN, 
    INSTAGRAM_PAGE_SENDER_ID 
} from './config/env'; // Переконайся, що всі ці змінні є в env.ts і завантажуються

// Валідація ключових змінних середовища, необхідних для роботи агента
if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !INSTAGRAM_PAGE_ACCESS_TOKEN || !INSTAGRAM_PAGE_SENDER_ID) {
    console.error("КРИТИЧНА ПОМИЛКА: Не всі необхідні змінні середовища для LegolasAgent завантажені!");
    console.error("Перевірте ваш .env файл та конфігурацію в src/config/env.ts");
    console.error("Відсутні або некоректні: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, INSTAGRAM_PAGE_ACCESS_TOKEN, INSTAGRAM_PAGE_SENDER_ID");
    process.exit(1); // Зупиняємо процес, якщо немає критично важливих конфігурацій
}

const app = express();
const agentPort = process.env.LEGOLAS_AGENT_PORT || 3001; // Можеш задати порт в .env

app.use(express.json());

// Ініціалізація екземпляра LegolasAgent
// Конструктор LegolasAgent вже має ініціалізувати все необхідне (моделі OpenAI, інструменти і т.д.)
const legolasAgentInstance = new LegolasAgent();
console.log("Екземпляр LegolasAgent успішно створено.");

// Ендпоінт для прийому оброблених повідомлень від message-queue-processor
// Зверни увагу, що processor зараз стукає на /webhook. Можеш змінити тут на /webhook або в processor.js на /process-message
app.post('/process-message', (req: Request, res: Response, next: NextFunction) => {
    // Виносимо асинхронну логіку в окрему функцію
    const handleRequest = async () => {
        const { userId, processed_messages } = req.body;

        if (!userId || typeof userId !== 'string') {
            console.error('[LegolasServer] Некоректний запит: відсутній або невірний формат userId.', req.body);
            // Надсилаємо відповідь і завершуємо
            return res.status(400).send('Некоректний запит: потрібен userId (string).'); 
        }
        if (!processed_messages || !Array.isArray(processed_messages)) {
            console.error('[LegolasServer] Некоректний запит: відсутній або невірний формат processed_messages.', req.body);
            // Надсилаємо відповідь і завершуємо
            return res.status(400).send('Некоректний запит: потрібні processed_messages (array).'); 
        }

        console.log(`[LegolasServer] Отримано запит на /process-message для userId: ${userId}. Кількість повідомлень: ${processed_messages.length}`);
        
        const combinedMessageText = processed_messages.join('\n\n'); 
        console.log(`[LegolasServer] Об'єднаний текст для агента (${userId}): "${combinedMessageText.substring(0, 200)}..."`);

        await legolasAgentInstance.handleMessage(userId, combinedMessageText);
        
        // Надсилаємо відповідь і завершуємо
        res.status(200).send('Повідомлення успішно прийнято та передано агенту Legolas.'); 
    };

    handleRequest().catch(error => {
        console.error('[LegolasServer] Внутрішня помилка під час асинхронної обробки запиту на /process-message:', error);
        // Переконуємося, що не намагаємося надіслати відповідь, якщо вона вже була надіслана
        if (!res.headersSent) {
            res.status(500).send('Внутрішня помилка сервера під час передачі повідомлення агенту Legolas.');
        }
        // Можна також передати помилку далі, якщо є глобальний обробник
        // next(error); 
    });
});

// Тестовий GET-ендпоінт для перевірки, що сервер працює
app.get('/', (req, res) => {
    res.send('LegolasAgent HTTP сервер працює! Готовий приймати запити на /process-message.');
});

app.listen(agentPort, () => {
    console.log(`LegolasAgent HTTP сервер запущено на http://localhost:${agentPort}`);
    console.log(`Очікування POST-запитів на /process-message від message-queue-processor.`);
}); 