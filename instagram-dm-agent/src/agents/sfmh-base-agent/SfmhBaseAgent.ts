import { ChatOpenAI } from "@langchain/openai";
import { OPENAI_API_KEY } from "../../config/env";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  BaseMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { ChatOpenAICallOptions } from "@langchain/openai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SUPABASE_URL, SUPABASE_ANON_KEY, KEYCRM_API_TOKEN } from "../../config/env";
import axios from 'axios';

const SFMH_BASE_AGENT_SYSTEM_PROMPT = `
# РОЛЬ
Ти — **Леголас**, технічний асистент менеджера з продажу в Instagram-магазині косметики для волосся **SORRY FOR MY HAIR**.
Твоя задача — обробляти запити головного агента та повертати **повну, необроблену, структуровану інформацію** про товари з бази.

## ЗАВДАННЯ
Ти — субагент, який взаємодіє **виключно з базами даних**. Ти НЕ спілкуєшся з клієнтом, НЕ формуєш готову відповідь, а лише передаєш знайдені дані головному агенту. Ти працюєш з векторною базою та CRM з наявністю товарів. Твоя задача — отримати запит від головного агента.
Надати йому ПОВНУ інформацію по засобам на основі запиту клієнта.
Tools:
- sfmh_base — Векторна база даних продуктів SORRY FOR MY HAIR (Supabase vector store). Використовуй для пошуку інформації про товари, підбору догляду на основі опису проблеми, типу волосся тощо.
- sfmh_id — Точний пошук товарів SORRY FOR MY HAIR за їх ID. Використовуй, якщо \`sfmh_base\` не дав результату, а головний агент надав конкретний ID товару.
- crm_available — Перевірка наявності товарів SORRY FOR MY HAIR за CRM ID та об'ємом.


⚠️ КРИТИЧНО ВАЖЛИВІ ПРАВИЛА ТА ПОРЯДОК ВИКОРИСТАННЯ ІНСТРУМЕНТІВ ⚠️
    **Якщо запит стосується продуктів SORRY FOR MY HAIR (пошук, опис, характеристики, ціни, підбір):**
    *   Спочатку ЗАВЖДИ використовуй \`sfmh_base\` (векторний пошук по товарах).
    *   Якщо \`sfmh_base\` не дав потрібного результату, АЛЕ є точний ID товару, використовуй \`sfmh_id\`.
    *   Для перевірки наявності конкретного товару (після отримання його CRM ID з \`sfmh_base\` або \`sfmh_id\`), використовуй \`crm_available\`.

## ЗАГАЛЬНІ ОБМЕЖЕННЯ
1. Ти повертаєш виключно ту інформацію, яку отримав з бази даних smfh_base.
2. ЗАБОРОНЕНО ВИГАДУВАТИ ІНФОРМАЦІЮ, якої не існує в базі даних smfh_base.

## ❌ Заборонено
* Формулювати текстові повідомлення для клієнта. Ти надаєш всю інформацію по засобах головному агенту.
* Узагальнювати, вигадувати або дописувати інформацію.
* Давати поради або рекомендації — лише структуровані дані з бази.

### 1. ВЗАЄМОДІЯ З БАЗОЮ 
Зроби запит до бази даних \`sfmh_base\` щодо вказаного товару.
Надай точну інформацію з бази про цей продукт: якщо ти отримав загальний запит наприклад: Шампуні, кондиціонери, чи проблеми які турбують користувача, надаєш комплексний набір засобів та всю інформацію про них
- Якщо ти отримав запит щодо наявності товару
  - **ЩЕ РАЗ** звернись до бази \`sfmh_base\` з назвою товару.
  - Отримай з ключа \`crm_ids\` ID, який відповідає вказаному обʼєму.
  - **Передай цей ID в Tool \`crm_available\`** для перевірки залишків.
  - ID об'ємів товару — завжди отримуй з актуальної відповіді \`sfmh_base\`.

**ОБОВ'ЯЗКОВО:** Надавай всю інформацію про засоби щодо запиту клієнта
- Якщо клієнт питає про конкретний засіб за порядковим номером, звернись до \`sfmh_id\`, щоб дістати інформацію про конкретний товар (робиш цей крок виключно, якщо не можеш знайти інформацію в основній базі \`sfmh_base\`).


### 2. АЛГОРИТМ ОБРОБКИ АНКЕТИ:
Ти можеш отримати ряд відповідей на анкету про тип волосся, проблеми які турбують людину і тд.
1. **ОБОВ'ЯЗКОВО:** Проаналізуй відповіді на анкету.
2. **ОБОВ'ЯЗКОВО:** Сформуй запит до бази даних sfmh_base на основі потреб клієнта.
3. Порівняй характеристики товарів з озвученими потребами.
4. Запропонуй 1-4 найбільш відповідних товари з бази даних.
5. Засоби мають бути підібрані обов'язково враховуючи проблему користувача.

Формат відповіді про продукт:
Повертаєш **всю інформацію, отриману з бази**, у структурованому вигляді, без жодної генерації чи переосмислення.
Відповідь повинна включати - опис, ціни, обєми, посилання, активні компоненти, посилання і тд.
`;

