import { Telegraf, Context } from 'telegraf';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { MSG } from './messages';
import {
  daysKeyboard,
  timeKeyboard,
  scheduleConfirmKeyboard,
  rescheduleKeyboard,
  openPlatformKeyboard,
  missedLessonKeyboard,
  remindLaterKeyboard,
  afterLinkKeyboard,
  welcomeKeyboard,
  scheduleSavedKeyboard,
  connectPlaceholderKeyboard,
} from './keyboards';
import {
  isAlreadyLinked,
  createLinkToken,
  getPlatformUserIdByChatId,
} from '../services/linkService';
import {
  upsertSchedule,
  getUserSettings,
  getActiveSchedule,
} from '../services/scheduleService';
import {
  scheduleRemindersForNextLesson,
  getMvpReminderOffsets,
} from '../services/reminderService';
import { notifyScheduleUpdated, buildLearningUrl, buildLinkUrl, buildStartLinkedUrl, buildStartUrl, buildConnectPlaceholderUrl } from '../services/platformApi';
import { logEvent } from '../services/eventService';
import { isValidTimeString } from '../utils/time';
import { logger } from '../utils/logger';
import { env } from '../env';

interface SessionData {
  scheduleStep?: 'days' | 'time' | 'time_manual' | 'confirm';
  scheduleDays?: Set<string>;
  scheduleTime?: string;
}

// In-memory session — replace with Redis-backed session for production
const sessions = new Map<string, SessionData>();

export function getSessions() {
  return sessions;
}

function getSession(chatId: string): SessionData {
  if (!sessions.has(chatId)) sessions.set(chatId, {});
  return sessions.get(chatId)!;
}

function clearSession(chatId: string) {
  sessions.delete(chatId);
}

