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

console.log('Змінні середовища завантажено.');
console.log(` - PORT: ${PORT}`);
console.log(` - INSTAGRAM_VERIFY_TOKEN: ${INSTAGRAM_VERIFY_TOKEN ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - OPENAI_API_KEY: ${OPENAI_API_KEY ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - SUPABASE_URL: ${SUPABASE_URL ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);
console.log(` - SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '*** (завантажено)' : 'НЕ ЗАВАНТАЖЕНО!'}`);

// Потрібно буде додати валідацію, щоб переконатися, що всі необхідні змінні присутні. 