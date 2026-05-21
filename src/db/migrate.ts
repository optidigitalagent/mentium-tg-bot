import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { db } from './client';
import { logger } from '../utils/logger';

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (rows.length > 0) {
      logger.info(`Migration already applied, skipping: ${file}`);
      continue;
    }

    logger.info(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    logger.info(`Migration complete: ${file}`);
  }
}

async function main() {
  await runMigrations(db);
  await db.end();
  logger.info('All migrations complete');
}

if (require.main === module) {
  main().catch(err => {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  });
}
