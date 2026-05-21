import { Router, Request, Response } from 'express';
import { Telegraf, Context } from 'telegraf';
import { env } from '../env';
import { logger } from '../utils/logger';

function parseTelegramUpdate(body: unknown) {
  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString('utf8'));
  }
  if (typeof body === 'string') {
    return JSON.parse(body);
  }
  if (body && typeof body === 'object') {
    return body;
  }
  throw new Error('Invalid Telegram webhook body');
}

export function createWebhookRouter(bot: Telegraf<Context>): Router {
  const router = Router();

  router.post(
    `/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`,
    (req: Request, res: Response) => {
      let update;
      try {
        update = parseTelegramUpdate(req.body);
      } catch (err) {
        logger.warn('Webhook received invalid body', { error: (err as Error).message });
        res.sendStatus(400);
        return;
      }

      bot.handleUpdate(update, res).catch((err) => {
        logger.error('Webhook error', { error: err.message });
        res.sendStatus(500);
      });
    }
  );

  return router;
}