export function registerCallbacks(bot: Telegraf<Context>) {
  bot.on('callback_query', async (ctx) => {
    const query = ctx.callbackQuery as CallbackQuery.DataQuery;
    if (!query.data) return;

    const chatId = String(ctx.chat?.id ?? query.message?.chat.id);
    const data = query.data;
    const session = getSession(chatId);

    await ctx.answerCbQuery().catch(() => {});

    // --- Discover More ---
    if (data === 'DISCOVER_MORE') {
      await logEvent(chatId, 'discover_clicked');
      return ctx.reply(MSG.discoverMore, require('./keyboards').discoverKeyboard(buildStartUrl()));
    }

    // --- Connect placeholder (tg-connect not yet live) ---
    if (data === 'CONNECT_PLACEHOLDER') {
      return ctx.reply(MSG.connectPlaceholder, connectPlaceholderKeyboard(buildConnectPlaceholderUrl()));
    }

    // --- Back to welcome ---
    if (data === 'BACK_TO_WELCOME') {
      return ctx.reply(MSG.welcome(), welcomeKeyboard(buildStartUrl()));
    }

    // --- Maybe later / set schedule later ---
    if (data === 'SET_SCHEDULE_LATER' || data === 'MAYBE_LATER') {
      clearSession(chatId);
      return ctx.reply(MSG.maybeLater);
    }

    // --- Connect trigger ---
    if (data === 'DO_CONNECT') {
      const linked = await isAlreadyLinked(chatId);
      if (linked) {
        return ctx.reply(MSG.alreadyLinked, afterLinkKeyboard());
      }
      const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
      await logEvent(chatId, 'link_created');
      return ctx.reply(MSG.notConnected, require('./keyboards').connectKeyboard(buildLinkUrl(token, 'connect')));
    }

    // --- Schedule wizard: start ---
    if (data === 'SCHEDULE_START') {
      const linked = await isAlreadyLinked(chatId);
      if (!linked) {
        const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
        return ctx.reply(MSG.notConnected, require('./keyboards').connectKeyboard(buildLinkUrl(token, 'schedule')));
      }
      session.scheduleStep = 'days';
      session.scheduleDays = new Set<string>();
      sessions.set(chatId, session);
      await logEvent(chatId, 'schedule_started');
      return ctx.reply(MSG.scheduleAskDays, daysKeyboard(new Set()));
    }

    // --- Reschedule: change days ---
    if (data === 'RESCHEDULE_DAYS') {
      const linked = await isAlreadyLinked(chatId);
      if (!linked) {
        const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
        return ctx.reply(MSG.notConnected, require('./keyboards').connectKeyboard(buildLinkUrl(token, 'schedule')));
      }
      session.scheduleStep = 'days';
      session.scheduleDays = new Set<string>();
      sessions.set(chatId, session);
      await logEvent(chatId, 'schedule_changed');
      return ctx.reply(MSG.scheduleAskDays, daysKeyboard(new Set()));
    }

    // --- Reschedule: change time only ---
    if (data === 'RESCHEDULE_TIME') {
      const linked = await isAlreadyLinked(chatId);
      if (!linked) {
        const token = await createLinkToken(String(ctx.from?.id), chatId, ctx.from?.username);
        return ctx.reply(MSG.notConnected, require('./keyboards').connectKeyboard(buildLinkUrl(token, 'schedule')));
      }
      const existingSchedule = await getActiveSchedule(chatId);
      if (existingSchedule) {
        const days: string[] = Array.isArray(existingSchedule.study_days)
          ? existingSchedule.study_days
          : JSON.parse(existingSchedule.study_days as any);
        session.scheduleStep = 'time';
        session.scheduleDays = new Set(days);
        sessions.set(chatId, session);
        await logEvent(chatId, 'schedule_changed');
        return ctx.reply(MSG.scheduleAskTime, timeKeyboard());
      }
      // No existing schedule — start fresh
      session.scheduleStep = 'days';
      session.scheduleDays = new Set<string>();
      sessions.set(chatId, session);
      return ctx.reply(MSG.scheduleAskDays, daysKeyboard(new Set()));
    }

    // --- Day selection ---
    if (data.startsWith('DAY_') && session.scheduleStep === 'days') {
      const day = data.replace('DAY_', '').toLowerCase();
      if (!session.scheduleDays) session.scheduleDays = new Set();

      if (session.scheduleDays.has(day)) {
        session.scheduleDays.delete(day);
      } else {
        session.scheduleDays.add(day);
      }
      sessions.set(chatId, session);

      await ctx.editMessageReplyMarkup(
        daysKeyboard(session.scheduleDays).reply_markup
      ).catch(() => {});
      return;
    }

    if (data === 'DAYS_DONE') {
      if (!session.scheduleDays || session.scheduleDays.size === 0) {
        return ctx.reply(MSG.scheduleNeedAtLeastOneDay);
      }
      session.scheduleStep = 'time';
      sessions.set(chatId, session);
      return ctx.reply(MSG.scheduleAskTime, timeKeyboard());
    }

    // --- Time selection ---
    if (data.startsWith('TIME_') && session.scheduleStep === 'time') {
      if (data === 'TIME_MANUAL') {
        session.scheduleStep = 'time_manual';
        sessions.set(chatId, session);
        return ctx.reply(MSG.scheduleManualTimePrompt);
      }

      const time = data.replace('TIME_', '').replace(/^(\d{2})(\d{2})$/, '$1:$2');
      session.scheduleTime = time;
      session.scheduleStep = 'confirm';
      sessions.set(chatId, session);

      const days = Array.from(session.scheduleDays ?? []);
      return ctx.reply(MSG.scheduleConfirm(days, time), scheduleConfirmKeyboard());
    }

    // --- Schedule confirm/save ---
    if (data === 'SCHEDULE_SAVE' && session.scheduleStep === 'confirm') {
      const platformUserId = await getPlatformUserIdByChatId(chatId);
      if (!platformUserId) {
        clearSession(chatId);
        return ctx.reply(MSG.accountNotLinked);
      }

      const userSettings = await getUserSettings(chatId);
      const timezone = userSettings?.timezone ?? env.DEFAULT_TIMEZONE;

      const days = Array.from(session.scheduleDays ?? []);
      const time = session.scheduleTime ?? '18:00';
      const reminders = getMvpReminderOffsets();

      const schedule = await upsertSchedule(platformUserId, chatId, {
        studyDays: days,
        studyTime: time,
        timezone,
        reminderOffsetsMinutes: reminders,
      });

      await notifyScheduleUpdated({
        telegramChatId: chatId,
        platformUserId,
        timezone,
        studyDays: days,
        studyTime: time,
        lessonDurationMinutes: 50,
        reminderOffsetsMinutes: reminders,
      });

      await scheduleRemindersForNextLesson(
        platformUserId,
        chatId,
        schedule.id,
        days,
        time,
        timezone,
        reminders
      );

      await logEvent(chatId, 'schedule_saved', platformUserId);
      clearSession(chatId);

      const platformUrl = buildLearningUrl('telegram', 'schedule_saved');
      return ctx.reply(MSG.schedulesSaved, scheduleSavedKeyboard(platformUrl));
    }

    if (data === 'SCHEDULE_EDIT') {
      session.scheduleStep = 'days';
      session.scheduleDays = new Set<string>();
      sessions.set(chatId, session);
      return ctx.reply(MSG.scheduleAskDays, daysKeyboard(new Set()));
    }

    if (data === 'SCHEDULE_CANCEL') {
      clearSession(chatId);
      return ctx.reply(MSG.scheduleCancelled);
    }

    // --- Missed lesson ---
    if (data === 'MISSED_TODAY') {
      return ctx.reply(MSG.missedTodayAck);
    }
    if (data === 'MISSED_TOMORROW') {
      return ctx.reply(MSG.missedTomorrowAck);
    }

    // --- Remind later ---
    if (data === 'REMIND_15' || data === 'REMIND_60' || data === 'REMIND_TOMORROW') {
      return ctx.reply(MSG.remindLaterAck);
    }
  });

  // Handle manual time input
  bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = getSession(chatId);
    const text = ctx.message.text.trim();

    if (session.scheduleStep === 'time_manual') {
      if (!isValidTimeString(text)) {
        return ctx.reply(MSG.scheduleInvalidTime);
      }

      session.scheduleTime = text;
      session.scheduleStep = 'confirm';
      sessions.set(chatId, session);

      const days = Array.from(session.scheduleDays ?? []);
      return ctx.reply(MSG.scheduleConfirm(days, text), scheduleConfirmKeyboard());
    }
  });
}
