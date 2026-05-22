import { Worker, Job } from 'bullmq';
import { Telegraf, Context } from 'telegraf';
import { env, FIXED_LESSON_DURATION_MINUTES } from '../env';
import { MSG } from '../bot/messages';
import {
  reminderActionKeyboard,
  openPlatformKeyboard,
  missedLessonKeyboard,
  remindLaterKeyboard,
} from '../bot/keyboards';
import { markReminderSent, markReminderFailed } from '../services/reminderService';
import { getUserSummary, buildLearningUrl, buildReminderUrl } from '../services/platformApi';
import { logEvent } from '../services/eventService';
import { getUserSettings } from '../services/scheduleService';
import { logger } from '../utils/logger';
import { formatLocalTime } from '../utils/time';
import { DateTime } from 'luxon';
import { getRedisConnection } from '../utils/redis';

interface ReminderJobData {
  jobId?: string;
  telegramChatId: string;
  platformUserId: string;
  reminderType: string;
  lessonStartUtc?: string;
}

const connection = getRedisConnection();

export function startReminderWorker(bot: Telegraf<Context>) {
  const worker = new Worker<ReminderJobData>(
    'reminders',
    async (job: Job<ReminderJobData>) => {
      const { jobId, telegramChatId, platformUserId, reminderType, lessonStartUtc } = job.data;

      const settings = await getUserSettings(telegramChatId);
      if (!settings?.is_enabled) {
        logger.info('Reminders disabled for user, skipping', { telegramChatId });
        return;
      }

      const summary = await getUserSummary(telegramChatId);
      const timezone = settings?.timezone ?? env.DEFAULT_TIMEZONE;

      let lessonTimeLocal = '18:00';
      if (lessonStartUtc) {
        lessonTimeLocal = formatLocalTime(DateTime.fromISO(lessonStartUtc), timezone);
      }

      try {
        switch (reminderType) {
          case 'day_of_lesson': {
            const url = buildReminderUrl('day_of_lesson');
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.dayOfLessonReminder(lessonTimeLocal),
              reminderActionKeyboard(url) as any
            );
            break;
          }

          case 'day_before': {
            const url = buildReminderUrl('day_before');
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.dayBeforeReminder(summary?.currentSectionTitle ?? null, lessonTimeLocal),
              reminderActionKeyboard(url) as any
            );
            break;
          }

          case 'hour_before': {
            const url = buildReminderUrl('hour_before');
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.hourBeforeReminder(),
              reminderActionKeyboard(url) as any
            );
            break;
          }

          case 'fifteen_min_before': {
            const url = buildReminderUrl('fifteen_min');
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.fifteenMinReminder(),
              openPlatformKeyboard(url, 'Open Mentium') as any
            );
            break;
          }

          case 'lesson_start': {
            const url = buildReminderUrl('lesson_start');
            const { Markup } = require('telegraf');
            const keyboard = Markup.inlineKeyboard([
              [Markup.button.url('Open Mentium', url)],
              [Markup.button.callback('Remind me later', 'REMIND_LATER_OPTIONS')],
            ]);
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.lessonStartReminder(),
              keyboard
            );
            break;
          }

          case 'inactivity': {
            const url = buildReminderUrl('inactivity');
            const { Markup } = require('telegraf');
            const keyboard = Markup.inlineKeyboard([
              [Markup.button.url('Open Mentium', url)],
              [Markup.button.callback('Change schedule', 'SCHEDULE_START')],
            ]);
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.inactivity3Days,
              keyboard
            );
            await logEvent(telegramChatId, 'inactivity_nudge_sent', platformUserId);
            break;
          }

          case 'interrupted_lesson': {
            const url = buildReminderUrl('interrupted');
            const { Markup } = require('telegraf');
            const keyboard = Markup.inlineKeyboard([
              [Markup.button.url('Open Mentium', url)],
              [Markup.button.callback('Reschedule', 'SCHEDULE_START')],
              [Markup.button.callback('Remind me tomorrow', 'REMIND_TOMORROW')],
            ]);
            await bot.telegram.sendMessage(
              telegramChatId,
              MSG.interruptedLesson,
              keyboard
            );
            await logEvent(telegramChatId, 'interrupted_lesson_followup_sent', platformUserId);
            break;
          }
        }

        await logEvent(telegramChatId, 'reminder_sent', platformUserId, { reminderType });
        if (jobId) await markReminderSent(jobId);
      } catch (err: any) {
        if (err?.response?.error_code === 403) {
          logger.warn('Bot blocked, disabling reminders', { telegramChatId });
          await logEvent(telegramChatId, 'bot_blocked', platformUserId);
          const { disableReminders } = require('../services/scheduleService');
          await disableReminders(telegramChatId);
        } else {
          logger.error('Reminder send failed', { telegramChatId, reminderType, error: err.message });
          if (jobId) await markReminderFailed(jobId, err.message);
          throw err; // allow BullMQ retry
        }
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error('Reminder job failed permanently', { jobId: job?.id, error: err.message });
  });

  logger.info('Reminder worker started');
  return worker;
}
