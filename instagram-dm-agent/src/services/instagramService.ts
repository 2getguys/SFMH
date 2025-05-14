import axios from 'axios';
import { INSTAGRAM_PAGE_SENDER_ID, INSTAGRAM_PAGE_ACCESS_TOKEN } from '../config/env';

interface SendMessageResponse {
  recipient_id?: string;
  message_id?: string;
  error?: any;
}

/**
 * Очищає текст від Markdown та деяких спеціальних символів для кращого відображення в Instagram.
 * Замінює круглі дужки на пробіл.
 * Видаляє: *, _, ~, `, >, |, [, ], {, }, +, =, -
 * @param text Вхідний текст
 * @returns Очищений текст
 */
export function cleanTextForInstagram(text: string): string {
  if (!text) return '';
  // Заміна круглих дужок на пробіл
  let cleanedText = text.replace(/\(|\)/g, ' ');
  // Видалення Markdown та інших непотрібних символів
  // Додано екранування для -, [, ]
  cleanedText = cleanedText.replace(/[*_"~`>|\[\]{}+=]/g, '');
  // Можна додати .trim() якщо потрібно видалити зайві пробіли на початку/кінці після замін
  return cleanedText.trim(); 
}

export async function sendInstagramMessage(recipientId: string, messageText: string): Promise<SendMessageResponse> {
  if (!INSTAGRAM_PAGE_SENDER_ID || !INSTAGRAM_PAGE_ACCESS_TOKEN) {
    console.error('INSTAGRAM_PAGE_SENDER_ID або INSTAGRAM_PAGE_ACCESS_TOKEN не налаштовані в env.');
    return { error: 'Відсутня конфігурація Instagram для відправки повідомлень.' };
  }

  const cleanedMessageText = cleanTextForInstagram(messageText); // Очищення тексту перед відправкою

  const apiUrl = `https://graph.instagram.com/v22.0/${INSTAGRAM_PAGE_SENDER_ID}/messages`;
  
  const requestBody = {
    recipient: {
      id: recipientId,
    },
    message: {
      text: cleanedMessageText, // Використання очищеного тексту
    },
  };

  const requestConfig = {
    headers: {
      'Authorization': `Bearer ${INSTAGRAM_PAGE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  try {
    console.log(`Відправка Instagram повідомлення до ${recipientId} (через сторінку ${INSTAGRAM_PAGE_SENDER_ID}): "${cleanedMessageText}"`);
    const response = await axios.post(apiUrl, requestBody, requestConfig);
    console.log('Повідомлення успішно відправлено в Instagram:', response.data);
    return response.data as SendMessageResponse;
  } catch (error: any) {
    console.error('Помилка відправки Instagram повідомлення:', error.isAxiosError && error.response ? error.response.data : (error.isAxiosError ? error.toJSON() : error));
    const errorResponse: SendMessageResponse = {};
    if (error.isAxiosError && error.response) {
        errorResponse.error = error.response.data;
    } else {
        errorResponse.error = 'Невідома помилка при відправці Instagram повідомлення.';
    }
    return errorResponse;
  }
} 