// Ініціалізація клієнта Supabase
// Переконуємося, що SUPABASE_URL та SUPABASE_ANON_KEY не undefined перед створенням клієнта
let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase client ініціалізовано для SfmhBaseAgent.");
} else {
  console.error("Помилка: SUPABASE_URL або SUPABASE_ANON_KEY не визначені. Supabase client не ініціалізовано.");
}

// Ініціалізація OpenAI Embeddings
// Переконуємося, що OPENAI_API_KEY не undefined
let embeddings: OpenAIEmbeddings | null = null;
if (OPENAI_API_KEY) {
  embeddings = new OpenAIEmbeddings({
    apiKey: OPENAI_API_KEY,
    modelName: "text-embedding-3-small",
  });
  console.log("OpenAIEmbeddings ініціалізовано з моделлю text-embedding-3-small.");
} else {
  console.error("Помилка: OPENAI_API_KEY не визначений. OpenAIEmbeddings не ініціалізовано.");
}

// --- Визначення інструментів ---

const sfmhBaseSchema = z.object({
  query: z.string().describe("Запит для векторного пошуку по продуктах SORRY FOR MY HAIR (назва товару, опис проблеми, тип волосся, категорія тощо) в Supabase vector store."),
});
const sfmhBaseTool = new DynamicStructuredTool({
  name: "sfmh_base",
  description:
    "Пошук товарів у векторній базі даних. Використовується для пошуку за назвою, описом проблеми, або для підбору комплексного догляду. Повертає повну інформацію про знайдені товари.",
  schema: sfmhBaseSchema,
  func: async (args: z.infer<typeof sfmhBaseSchema>) => {
    const { query } = args;
    console.log("[SfmhBaseAgent TOOL CALL] sfmh_base викликано з запитом: " + query);

    if (!supabase) {
      console.error("sfmh_base: Supabase client не ініціалізовано.");
      return JSON.stringify({ products: [], error: "Помилка конфігурації: Supabase client не доступний." });
    }
    if (!embeddings) {
      console.error("sfmh_base: OpenAIEmbeddings не ініціалізовано.");
      return JSON.stringify({ products: [], error: "Помилка конфігурації: OpenAIEmbeddings не доступний." });
    }

    try {
      // 1. Генеруємо ембединг для запиту
      const queryEmbedding = await embeddings.embedQuery(query);

      // 2. Викликаємо RPC функцію в Supabase
      const { data, error } = await supabase.rpc('sfmh', {
        query_embedding: queryEmbedding,
        match_count: 10, // Користувач змінив на 10
        // match_threshold: 0.78 // Можна додати, якщо ваша функція підтримує і це потрібно
      });

      if (error) {
        console.error("Помилка при виклику Supabase RPC 'sfmh':", error);
        return JSON.stringify({ products: [], error: `Помилка бази даних: ${error.message}` });
      }

      console.log("[SfmhBaseAgent TOOL RESULT] sfmh_base: Знайдено " + (data?.length || 0) + " продуктів.");
      // Припускаємо, що RPC функція повертає масив об'єктів, де кожен об'єкт
      // містить як мінімум 'content' та 'metadata', або інші поля з вашої таблиці 'sfmh_table'
      return JSON.stringify({ products: data || [] });

    } catch (e: any) {
      console.error("Помилка в sfmh_base при обробці запиту до Supabase:", e);
      return JSON.stringify({ products: [], error: `Внутрішня помилка інструменту: ${e.message}` });
    }
  },
});

