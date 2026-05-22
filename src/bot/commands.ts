import { Telegraf, Context } from 'telegraf';
import { MSG } from './messages';
import {
  welcomeKeyboard,
  alreadyLinkedKeyboard,
  connectKeyboard,
  openPlatformKeyboard,
  rescheduleKeyboard,
} from './keyboards';
import {
  createLinkToken,
  isAlreadyLinked,
} from '../services/linkService';
import {
  getActiveSchedule,
  disableReminders,
} from '../services/scheduleService';
import { getUserSummary, getNextLessonLink, buildLinkUrl, buildLearningUrl, buildStartLinkedUrl, buildStartUrl } from '../services/platformApi';
import { logEvent } from '../services/eventService';

const RATE_LIMIT_MAP = new Map<string, number>();

function isRateLimited(chatId: string): boolean {
  const last = RATE_LIMIT_MAP.get(chatId);
  if (last && Date.now() - last < 10_000) return true;
  RATE_LIMIT_MAP.set(chatId, Date.now());
  return false;
}

export function registerCommands(bot: Telegraf<Context>) {
  bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const from = ctx.from;

    if (isRateLimited(chatId)) return;

    await logEvent(chatId, 'bot_started', null, { username: from?.username });

    return ctx.reply(MSG.welcome(), welcomeKeyboard(buildStartUrl()));
  });

  bot.command('connect', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const from = ctx.from;

    if (isRateLimited(chatId)) return;

    const linked = await isAlreadyLinked(chatId);
    if (linked) {
      const platformUrl = buildStartLinkedUrl();
      return ctx.reply(MSG.alreadyLinked, alreadyLinkedKeyboard(platformUrl));
    }

    const token = await createLinkToken(
      String(from?.id),
      chatId,
      from?.username,
      from?.first_name,
      from?.last_name
    );

    await logEvent(chatId, 'link_created');
    const linkUrl = buildLinkUrl(token, 'connect');
    return ctx.reply(MSG.notConnected, connectKeyboard(linkUrl));
  });

  bot.command('schedule', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await isAlreadyLinked(chatId);
    if (!linked) {
      const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
      return ctx.reply(MSG.notConnected, connectKeyboard(buildLinkUrl(token, 'schedule')));
    }
    const sessions = require('./callbacks').getSessions();
    const session = sessions.get(chatId) ?? {};
    session.scheduleStep = 'days';
    session.scheduleDays = new Set<string>();
    sessions.set(chatId, session);
    await logEvent(chatId, 'schedule_started');
    return ctx.reply(MSG.scheduleAskDays, require('./keyboards').daysKeyboard(new Set()));
  });

  bot.command('reschedule', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await isAlreadyLinked(chatId);
    if (!linked) {
      const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
      return ctx.reply(MSG.notConnected, connectKeyboard(buildLinkUrl(token, 'reschedule')));
    }
    const schedule = await getActiveSchedule(chatId);
    if (!schedule) {
      const sessions = require('./callbacks').getSessions();
      const session = sessions.get(chatId) ?? {};
      session.scheduleStep = 'days';
      session.scheduleDays = new Set<string>();
      sessions.set(chatId, session);
      await logEvent(chatId, 'schedule_started');
      return ctx.reply(MSG.scheduleAskDays, require('./keyboards').daysKeyboard(new Set()));
    }
    const days: string[] = Array.isArray(schedule.study_days) ? schedule.study_days : JSON.parse(schedule.study_days as any);
    return ctx.reply(MSG.currentSchedule(days, schedule.study_time), rescheduleKeyboard());
  });

  bot.command('status', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await isAlreadyLinked(chatId);
    if (!linked) {
      const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
      return ctx.reply(MSG.notConnected, connectKeyboard(buildLinkUrl(token, 'status')));
    }

    const summary = await getUserSummary(chatId);
    if (!summary) {
      return ctx.reply(MSG.statusLoadError);
    }

    const schedule = await getActiveSchedule(chatId);
    const platformUrl = buildStartUrl();
    return ctx.reply(MSG.status(summary, schedule ?? undefined), alreadyLinkedKeyboard(platformUrl));
  });

  bot.command('next', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await isAlreadyLinked(chatId);
    if (!linked) {
      const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
      return ctx.reply(MSG.notConnected, connectKeyboard(buildLinkUrl(token, 'next')));
    }

    const link = await getNextLessonLink(chatId);
    const url = link?.url ?? buildLearningUrl('telegram', 'next');
    const label = link?.label ?? 'Open Mentium';
    return ctx.reply(MSG.nextLesson, openPlatformKeyboard(url, label));
  });

  bot.command('stop', async (ctx) => {
    const chatId = String(ctx.chat.id);
    await disableReminders(chatId);
    return ctx.reply(MSG.remindersDisabled);
  });

  bot.command('help', async (ctx) => {
    return ctx.reply(MSG.help);
  });
}
