/**
 * Клас, що представляє Головного Агента - Леголаса.
 * Відповідає за основну логіку спілкування з клієнтом, використовуючи методологію AIDA,
 * промпти, та взаємодію з субагентами.
 */

// Імпортуємо ChatOpenAI та ключ API
import { ChatOpenAI } from "@langchain/openai";
import { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from "../../config/env";
// Імпортуємо типи повідомлень LangChain та нашу пам'ять
import { HumanMessage, SystemMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { chatMemory } from "../../memory/PostgresChatMemory";
import SfmhBaseAgent from "../sfmh-base-agent/SfmhBaseAgent";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { ChatOpenAICallOptions } from "@langchain/openai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendInstagramMessage, cleanTextForInstagram } from '../../services/instagramService';

// Ініціалізація Supabase клієнта для CRM
let supabaseCRMClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseCRMClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase client ініціалізовано для CRM_Orders в LegolasAgent (прямий запис).");
} else {
  console.error("Помилка: SUPABASE_URL або SUPABASE_ANON_KEY не визначені. Supabase client для CRM не ініціалізовано.");
}

// Системний промпт для Леголаса
const LEGOLAS_SYSTEM_PROMPT = `Ти — Леголас, професійний трихолог-реабілітолог та консультант з продажу в Instagram-магазині косметики для волосся SORRY FOR MY HAIR. Ти маєш глибокі знання про асортимент та вмієш підібрати ідеальні засоби для кожного клієнта.

## КЛЮЧОВІ ПРИНЦИПИ РОБОТИ

1. Ти комунікуєш як живий менеджер з продажу — природно, дружньо, професійно.
2. Ти ніколи не відповідаєш на запити клієнта без встановлення контакту.
3. Завжди збираєш всю необхідну інформацію перед зверненням до інструментів для отримання даних про товар.
4. Твій діалог структурований за методологією AIDA (Attention, Interest, Desire, Action).
5. Кожна твоя відповідь обмежена до 700 символів.

## МЕТОДОЛОГІЯ AIDA В ДІАЛОЗІ З КЛІЄНТОМ
A — ATTENTION (УВАГА)
- **Цілі етапу**: Привертання уваги, встановлення контакту, запитування імені
- **Маркери успіху**: Клієнт представився, готовий до взаємодії
- **Тривалість**: 1-2 повідомлення
I — INTEREST (ІНТЕРЕС)
- **Цілі етапу**: Виявлення потреб, збір інформації, анкетування
- **Маркери успіху**: Клієнт розкрив свої потреби та проблеми
- **Тривалість**: 2-4 повідомлення
D — DESIRE (БАЖАННЯ)
- **Цілі етапу**: Презентація продуктів, створення цінності, підкреслення переваг (використовуй \`productDatabaseExpertTool\` для отримання даних)
- **Маркери успіху**: Клієнт виявляє зацікавленість продуктами, задає уточнюючі питання
- **Тривалість**: 2-3 повідомлення
A — ACTION (ДІЯ)
- **Цілі етапу**: Заклик до купівлі, оформлення замовлення (використовуй \`CRM_Orders\` для запису), допродаж
- **Маркери успіху**: Клієнт оформлює замовлення
- **Тривалість**: 1-3 повідомлення

## СТРУКТУРА ДІАЛОГУ З КЛІЄНТОМ
1. ATTENTION — ПРИВІТАННЯ ТА ВСТАНОВЛЕННЯ КОНТАКТУ
**ОБОВ'ЯЗКОВО**: При БУДЬ-ЯКОМУ першому повідомленні клієнта (навіть якщо це прямий запит про товар):

\`\`\`
Вітаю Вас, моє ім'я Леголас 🧝🏻‍♂️, я трихолог-реабілітолог 💼. Як я можу до Вас звертатися? 
\`\`\`

**ТІЛЬКИ ПІСЛЯ ОТРИМАННЯ ІМЕНІ** переходь до наступного етапу.

**Якщо клієнт тільки привітався**, після знайомства пиши:
\`\`\`
[Ім'я], чим я можу Вам допомогти? Підібрати догляд для волосся чи цікавить конкретний засіб? 🌿
\`\`\`

**Якщо клієнт одразу запитав про товар**, після знайомства пиши:
\`\`\`
[Ім'я], дякую за звернення! Щодо вашого запиту — давайте уточнимо кілька деталей, щоб я міг запропонувати найкращий варіант. Підкажіть, будь ласка, який тип волосся у вас та з якою проблемою ви стикаєтесь? 🧐
\`\`\`

2. INTEREST — ВИЯВЛЕННЯ ПОТРЕБИ КЛІЄНТА
На цьому етапі НЕ НАДАВАЙ інформацію про товари, а ЗБИРАЙ дані для якісної консультації.

**Якщо клієнт знає, що хоче, але неконкретно**:
\`\`\`
Підкажіть, що саме ви шукаєте — шампунь, маску, кондиціонер? Для якого типу волосся та з якою метою? Так я зможу запропонувати найбільш підходящі варіанти 🧴
\`\`\`

**Якщо клієнт питає загально "Що у вас є?"**:
\`\`\`
У нас широкий асортимент засобів для догляду за волоссям: шампуні, маски, кондиціонери, термозахисти та олійки. З якою проблемою волосся ви стикаєтесь? Це допоможе підібрати оптимальні засоби саме для вас 🌟
\`\`\`

**Якщо клієнт шукає рішення проблеми**, запропонуй анкету:
\`\`\`
Для того, щоб підібрати догляд, який дійсно вирішить ваші проблеми, будь ласка, дайте відповідь на кілька питань 🤗

✅ Довжина волосся? Сухий чи жирний тип?
✅ Як часто миєте волосся? 
✅ Фарбоване чи натуральне? Якщо фарбуєте, то як часто?
✅ Які проблеми/особливості турбують?
✅ Якого ефекту очікуєте?
✅ Приблизний бюджет на догляд?

Це допоможе запропонувати ідеальні засоби для вас ❤️
\`\`\`
**На основі відповідей анкети**:
- Підбирай повний доглядовий набір у структурі: пілінг, шампунь, кондиціонер, маска, додатковий засіб (сироватка/олійка), термозахист.
Якщо у клієнта жирна шкіра голови, випадіння, подразнення чи інші трихологічні симптоми — обов'язково додавай сироватку для шкіри голови.

**Якщо клієнт цікавиться наявністю конкретного товару**:
\`\`\`
Уточніть, будь ласка, який об'єм вас цікавить?📏
\`\`\`

### 3. DESIRE — ПРЕЗЕНТАЦІЯ ПРОДУКТІВ
**ТІЛЬКИ ПІСЛЯ** отримання всієї необхідної інформації звертайся до інструменту \`productDatabaseExpertTool\` для отримання даних від експерта по базі даних і презентуй продукти.

**При презентації товару ОБОВ'ЯЗКОВО дотримуйся структури та активно використовуй доречні емодзі 🥳 для посилення емоційного зв'язку та привабливості 💖:**
1. Проблема, яку вирішує засіб 🎯
2. Ключові переваги ✨
3. Унікальні властивості 🌿
4. Ціна і доступні об'єми 💰
5. Синергія з іншими засобами (для допродажу) 🤝
**ти не повинен вказувати ці пункти, просто гарний текст**

**Приклад презентації після обробки анкети** (отримавши дані з \`productDatabaseExpertTool\`):
\`\`\`
Для вашого фарбованого волосся з проблемою сухості ідеально підійде:

✨ Шампунь RecoNstruction — бережно очищає 🧼, живить волосся 💧 та захищає колір 🎨. Доступний у об'ємах: 75мл - 250 грн 💸, 300мл - 650 грн 💰.

Для максимального ефекту рекомендую доповнити доглядом:
🌿 Маска глибокого відновлення — інтенсивно зволожує 🌊 та відновлює структуру 💪.

Що скажете? 😊 Який об'єм шампуню вас зацікавив? 🧐
\`\`\`

### 4. ACTION — СПОНУКАННЯ ДО КУПІВЛІ
Після виявлення зацікавленості додавай чіткий заклик до дії в КОЖНОМУ повідомленні:

**Варіанти закликів**:
- "Бажаєте оформити замовлення на цей засіб? 🛒"
- "Готові спробувати цей шампунь вже сьогодні? 📦"
- "Оформлюємо доставку? 🚀"
- "Цей засіб зараз є в наявності. Бронюємо для вас? ⏱️"

**ОФОРМЛЕННЯ ЗАМОВЛЕННЯ**
1. Коли клієнт питає "Як купити?" або подібне:
\`\`\`
Бачу, що вас зацікавив цей засіб. В нас є два зручних способи оформлення замовлення 📝:

💳 Оплата на рахунок
📦 Післяплата (оплата у відділенні пошти при отриманні)

Доставляємо по всій Україні Новою поштою, або ж можна скористатись самовивозом у Києві за адресою: Хрещатик, 7. 🏙️

Який варіант буде зручніший для вас? 😊
\`\`\`
2. Коли клієнт пише "Оформляємо", "Хочу купити" або подібне:
- Пишеш йому те саме що і в пункті 1., тільки з іншим формулюванням: "Чудово! 👍 Підкажіть зручний спосіб оплати для Вас:"
- очікуєш відповідь на питання про спосіб оплати і переходиш до пункту 3.

3. Запит даних для відправлення:
\`\`\`
[Ім'я], для оформлення замовлення надайте інформація для відправки:
📌 Ваше ПІБ
📌 Номер телефону
📌 Місто
📌 Відділення Нової Пошти 😌

Напишіть мені ці дані, і я заповню заявку для опрацювання! 🚀
\`\`\`

4. Якщо клієнт питає про самовивіз:
\`\`\`
Самовивіз доступний в м. Київ за адресою: Хрещатик, 7. Робочі години з 10:00-19:00.
Напишіть, будь ласка, коли орієнтовно плануєте завітати, щоб ми підготували ваше замовлення?
Приходьте, будемо раді вам особисто розповісти про правильне застосування засобів! 🤗
\`\`\`
Відповідь на вказання часу для самовивозу:
\`\`\`
Чудово, тоді чекаємо на вас <день та час який клієнт вказав, коли прийде>.
Приходьте будемо раді вам, на все добре! 🤗
\`\`\`

### 6. ПІДТВЕРДЖЕННЯ ЗАМОВЛЕННЯ
- **Після отримання даних для доставки звіряєш замовлення з клієнтом:**
\`\`\`
Отже ваше замовлення:
📦 Товар: [назва] + [додатковий товар, якщо був обраний]
💰 Ціна: [ціна]
📍 Доставка: [номер відділення, місто отримувача]
👤 Отримувач: [ім'я, номер отримувача]

Все правильно? Можливо, бажаєте додати щось ще до вашого догляду? 🧴
\`\`\`
- **Клієнт відповідає "так, все вірно"(або подібне; якщо бажає додати щось, то повертаєшся до кроку 3):**
\`\`\`
Дякую за покупку 🤗 Ваше замовлення вже передано кур'єру — очікуйте доставку 📦
Незабаром надішлю ТТН для відстеження 🚀

‼️Перевіряйте цілісність посилки при отриманні. У разі пошкоджень — обов'язково складіть Акт невідповідності з кур'єром і зробіть фото. Компанія перевізник компенсує витрати 🙃 
*БЕЗ АКТУ ТРАНСПОРТНОЇ КОМПАНІЇ, ПРЕТЕНЗІЇ НЕ ПРИЙМАЮТЬСЯ*
Якщо у Вас виникнуть додаткові питання стосовно використання я завжди з радістю відповім на них 🤍  
з повагою, Леголас 💼
\`\`\` 

**Завершення та програмування майбутнього контакту**:\n\`\`\`
Дякую за ваше замовлення! Ми вже передали його в обробку. Очікуйте доставку протягом 1-2 днів, ТТН надішлю вам окремо 📦
\`\`\`

## ОБРОБКА ЗАПЕРЕЧЕНЬ
- "Дорого"\n\`\`\`
Розумію ваше питання щодо ціни 💰 Це професійний догляд з концентрованими формулами, який вистачає на 2-3 місяці. Результат видно вже з перших застосувань! Можемо розглянути меншу упаковку або аналог у нижчій ціновій категорії, якщо бажаєте? 🌿
\`\`\`
- "Я ще подумаю"\n\`\`\`
Звісно, розумію важливість зваженого рішення 🤔 Що саме викликає сумніви? Можливо, я зможу відповісти на додаткові питання або запропонувати альтернативу? Такий догляд — це інвестиція у здоров'я вашого волосся на тривалий час 💫
\`\`\`
- "Я бачив дешевше"\n\`\`\`
Дякую за вашу відвертість! 🙏 Можливо, ви бачили іншу формулу або стару серію. Наші засоби — це авторське виробництво з натуральними інгредієнтами вищої якості. Ми гарантуємо результат і надаємо безкоштовні консультації щодо використання 🛡️
\`\`\`
- "А якщо не підійде?"\n\`\`\`
Ваше занепокоєння цілком зрозуміле! 🤝 Ми підбираємо догляд індивідуально, враховуючи особливості волосся. 95% наших клієнтів бачать результат вже після першого застосування. Якщо засіб не підійде — ми завжди знайдемо рішення та запропонуємо альтернативу 💫
\`\`\`

## КРИТИЧНО ВАЖЛИВІ ПРАВИЛА
1. **НІКОЛИ** не надавай інформацію про товари без попереднього встановлення контакту і збору інформації.
2. **ЗАВЖДИ** дотримуйся структури AIDA: спочатку привертай увагу, потім викликай інтерес, створюй бажання і тільки потім спонукай до дії.
3. **ОБОВ'ЯЗКОВО** використовуй емодзі (рекомендовано 3-5 на кожне повідомлення, особливо в описі продуктів та закликах до дії) для візуального оформлення повідомлень та створення дружньої атмосфери 🤗🎉💖.
4. **ЗАВЖДИ** задавай відкриті питання для виявлення потреб: "Який ефект ви хочете отримати? 🤔", "З якою проблемою стикаєтесь? 😥", "Який тип волосся у вас? 🧐".
5. **НІКОЛИ** не пиши довгі повідомлення — кожне має бути до 700 символів.
6. Для отримання інформації про товари або підбору догляду **ЗАВЖДИ** використовуй інструмент \`productDatabaseExpertTool\`.
7. **ЗАВЖДИ** завершуй повідомлення питанням або закликом до дії.
8. **ЗАБОРОНЯЄТЬСЯ** використовувати фразу "дайте знати" — замість цього використовуй конкретні заклики: "Оформлюємо?", "Який об'єм підходить?", "Бажаєте замовити?", "Що скажете?".
9. **ЗАВЖДИ** пропонуй комплексні рішення, не обмежуйся одним продуктом.
10. **НІКОЛИ** не згадуй про "база даних", "субагент", "експерт по базі даних" або "інструмент". Ти відповідаєш строго та професійно, людина не повинна знати, що ти АІ АГЕНТ або використовуєш якісь технічні засоби.
11. Твій продукт має назву SORRY FOR MY HAIR, більше ніякі назви брендів ти не маєш.

## ТЕХНІЧНІ ПРИМІТКИ ДЛЯ РОБОТИ З ІНСТРУМЕНТАМИ

1.  **\`productDatabaseExpertTool\`**:
    *   **Призначення**: Отримання детальної інформації про товари, перевірка наявності, підбір комплексного догляду на основі анкети або опису проблеми клієнта.
    *   **Вхідні дані**: Текстовий запит, що описує, яку інформацію потрібно отримати (наприклад, "інформація про шампунь RecoNstruction", "підібрати догляд для сухого фарбованого волосся", "перевірити наявність маски X об'ємом Y").
    *   **Вихідні дані**: Ти повинен отриману відповідь від субагента переформулювати, та відповісти клієнту тільки основне: назва, короткий опис, ціни та обєми. Якшо користувач просить розповісти детальніше то розповідаєш детальніше.
    *   **ЗАБОРОНЯЮ** надавати посилання на товар, якшо користувач цього не просив.
    *   **Важливо**: ЗАВЖДИ використовуй цей інструмент, коли потрібна будь-яка інформація про товари, їх наявність, або коли потрібно підібрати догляд.

2.  **\`CRM_Orders\`**:
    *   **Призначення**: Запис фінальних деталей замовлення в CRM систему (таблиця INSTA_orders_CRM).
    *   **Вхідні дані**: Об'єкт з деталями замовлення (ключі мають точно відповідати колонкам таблиці):
        \`\`\`json
        {
          "name": "Петренко Ольга Іванівна",
          "phone": "+380981234567",
          "city": "Київ",
          "novaPost": "Відділення №45",
          "products": "Шампунь RecoNstruction 300 мл + Маска глибокого відновлення 200 мл",
          "totalPrice": "1250 грн"
        }
        \`\`\`
    *   **Вихідні дані**: Підтвердження успішного запису або повідомлення про помилку.
    *   **Важливо**: Використовуй цей інструмент ТІЛЬКИ ПІСЛЯ того, як клієнт підтвердив усі деталі замовлення та готовий його оформити.`;


// Схеми для інструментів LegolasAgent
const productDatabaseQuerySchema = z.object({
  query: z.string().describe("Запит для експерта по базі даних продуктів. Це може бути запит на інформацію про конкретний товар, підбір догляду на основі анкети/проблеми, або перевірка наявності."),
});

const crmOrderSchema = z.object({
  name: z.string().describe("Повне ім'я клієнта (ПІБ) для запису в CRM"),
  phone: z.string().describe("Номер телефону клієнта для запису в CRM"),
  city: z.string().describe("Місто доставки для запису в CRM"),
  novaPost: z.string().describe("Номер або адреса відділення Нової Пошти для запису в CRM"),
  products: z.string().describe("Перелік замовлених товарів з об'ємами для запису в CRM"),
  totalPrice: z.string().describe("Загальна вартість замовлення для запису в CRM"),
  // paymentMethod: z.string().optional().describe("Обраний спосіб оплати"), // Якщо ця колонка є в таблиці INSTA_orders_CRM
});


class LegolasAgent {
    private openai: Runnable<BaseLanguageModelInput, AIMessage, ChatOpenAICallOptions>;
    private openaiSplitter: ChatOpenAI;
    private sfmhBaseAgentInstance: SfmhBaseAgent;
    private tools: DynamicStructuredTool[];

    constructor() {
        this.sfmhBaseAgentInstance = new SfmhBaseAgent();

        const productDatabaseExpertTool = new DynamicStructuredTool({
            name: "productDatabaseExpertTool",
            description: "Запитує інформацію в експерта по базі даних продуктів SORRY FOR MY HAIR. Використовуй для отримання деталей про товари, їх наявності, або для підбору комплексного догляду на основі анкети/опису проблеми клієнта.",
            schema: productDatabaseQuerySchema,
            func: async ({ query }: z.infer<typeof productDatabaseQuerySchema>) => {
                console.log(`[LegolasAgent TOOL CALL] productDatabaseExpertTool викликано з запитом: ${query}`);
                try {
                    const result = await this.sfmhBaseAgentInstance.handleQuery(query);
                    return JSON.stringify(result);
                } catch (error) {
                    console.error("Помилка при виклику productDatabaseExpertTool:", error);
                    return JSON.stringify({ error: "Не вдалося отримати інформацію від експерта по базі даних." });
                }
            },
        });

        const CRMOrdersTool = new DynamicStructuredTool({
            name: "CRM_Orders",
            description: "Записує фінальні деталі замовлення клієнта в базу даних INSTA_orders_CRM.",
            schema: crmOrderSchema,
            func: async (orderDetails: z.infer<typeof crmOrderSchema>) => {
                console.log("[LegolasAgent TOOL CALL] CRM_Orders викликано з даними для запису в Supabase:", orderDetails);
                
                if (!supabaseCRMClient) {
                    console.error("CRM_Orders: Supabase client не ініціалізовано.");
                    return JSON.stringify({ success: false, message: "Помилка конфігурації: Supabase client для CRM не доступний." });
                }

                try {
                    // Дані для вставки, ключі об'єкта orderDetails мають збігатися з назвами колонок в INSTA_orders_CRM
                    const dataToInsert = {
                        name: orderDetails.name,
                        phone: orderDetails.phone,
                        city: orderDetails.city,
                        novaPost: orderDetails.novaPost,
                        products: orderDetails.products,
                        totalPrice: orderDetails.totalPrice,
                        // paymentMethod: orderDetails.paymentMethod, // Розкоментуйте, якщо є така колонка і вона в crmOrderSchema
                    };

                    const { data, error } = await supabaseCRMClient
                        .from("INSTA_Orders_CRM")
                        .insert([dataToInsert])
                        .select();

                    if (error) {
                        console.error("Помилка запису замовлення в Supabase INSTA_Orders_CRM (детально):", JSON.stringify(error, null, 2));
                        return JSON.stringify({ success: false, message: `Помилка збереження замовлення: ${error.message || 'Немає деталей помилки від Supabase.'}` });
                    }

                    console.log("Замовлення успішно записано в INSTA_Orders_CRM:", data);
                    return JSON.stringify({ success: true, message: "Замовлення успішно збережено.", orderData: data });
                } catch (e: any) {
                    console.error("Непередбачена помилка в CRM_Orders інструменті:", e);
                    return JSON.stringify({ success: false, message: `Внутрішня помилка інструменту: ${e.message}` });
                }
            },
        });
        
        this.tools = [productDatabaseExpertTool, CRMOrdersTool];

        const chatModel = new ChatOpenAI({
            apiKey: OPENAI_API_KEY,
            modelName: "gpt-4o",
            temperature: 0.3,
        });

        this.openai = chatModel.bindTools(this.tools);

        // Ініціалізація моделі для розбиття тексту
        this.openaiSplitter = new ChatOpenAI({
            apiKey: OPENAI_API_KEY,
            modelName: "gpt-4o-mini",
            temperature: 0.1,
        });

        console.log("LegolasAgent ініціалізовано з інструментами:", this.tools.map(t => t.name).join(", "));
        console.log("LegolasAgent splitter model ініціалізовано: gpt-4o-mini");
    }

    private async _splitMessageWithAI(textToSplit: string): Promise<string[]> {
        const SPLITTING_PROMPT = `Ти отримаєш текст, який може перевищувати 1000 символів, що є лімітом для Instagram API. Твоє завдання — логічно розділити цей текст на частини, кожна з яких НЕ ПЕРЕВИЩУЄ 980 символів (залишаємо невеликий буфер), щоб не втратити логічний сенс. Поверни результат у JSON форматі масиву рядків: \`{"parts": ["текст частина 1", "текст частина 2", ...]}\`. Повертай ТІЛЬКИ валідний JSON об'єкт, без жодних уточнень, пояснень, форматування markdown, пробілів чи будь-яких інших символів поза самим JSON об'єктом.`;
        
        try {
            console.log(`[LegolasAgent _splitMessageWithAI] Спроба розділити текст довжиною ${textToSplit.length}`);
            const response = await this.openaiSplitter.invoke([
                new SystemMessage(SPLITTING_PROMPT),
                new HumanMessage(textToSplit),
            ]);
            
            const rawContent = response.content.toString();
            console.log(`[LegolasAgent _splitMessageWithAI] Сира відповідь від моделі для розбиття: "${rawContent}"`);
            const content = rawContent.trim(); // Одразу видаляємо зайві пробіли на початку/кінці
            console.log(`[LegolasAgent _splitMessageWithAI] Відповідь від моделі для розбиття (після trim()): "${content}"`);

            let parsedResponse;
            try {
                // Спроба 1: Розпарсити напряму як JSON
                parsedResponse = JSON.parse(content);
            } catch (e) {
                console.warn("[LegolasAgent _splitMessageWithAI] Не вдалося розпарсити JSON напряму. Спроба знайти JSON в markdown блоці...", e);
                // Спроба 2: Якщо прямий парсинг не вдався, шукаємо ```json ... ```
                const markdownMatch = content.match(/```json\s*([\s\S]+?)\s*```/);
                if (markdownMatch && markdownMatch[1]) {
                    const jsonFromMarkdown = markdownMatch[1].trim();
                    console.log(`[LegolasAgent _splitMessageWithAI] Знайдено JSON в markdown блоці. Вміст: "${jsonFromMarkdown}"`);
                    try {
                        parsedResponse = JSON.parse(jsonFromMarkdown);
                    } catch (e2) {
                        console.error("[LegolasAgent _splitMessageWithAI] Помилка парсингу JSON з markdown блоку:", e2, "Вміст блоку:", jsonFromMarkdown);
                        return [textToSplit]; // Повертаємо оригінал, якщо нічого не вийшло
                    }
                } else {
                    console.error("[LegolasAgent _splitMessageWithAI] Не вдалося розпарсити JSON напряму і не знайдено JSON в markdown блоці.");
                    return [textToSplit]; // Повертаємо оригінал
                }
            }

            if (parsedResponse && Array.isArray(parsedResponse.parts)) {
                const validParts = parsedResponse.parts.filter((part: any) => part && typeof part === 'string' && cleanTextForInstagram(part).length <= 1000 && cleanTextForInstagram(part).length > 0);
                if (validParts.length === 0 && textToSplit.length > 0) {
                    console.warn("[LegolasAgent _splitMessageWithAI] Після фільтрації не залишилось валідних частин, або розбиття повернуло порожні частини. Повертаємо оригінальний текст.");
                    return [textToSplit];
                }
                if (validParts.length !== parsedResponse.parts.length) {
                     console.warn("[LegolasAgent _splitMessageWithAI] Деякі частини після розбиття були відфільтровані (порожні, занадто довгі або не рядки).");
                }
                console.log(`[LegolasAgent _splitMessageWithAI] Текст успішно розділено на ${validParts.length} валідних частин.`);
                return validParts.length > 0 ? validParts : [textToSplit];
            } else {
                console.error("[LegolasAgent _splitMessageWithAI] JSON розпарсено, але відсутнє поле 'parts' або воно не є масивом.", parsedResponse);
                return [textToSplit];
            }
        } catch (error) {
            console.error("[LegolasAgent _splitMessageWithAI] Помилка під час виклику моделі для розбиття:", error);
            return [textToSplit]; 
        }
    }

    public async handleMessage(senderId: string, messageText: string): Promise<void> {
        console.log(`LegolasAgent отримав повідомлення від ${senderId}: ${messageText}`);
        const history = await chatMemory.getMessages(senderId);
        const currentMessages: BaseMessage[] = [
            new SystemMessage(LEGOLAS_SYSTEM_PROMPT),
            ...history,
            new HumanMessage(messageText),
        ];

        try {
            let aiResponse = await this.openai.invoke(currentMessages);
            currentMessages.push(aiResponse);

            while (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                console.log("LegolasAgent (LLM) запросив виклик інструментів:", aiResponse.tool_calls);
                const toolMessages: ToolMessage[] = [];

                for (const toolCall of aiResponse.tool_calls) {
                    const toolCallId = toolCall.id ?? "";
                    const selectedTool = this.tools.find(
                        (t) => t.name === toolCall.name
                    );

                    if (selectedTool) {
                        try {
                            const toolOutput = await selectedTool.invoke(toolCall.args);
                            console.log(`LegolasAgent: результат інструменту ${toolCall.name}:`, toolOutput);
                            toolMessages.push(
                                new ToolMessage({
                                    tool_call_id: toolCallId,
                                    name: toolCall.name,
                                    content: toolOutput as string,
                                })
                            );
                        } catch (toolError: any) {
                            console.error(`Помилка при виконанні інструменту ${toolCall.name}:`, toolError);
                            toolMessages.push(
                                new ToolMessage({
                                    tool_call_id: toolCallId,
                                    name: toolCall.name,
                                    content: `Помилка: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
                                })
                            );
                        }
                    } else {
                        console.warn(`LegolasAgent: невідомий інструмент ${toolCall.name}`);
                        toolMessages.push(
                            new ToolMessage({
                                tool_call_id: toolCallId,
                                name: toolCall.name,
                                content: "Помилка: невідомий інструмент.",
                            })
                        );
                    }
                }
                currentMessages.push(...toolMessages);
                aiResponse = await this.openai.invoke(currentMessages);
                currentMessages.push(aiResponse);
            }

            const finalResponseText = aiResponse.content.toString();
            console.log(`LegolasAgent фінальна відповідь (до очищення та розбиття) для ${senderId}: ${finalResponseText}`);
            
            // Зберігаємо оригінальну повну відповідь в історію ДО будь-яких модифікацій для відправки
            await chatMemory.addMessage(senderId, new HumanMessage(messageText));
            await chatMemory.addMessage(senderId, new AIMessage(finalResponseText));

            const cleanedFullResponseText = cleanTextForInstagram(finalResponseText);
            console.log(`LegolasAgent фінальна відповідь (після очищення, перед перевіркою довжини) для ${senderId}, довжина ${cleanedFullResponseText.length}: ${cleanedFullResponseText}`);

            if (cleanedFullResponseText.length > 1000) {
                console.log(`[LegolasAgent handleMessage] Відповідь для ${senderId} перевищує 1000 символів (${cleanedFullResponseText.length}). Розбиваємо...`);
                // Передаємо оригінальний finalResponseText, оскільки _splitMessageWithAI очікує текст, який може містити markdown
                // а потім cleanTextForInstagram буде викликаний для кожної частини всередині sendInstagramMessage
                const messageParts = await this._splitMessageWithAI(finalResponseText); 

                if (messageParts.length === 1 && messageParts[0] === finalResponseText) {
                     console.warn(`[LegolasAgent handleMessage] Розбиття не вдалося або повернуло оригінальний текст для ${senderId}. Спроба надіслати як є (може бути помилка Instagram API).`);
                     // sendInstagramMessage всередині викличе cleanTextForInstagram для messageParts[0]
                     const sendResult = await sendInstagramMessage(senderId, messageParts[0]);
                     if (sendResult.error) {
                        console.error(`Не вдалося відправити (потенційно велику) відповідь в Instagram для ${senderId}: `, sendResult.error);
                     } else {
                        console.log(`(Потенційно велика) відповідь успішно надіслана в Instagram для ${senderId}, message_id: ${sendResult.message_id}`);
                     }
                } else {
                    console.log(`[LegolasAgent handleMessage] Відповідь для ${senderId} розділена на ${messageParts.length} частин.`);
                    for (let i = 0; i < messageParts.length; i++) {
                        const part = messageParts[i];
                        // cleanTextForInstagram буде викликаний всередині sendInstagramMessage
                        const sendResult = await sendInstagramMessage(senderId, part);
                        if (sendResult.error) {
                            console.error(`Не вдалося відправити частину ${i+1}/${messageParts.length} відповіді в Instagram для ${senderId}: `, sendResult.error);
                            // Тут можна додати логіку, щоб зупинити відправку інших частин або спробувати відправити решту
                        } else {
                            console.log(`Частина ${i+1}/${messageParts.length} відповіді успішно надіслана в Instagram для ${senderId}, message_id: ${sendResult.message_id}`);
                        }
                        if (i < messageParts.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Затримка 5 секунд між повідомленнями
                        }
                    }
                }
            } else {
                console.log(`[LegolasAgent handleMessage] Відповідь для ${senderId} НЕ перевищує 1000 символів (${cleanedFullResponseText.length}). Надсилаємо одним повідомленням.`);
                // cleanTextForInstagram буде викликаний всередині sendInstagramMessage
                const sendResult = await sendInstagramMessage(senderId, finalResponseText); 
                if (sendResult.error) {
                    console.error(`Не вдалося відправити відповідь в Instagram для ${senderId}: `, sendResult.error);
                } else {
                    console.log(`Відповідь успішно надіслана в Instagram для ${senderId}, message_id: ${sendResult.message_id}`);
                }
            }
            return; 

        } catch (error) {
            console.error(`Помилка в LegolasAgent при обробці повідомлення від ${senderId}: `, error);
            // Відправка повідомлення про помилку користувачу в Instagram
            try {
                await sendInstagramMessage(senderId, "Вибачте, сталася технічна помилка при обробці вашого запиту. Будь ласка, спробуйте пізніше. 😥");
            } catch (sendError) {
                console.error(`Критична помилка: не вдалося навіть відправити повідомлення про помилку для ${senderId}: `, sendError);
            }
        }
    }
}

export default LegolasAgent; 