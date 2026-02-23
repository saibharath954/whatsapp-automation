import { Pool, PoolConfig } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        const poolConfig: PoolConfig = {
            connectionString: config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        };
        pool = new Pool(poolConfig);
        pool.on('error', (err) => {
            logger.error({ err }, 'Unexpected database pool error');
        });
    }
    return pool;
}

export async function query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
): Promise<T[]> {
    const start = Date.now();
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    logger.debug({ query: text.slice(0, 100), duration, rows: result.rowCount }, 'DB query');
    return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] || null;
}

export async function transaction<T>(
    fn: (client: ReturnType<Pool['connect']> extends Promise<infer C> ? C : never) => Promise<T>
): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
