import { Pool } from 'pg';
import {
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_DATABASE,
    CHAT_HISTORY_LENGTH
} from '../config/env';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// Тип для повідомлення, що зберігається в БД
interface StoredMessage {
    type: 'human' | 'ai';
    content: string;
}

export class PostgresChatMemory {
    private pool: Pool;
    private tableName = 'n8n_directbot'; // Назва твоєї таблиці
    private historyLength = CHAT_HISTORY_LENGTH;

    constructor() {
        this.pool = new Pool({
            host: POSTGRES_HOST,
            port: POSTGRES_PORT,
            user: POSTGRES_USER,
            password: POSTGRES_PASSWORD,
            database: POSTGRES_DATABASE,
            ssl: { 
                rejectUnauthorized: false // Повертаємо для локальної розробки
            }
        });
        this.ensureTableExists();
    }

    private async ensureTableExists(): Promise<void> {
        // Цей запит адаптовано до структури твоєї таблиці n8n_directbot
        // id SERIAL PRIMARY KEY - автоінкрементний ID для кожного запису
        // session_id VARCHAR(255) NOT NULL - ID сесії (користувача)
        // message JSONB NOT NULL - саме повідомлення у форматі JSONB
        // created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP - час створення
        const query = 
            'CREATE TABLE IF NOT EXISTS ' + this.tableName + ' (' +
            'id SERIAL PRIMARY KEY,' +
            'session_id VARCHAR(255) NOT NULL,' +
            'message JSONB NOT NULL,' +
            'created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' +
            ');';
        try {
            await this.pool.query(query);
            console.log(`Таблиця '${this.tableName}' успішно перевірена/створена.`);
        } catch (error) {
            console.error(`Помилка під час створення/перевірки таблиці '${this.tableName}':`, error);
            // В ідеалі тут потрібна краща обробка помилок, можливо, зупинка додатку
        }
    }

    async getMessages(sessionId: string): Promise<BaseMessage[]> {
        const query = 
            'SELECT message FROM ' + this.tableName +
            ' WHERE session_id = $1' +
            ' ORDER BY created_at DESC' +
            ' LIMIT $2;';
        try {
            const res = await this.pool.query(query, [sessionId, this.historyLength]);
            // Повертаємо повідомлення у хронологічному порядку (старіші перші)
            const storedMessages: StoredMessage[] = res.rows.map((row: { message: StoredMessage }) => row.message).reverse();
            
            return storedMessages.map(msg => {
                if (msg.type === 'human') {
                    return new HumanMessage(msg.content);
                } else {
                    return new AIMessage(msg.content);
                }
            });
        } catch (error) {
            console.error('Помилка отримання повідомлень з PostgreSQL:', error);
            return [];
        }
    }

    async addMessage(sessionId: string, message: BaseMessage): Promise<void> {
        let storedMessage: StoredMessage;

        if (message._getType() === 'human') {
            storedMessage = { type: 'human', content: message.content.toString() };
        } else if (message._getType() === 'ai') {
            storedMessage = { type: 'ai', content: message.content.toString() };
        } else {
            console.warn(`Непідтримуваний тип повідомлення для збереження: ${message._getType()}`);
            return;
        }

        const query = 
            'INSERT INTO ' + this.tableName + ' (session_id, message)' +
            ' VALUES ($1, $2);';
        try {
            await this.pool.query(query, [sessionId, JSON.stringify(storedMessage)]);
        } catch (error) {
            console.error('Помилка додавання повідомлення в PostgreSQL:', error);
        }
    }

    // Метод для очищення історії (може знадобитися для тестів або адміністрування)
    async clearHistory(sessionId: string): Promise<void> {
        const query = 'DELETE FROM ' + this.tableName + ' WHERE session_id = $1;';
        try {
            await this.pool.query(query, [sessionId]);
            console.log(`Історія для сесії ${sessionId} очищена.`);
        } catch (error) {
            console.error(`Помилка очищення історії для сесії ${sessionId}:`, error);
        }
    }
}

// Експортуємо екземпляр, щоб він був сінглтоном
export const chatMemory = new PostgresChatMemory(); 