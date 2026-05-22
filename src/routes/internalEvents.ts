import { Router, Request, Response } from 'express';
import { Telegraf, Context } from 'telegraf';
import { env } from '../env';
import { logger } from '../utils/logger';
import { consumeLinkToken, getLinkByToken } from '../services/linkService';
import { db } from '../db/client';
import { ensureUserSettings, markUserLinkedFromEvent, recordPlatformVisitNudge, canSendPlatformVisitNudge } from '../services/scheduleService';
import { logEvent } from '../services/eventService';
import { MSG } from '../bot/messages';
import { afterLinkKeyboard, inviteScheduleKeyboard, inviteReminderKeyboard, inviteLessonTimeKeyboard } from '../bot/keyboards';
import { buildLearningUrl } from '../services/platformApi';

function authCheck(req: Request, res: Response): boolean {
  if (req.headers.authorization !== `Bearer ${env.INTERNAL_TELEGRAM_API_KEY}`) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

export function createInternalEventsRouter(bot: Telegraf<Context>): Router {
  const router = Router();

  // POST /internal/telegram/linked — backend knows telegramChatId (e.g. after user registered)
  router.post('/internal/telegram/linked', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { telegramChatId, platformUserId, name, subscriptionStatus } = req.body as {
      telegramChatId?: string;
      platformUserId?: string;
      name?: string;
      subscriptionStatus?: string;
    };
    if (!telegramChatId || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await ensureUserSettings(platformUserId, telegramChatId);
    await markUserLinkedFromEvent(telegramChatId, platformUserId, subscriptionStatus);
    await logEvent(telegramChatId, 'account_linked', platformUserId);

    const platformUrl = buildLearningUrl('telegram', 'linked');
    await bot.telegram.sendMessage(
      telegramChatId,
      MSG.accountLinked(name),
      inviteScheduleKeyboard(platformUrl) as any
    ).catch((err) => {
      logger.warn('Could not notify user of link', { telegramChatId, error: err.message });
    });

    return res.json({ ok: true, telegramLinked: true, telegramChatId });
  });

  // POST /internal/telegram/consume-link-token — validate and consume a link token
  // Returns telegramChatId so the platform backend can store the association.
  // Does NOT send Telegram notification — caller should follow up with /internal/telegram/linked.
  router.post('/internal/telegram/consume-link-token', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { linkToken } = req.body as { linkToken?: string };
    if (!linkToken) {
      return res.status(400).json({ ok: false, code: 'MISSING_TOKEN' });
    }

    const link = await getLinkByToken(linkToken);

    if (!link) {
      return res.status(400).json({ ok: false, code: 'INVALID_TOKEN' });
    }
    if (link.status === 'linked') {
      return res.status(400).json({ ok: false, code: 'TOKEN_ALREADY_USED' });
    }
    if (link.status !== 'pending') {
      return res.status(400).json({ ok: false, code: 'INVALID_TOKEN' });
    }
    if (new Date() > link.expires_at) {
      await db.query(
        `UPDATE telegram_links SET status = 'expired', updated_at = NOW() WHERE link_token = $1`,
        [linkToken]
      );
      return res.status(400).json({ ok: false, code: 'TOKEN_EXPIRED' });
    }

    // Atomically mark as consumed (status='linked', platform_user_id remains NULL — set by /linked later)
    const result = await db.query<{ telegram_chat_id: string; telegram_user_id: string }>(
      `UPDATE telegram_links
       SET status = 'linked', used_at = NOW(), updated_at = NOW()
       WHERE link_token = $1 AND status = 'pending' AND expires_at > NOW()
       RETURNING telegram_chat_id, telegram_user_id`,
      [linkToken]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ ok: false, code: 'TOKEN_EXPIRED' });
    }

    return res.json({
      ok: true,
      telegramChatId: result.rows[0].telegram_chat_id,
      telegramUserId: result.rows[0].telegram_user_id,
    });
  });

  // POST /api/internal/telegram/link-confirmed — legacy link-token flow
  router.post('/api/internal/telegram/link-confirmed', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { linkToken, platformUserId, name } = req.body as {
      linkToken?: string;
      platformUserId?: string;
      name?: string;
    };
    if (!linkToken || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const result = await consumeLinkToken(linkToken, platformUserId);
    if (!result.ok) {
      const msgs: Record<string, string> = {
        expired: 'Link token expired',
        already_used: 'Link token already used',
        not_found: 'Link token not found',
        invalid_status: 'Link token in invalid state',
      };
      return res.status(400).json({ ok: false, error: result.reason, message: msgs[result.reason ?? ''] });
    }

    const { db } = require('../db/client');
    const linkRecord = await db.query(
      `SELECT telegram_chat_id FROM telegram_links WHERE link_token = $1`,
      [linkToken]
    );
    const chatId = linkRecord.rows[0]?.telegram_chat_id;

    if (chatId) {
      await ensureUserSettings(platformUserId, chatId);
      await markUserLinkedFromEvent(chatId, platformUserId);
      await logEvent(chatId, 'account_linked', platformUserId);

      const platformUrl = buildLearningUrl('telegram', 'linked');
      await bot.telegram.sendMessage(
        chatId,
        MSG.accountLinked(name),
        inviteScheduleKeyboard(platformUrl) as any
      ).catch((err) => {
        logger.warn('Could not notify user of link', { telegramChatId: chatId, error: err.message });
      });
    }

    return res.json({ ok: true, telegramLinked: true, telegramChatId: chatId });
  });

  // POST /internal/events/platform-visited
  router.post('/internal/events/platform-visited', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { telegramChatId, registered } = req.body as {
      telegramChatId?: string;
      registered?: boolean;
    };
    if (!telegramChatId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await logEvent(telegramChatId, 'platform_visited_event_received');

    // If already registered, use registered flow instead of visit nudge
    if (registered) {
      return res.json({ ok: true, action: 'skipped_already_registered' });
    }

    const canNudge = await canSendPlatformVisitNudge(telegramChatId);
    if (!canNudge) {
      return res.json({ ok: true, action: 'skipped_too_soon' });
    }

    await recordPlatformVisitNudge(telegramChatId);

    const platformUrl = buildLearningUrl('telegram', 'visit_nudge');
    await bot.telegram.sendMessage(
      telegramChatId,
      MSG.platformVisitedNudge,
      inviteReminderKeyboard(platformUrl) as any
    ).catch((err) => {
      logger.warn('Could not send platform visit nudge', { telegramChatId, error: err.message });
    });

    return res.json({ ok: true, action: 'nudge_sent' });
  });

  // POST /internal/events/user-registered
  router.post('/internal/events/user-registered', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { telegramChatId, platformUserId, name, subscriptionStatus } = req.body as {
      telegramChatId?: string;
      platformUserId?: string;
      name?: string;
      subscriptionStatus?: string;
    };
    if (!telegramChatId || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await markUserLinkedFromEvent(telegramChatId, platformUserId, subscriptionStatus);
    await logEvent(telegramChatId, 'user_registered_event_received', platformUserId);

    const platformUrl = buildLearningUrl('telegram', 'registered');
    await bot.telegram.sendMessage(
      telegramChatId,
      MSG.accountLinked(name),
      inviteScheduleKeyboard(platformUrl) as any
    ).catch((err) => {
      logger.warn('Could not send registration notification', { telegramChatId, error: err.message });
    });

    return res.json({ ok: true });
  });

  // POST /internal/events/paid-lesson-purchased
  router.post('/internal/events/paid-lesson-purchased', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { telegramChatId, platformUserId, lessonDurationMinutes } = req.body as {
      telegramChatId?: string;
      platformUserId?: string;
      lessonDurationMinutes?: number;
    };
    if (!telegramChatId || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    // Validate: bot never marks payment as successful — only trusts backend event
    if (lessonDurationMinutes && lessonDurationMinutes !== 50) {
      logger.warn('Ignoring non-50-minute lesson duration from backend', { telegramChatId, lessonDurationMinutes });
    }

    await markUserLinkedFromEvent(telegramChatId, platformUserId);
    await logEvent(telegramChatId, 'paid_lesson_purchased_event_received', platformUserId);

    const platformUrl = buildLearningUrl('telegram', 'paid_lesson');
    await bot.telegram.sendMessage(
      telegramChatId,
      MSG.paidLessonReady,
      inviteLessonTimeKeyboard(platformUrl) as any
    ).catch((err) => {
      logger.warn('Could not send paid lesson notification', { telegramChatId, error: err.message });
    });

    return res.json({ ok: true });
  });

  // POST /internal/events/subscription-updated
  router.post('/internal/events/subscription-updated', async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { telegramChatId, platformUserId, subscriptionStatus } = req.body as {
      telegramChatId?: string;
      platformUserId?: string;
      subscriptionStatus?: 'free' | 'active' | 'expired';
    };
    if (!telegramChatId || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await markUserLinkedFromEvent(telegramChatId, platformUserId, subscriptionStatus);

    return res.json({ ok: true });
  });

  return router;
}