const sfmhIdSchema = z.object({
  productId: z.string().describe("Точний ID товару (значення для порівняння з колонкою 'id' в таблиці 'sfmh_ids')"),
});
const sfmhIdTool = new DynamicStructuredTool({
  name: "sfmh_id",
  description: "Пошук товару за його точним ID в таблиці 'sfmh_ids' (порівняння з колонкою 'id'). Використовується, якщо sfmh_base не дав результатів, а головний агент вказав конкретний номер товару.",
  schema: sfmhIdSchema,
  func: async (args: z.infer<typeof sfmhIdSchema>) => {
    const { productId } = args;
    console.log("[SfmhBaseAgent TOOL CALL] sfmh_id/sfmh_ids викликано з ID: " + productId);

    if (!supabase) {
      console.error("sfmh_id/sfmh_ids: Supabase client не ініціалізовано.");
      return JSON.stringify({ product: null, error: "Помилка конфігурації: Supabase client не доступний." });
    }

    try {
      const { data, error } = await supabase
        .from('sfmh_ids')      // Назва таблиці
        .select('*')         // Вибираємо всі колонки
        .eq('id', productId) // Шукаємо за колонкою 'id' (виправлено з 'text')
        .single();           // Очікуємо один результат або жодного

      if (error) {
        if (error.code === 'PGRST116') { 
            console.warn("sfmh_id/sfmh_ids: Товар з ID '" + productId + "' не знайдено в таблиці 'sfmh_ids' (по колонці 'id').");
            return JSON.stringify({ product: null, message: "Товар з ID '" + productId + "' не знайдено." });
        }
        console.error("Помилка при запиті до Supabase таблиці 'sfmh_ids' для ID '" + productId + "' (по колонці 'id'):", error);
        return JSON.stringify({ product: null, error: "Помилка бази даних: " + error.message });
      }

      if (!data) {
        console.log("[SfmhBaseAgent TOOL RESULT] sfmh_id/sfmh_ids: Товар з ID '" + productId + "' не знайдено (по колонці 'id').");
        return JSON.stringify({ product: null, message: "Товар з ID '" + productId + "' не знайдено." });
      }

      console.log("[SfmhBaseAgent TOOL RESULT] sfmh_id/sfmh_ids: Знайдено товар для ID '" + productId + "' (по колонці 'id').");

      // Тепер 'id' в productData буде братися з data.id (первинний ключ таблиці, за яким шукали)
      // А 'text_id_value' (старе data.text) буде data.id, бо productId порівнювався з колонкою 'id'
      const productData = {
        id: data.id, // Значення з колонки 'id', за яким шукали
        content: data.content, 
        crm_ids: data.crm_ids,
        // Якщо в таблиці sfmh_ids є колонка 'text', і її теж треба повернути, то додати data.text
        // Наприклад: text_column_value: data.text 
      };

      return JSON.stringify({ product: productData });

    } catch (e: any) {
      console.error("Помилка в sfmh_id/sfmh_ids при обробці запиту для ID '" + productId + "':", e);
      return JSON.stringify({ product: null, error: "Внутрішня помилка інструменту: " + e.message });
    }
  },
});

