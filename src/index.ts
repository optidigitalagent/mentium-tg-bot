import './env'; // validates env first
import express from 'express';
import { env } from './env';
import { createBot } from './bot/bot';
import { db, testConnection } from './db/client';
import { runMigrations } from './db/migrate';
import { testRedisConnection } from './utils/redis';
import { startReminderWorker } from './workers/reminderWorker';
import { healthRouter } from './routes/health';
import { createWebhookRouter } from './routes/webhook';
import { createInternalEventsRouter } from './routes/internalEvents';
import { logger } from './utils/logger';

async function main() {
  logger.info('Bot starting', { nodeEnv: env.NODE_ENV, port: env.PORT });

  await testConnection();
  logger.info('Database connected');

  if (process.env.RUN_MIGRATIONS === 'true') {
    logger.info('Running migrations...');
    await runMigrations(db);
    logger.info('Migration complete');
  }

  await testRedisConnection();

  const bot = createBot();
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use(createInternalEventsRouter(bot));
  app.use(createWebhookRouter(bot));

  logger.info('Starting reminder worker');
  startReminderWorker(bot);

  if (env.TELEGRAM_USE_POLLING) {
    logger.info('Starting bot in polling mode');
    await bot.launch();
    logger.info('Bot startup complete');
  } else {
    if (!env.PUBLIC_BOT_URL) {
      logger.error('PUBLIC_BOT_URL is required when TELEGRAM_USE_POLLING=false');
      process.exit(1);
    }

    const webhookUrl = `${env.PUBLIC_BOT_URL}/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;

    logger.info('Registering webhook');
    try {
      await bot.telegram.setWebhook(webhookUrl);
      logger.info('Webhook registered', { webhookUrl });
    } catch (err: any) {
      logger.error('Webhook registration failed', {
        webhookUrl,
        error: err.message,
      });
    }
  }

  app.listen(env.PORT, () => {
    logger.info('HTTP server listening', { port: env.PORT });
    logger.info('Bot startup complete');
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await bot.stop('SIGTERM');
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start bot', { error: err.message, stack: err.stack });
  process.exit(1);
});