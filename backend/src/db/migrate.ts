import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from '../db';
import { logger } from '../utils/logger';

async function migrate() {
    const pool = getPool();
    const migrationPath = join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    logger.info('Running database migrations...');

    try {
        await pool.query(sql);
        logger.info('✅ Migrations completed successfully');
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            logger.info('Schema already exists, skipping migration');
        } else {
            logger.error({ error }, '❌ Migration failed');
            throw error;
        }
    } finally {
        await pool.end();
    }
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