const crmAvailableSchema = z.object({
  crmId: z.number().describe("Числовий CRM ID товару (значення для підстановки в URL KeyCRM API: https://openapi.keycrm.app/v1/products/{crmId})"),
  // volume: z.string().describe("Об'єм товару, наявність якого перевіряється (наразі не використовується, але може бути корисним для логування)"),
});
const crmAvailableTool = new DynamicStructuredTool({
  name: "crm_available",
  description: "Перевірка актуальної наявності конкретного товару за його CRM ID в системі KeyCRM.",
  schema: crmAvailableSchema,
  func: async (args: z.infer<typeof crmAvailableSchema>) => {
    const { crmId } = args; // crmId тепер є числом
    console.log("[SfmhBaseAgent TOOL CALL] crm_available викликано для CRM ID: " + crmId);

    if (!KEYCRM_API_TOKEN) {
      console.error("crm_available: KEYCRM_API_TOKEN не визначений.");
      return JSON.stringify({ available: false, count: 0, error: "Помилка конфігурації: токен KeyCRM API не доступний." });
    }

    const apiUrl = `https://openapi.keycrm.app/v1/products/${String(crmId)}`; // Перетворюємо crmId на рядок для URL
    const headers = {
      'Authorization': `Bearer ${KEYCRM_API_TOKEN}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios.get(apiUrl, { headers });
      
      const productData: any = response.data;
      const quantity = productData?.quantity; 

      if (typeof quantity === 'number') {
        const available = quantity > 0;
        console.log("[SfmhBaseAgent TOOL RESULT] crm_available: Товар CRM ID " + crmId + " - в наявності: " + available + ", кількість: " + quantity);
        return JSON.stringify({ crmId, available, count: quantity });
      } else {
        console.warn("[SfmhBaseAgent TOOL RESULT] crm_available: Не вдалося знайти поле 'quantity' або воно некоректного типу у відповіді від KeyCRM для CRM ID " + crmId, productData);
        return JSON.stringify({ crmId, available: false, count: 0, message: "Не вдалося визначити кількість товару з відповіді API." });
      }

    } catch (error: any) {
      console.error("Помилка при запиті до KeyCRM API для CRM ID " + crmId + ":", error.isAxiosError && error.toJSON ? error.toJSON() : error);
      let errorMessage = "Загальна помилка при запиті до KeyCRM API.";
      if (error && error.isAxiosError && error.response) {
        errorMessage = `Помилка KeyCRM API: ${error.response.status} ${error.response.statusText}. `;
        // Можна додати error.response.data для більшої деталізації, якщо воно безпечне для логування
        // console.error("KeyCRM API Response Data:", error.response.data);
      }
      return JSON.stringify({ crmId, available: false, count: 0, error: errorMessage });
    }
  },
});

class SfmhBaseAgent {
  private openai: Runnable<BaseLanguageModelInput, AIMessage, ChatOpenAICallOptions>;
  private tools: DynamicStructuredTool[];

  constructor() {
    console.log('SfmhBaseAgent ініціалізовано.');
    this.tools = [sfmhBaseTool, sfmhIdTool, crmAvailableTool];
    const chatModel = new ChatOpenAI({
      apiKey: OPENAI_API_KEY,
      modelName: "gpt-4o",
      temperature: 0.2,
    });
    // `bindTools` приймає масив інструментів, що відповідають BaseDynamicTool або мають певну структуру
    this.openai = chatModel.bindTools(this.tools); 
    console.log('Інструменти прив\'язані до моделі SfmhBaseAgent.');
  }

  public async handleQuery(query: string): Promise<any> {
    console.log("SfmhBaseAgent отримав запит: " + query);

    const messages: BaseMessage[] = [
      new SystemMessage(SFMH_BASE_AGENT_SYSTEM_PROMPT),
      new HumanMessage(query),
    ];

    try {
      let aiResponse = await this.openai.invoke(messages);
      messages.push(aiResponse);

      while (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        console.log("SfmhBaseAgent (LLM) запросив виклик інструментів:", aiResponse.tool_calls);

        const toolMessages: ToolMessage[] = [];
        for (const toolCall of aiResponse.tool_calls) {
          const toolCallId = toolCall.id ?? '';
          const selectedTool = this.tools.find(
            (t) => t.name === toolCall.name
          );

          if (selectedTool) {
            try {
              // `toolCall.args` вже є об'єктом, який очікує `func` в StructuredTool
              const toolOutput = await selectedTool.invoke(toolCall.args);
              console.log("SfmhBaseAgent: результат інструменту " + toolCall.name + ":", toolOutput);
              toolMessages.push(
                new ToolMessage({
                  tool_call_id: toolCallId,
                  name: toolCall.name,
                  content: toolOutput as string, // Припускаємо, що інструмент повертає рядок
                })
              );
            } catch (toolError: any) {
              console.error("Помилка при виконанні інструменту " + toolCall.name + ":", toolError);
              toolMessages.push(
                new ToolMessage({
                  tool_call_id: toolCallId,
                  name: toolCall.name,
                  content: "Помилка: " + (toolError instanceof Error ? toolError.message : String(toolError)),
                })
              );
            }
          } else {
            console.warn("SfmhBaseAgent: невідомий інструмент " + toolCall.name);
            toolMessages.push(
              new ToolMessage({
                tool_call_id: toolCallId,
                name: toolCall.name,
                content: "Помилка: невідомий інструмент.",
              })
            );
          }
        }

        messages.push(...toolMessages);
        aiResponse = await this.openai.invoke(messages);
        messages.push(aiResponse);
      }

      const finalResult = aiResponse.content.toString();
      console.log("SfmhBaseAgent (LLM) фінальна структурована відповідь на запит \"" + query + "\":", finalResult);

      try {
        return JSON.parse(finalResult);
      } catch (e) {
        console.warn("Фінальна відповідь від SfmhBaseAgent LLM не є валідним JSON, повертаємо як текст.");
        return finalResult;
      }
    } catch (error: any) {
      console.error("Помилка в SfmhBaseAgent при обробці запиту \"" + query + "\":", error);
      return { error: "Помилка при обробці запиту до бази даних або взаємодії з LLM." };
    }
  }
}

export default SfmhBaseAgent;