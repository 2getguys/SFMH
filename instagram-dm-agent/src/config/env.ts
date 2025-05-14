/**
 * Цей файл відповідає за завантаження та валідацію змінних оточення.
 * Змінні оточення - це налаштування, які можуть змінюватися залежно від середовища
 * (розробка, тестування, продакшн), наприклад, ключі API, порти тощо.
 * Ми будемо використовувати бібліотеку (наприклад, dotenv) для завантаження їх з .env файлу.
 */

import dotenv from 'dotenv';

// Завантажуємо змінні оточення з файлу .env, якщо він існує.
// Це дозволяє мати різні конфігурації для розробки та продакшн.
dotenv.config(); 

// Функція для отримання змінної оточення з перевіркою на її існування
function getEnvVariable(key: string, defaultValue?: string): string {
    const value = process.env[key] || defaultValue;
    if (value === undefined) {
        // Якщо змінна не знайдена і немає значення за замовчуванням, кидаємо помилку.
        // Це допомагає уникнути проблем, коли важлива конфігурація відсутня.
        throw new Error(`Помилка: Змінна середовища ${key} не визначена.`);
    }
    return value;
}

// Експортуємо завантажені та перевірені змінні
// Тепер їх можна буде імпортувати в інших файлах проєкту.

// Порт для сервера. За замовчуванням 3001, якщо не вказано в .env
export const PORT = parseInt(getEnvVariable('PORT', '3001'), 10);

// Токен верифікації для Instagram Webhook
export const INSTAGRAM_VERIFY_TOKEN = getEnvVariable('INSTAGRAM_VERIFY_TOKEN');

// Ключі API для OpenAI, Supabase
export const OPENAI_API_KEY = getEnvVariable('OPENAI_API_KEY');
export const SUPABASE_URL = getEnvVariable('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnvVariable('SUPABASE_ANON_KEY');

// Токен для KeyCRM API
export const KEYCRM_API_TOKEN = getEnvVariable('KEYCRM_API_TOKEN');

// Змінні для підключення до PostgreSQL (для пам'яті чату)
export const POSTGRES_HOST = getEnvVariable('POSTGRES_HOST');
export const POSTGRES_PORT = parseInt(getEnvVariable('POSTGRES_PORT', '5432'), 10);
export const POSTGRES_USER = getEnvVariable('POSTGRES_USER');
export const POSTGRES_PASSWORD = getEnvVariable('POSTGRES_PASSWORD');
export const POSTGRES_DATABASE = getEnvVariable('POSTGRES_DATABASE');
export const CHAT_HISTORY_LENGTH = parseInt(getEnvVariable('CHAT_HISTORY_LENGTH', '10'), 10);

// Instagram
export const INSTAGRAM_PAGE_SENDER_ID = getEnvVariable('INSTAGRAM_PAGE_SENDER_ID');
export const INSTAGRAM_PAGE_ACCESS_TOKEN = getEnvVariable('INSTAGRAM_PAGE_ACCESS_TOKEN');

console.log('Змінні середовища завантажено.');
console.log(` - PORT: ${PORT}`);
console.log(` - INSTAGRAM_VERIFY_TOKEN: ${INSTAGRAM_VERIFY_TOKEN ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - OPENAI_API_KEY: ${OPENAI_API_KEY ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - SUPABASE_URL: ${SUPABASE_URL ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - KEYCRM_API_TOKEN: ${KEYCRM_API_TOKEN ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - POSTGRES_HOST: ${POSTGRES_HOST ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - POSTGRES_PORT: ${POSTGRES_PORT}`);
console.log(` - POSTGRES_USER: ${POSTGRES_USER ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - POSTGRES_PASSWORD: ${POSTGRES_PASSWORD ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - POSTGRES_DATABASE: ${POSTGRES_DATABASE ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - CHAT_HISTORY_LENGTH: ${CHAT_HISTORY_LENGTH}`);

// Перевірка наявності ключових змінних оточення
if (!INSTAGRAM_VERIFY_TOKEN) {
    console.warn('ПОПЕРЕДЖЕННЯ: INSTAGRAM_VERIFY_TOKEN не встановлено!');
}
if (!OPENAI_API_KEY) {
    console.warn('ПОПЕРЕДЖЕННЯ: OPENAI_API_KEY не встановлено!');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('ПОПЕРЕДЖЕННЯ: SUPABASE_URL та/або SUPABASE_ANON_KEY не встановлено!');
}
if (!INSTAGRAM_PAGE_SENDER_ID || !INSTAGRAM_PAGE_ACCESS_TOKEN) {
    console.warn('ПОПЕРЕДЖЕННЯ: INSTAGRAM_PAGE_SENDER_ID та/або INSTAGRAM_PAGE_ACCESS_TOKEN не встановлено для відправки повідомлень!');
}

// Потрібно буде додати валідацію, щоб переконатися, що всі необхідні змінні присутні. 