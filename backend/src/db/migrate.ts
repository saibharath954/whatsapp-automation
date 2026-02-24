import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPool, transaction } from './index'; // Adjust path if needed
import { logger } from '../utils/logger';

async function migrate() {
    const pool = getPool();
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort(); // lexicographic sort ensures 001 < 002 < 003...

    logger.info(`Found ${files.length} migration files`);

    // Ensure migrations_history table exists before checking it
    await pool.query(`
        CREATE TABLE IF NOT EXISTS migrations_history (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    for (const file of files) {
        const filePath = join(migrationsDir, file);
        const sql = readFileSync(filePath, 'utf-8');

        try {
            // Check if this migration has already been applied
            const { rows } = await pool.query(
                'SELECT id FROM migrations_history WHERE filename = $1',
                [file]
            );

            if (rows.length > 0) {
                logger.info(`⏭️  ${file} — already applied, skipping`);
                continue; // Skip to the next file
            }

            // Execute the migration AND log it in the history table inside ONE transaction
            await transaction(async (client) => {
                await client.query(sql);
                await client.query(
                    'INSERT INTO migrations_history (filename) VALUES ($1)',
                    [file]
                );
            });

            logger.info(`✅ ${file} — applied successfully`);
        } catch (error: any) {
            logger.error({ error, file }, `❌ ${file} — failed. Transaction rolled back.`);
            throw error; // Stop the entire process immediately on first failure
        }
    }

    logger.info('All migrations complete');
    await pool.end();
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});