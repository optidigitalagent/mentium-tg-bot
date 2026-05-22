import { Markup } from 'telegraf';
import { env } from '../env';

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = typeof DAYS[number];

const DAY_LABELS: Record<Day, string> = {
  monday: 'Пн',
  tuesday: 'Вт',
  wednesday: 'Ср',
  thursday: 'Чт',
  friday: 'Пт',
  saturday: 'Сб',
  sunday: 'Нд',
};

export function welcomeKeyboard(openMentiumUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open Mentium', openMentiumUrl)],
    [Markup.button.callback('Дізнатися більше', 'DISCOVER_MORE')],
  ]);
}

export function discoverKeyboard(openMentiumUrl: string, connectUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open Mentium', openMentiumUrl)],
    [Markup.button.url('Підключити акаунт', connectUrl)],
    [Markup.button.callback('Назад', 'BACK_TO_WELCOME')],
  ]);
}

export function inviteScheduleKeyboard(platformUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Налаштувати розклад', 'SCHEDULE_START')],
    [Markup.button.url('Open Mentium', platformUrl)],
    [Markup.button.callback('Пізніше', 'MAYBE_LATER')],
  ]);
}

export function inviteReminderKeyboard(platformUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Налаштувати нагадування', 'SCHEDULE_START')],
    [Markup.button.url('Open Mentium', platformUrl)],
    [Markup.button.callback('Пізніше', 'MAYBE_LATER')],
  ]);
}

export function inviteLessonTimeKeyboard(platformUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Обрати час уроку', 'SCHEDULE_START')],
    [Markup.button.url('Open Mentium', platformUrl)],
    [Markup.button.callback('Пізніше', 'MAYBE_LATER')],
  ]);
}

export function alreadyLinkedKeyboard(platformUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open Mentium', platformUrl)],
    [Markup.button.callback('Змінити розклад', 'SCHEDULE_START')],
  ]);
}

export function afterLinkKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Налаштувати розклад', 'SCHEDULE_START')],
    [Markup.button.url('Open Mentium', env.PLATFORM_FRONTEND_URL)],
    [Markup.button.callback('Пізніше', 'MAYBE_LATER')],
  ]);
}

export function daysKeyboard(selected: Set<string>) {
  const dayList: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const row1 = dayList.slice(0, 3).map(d =>
    Markup.button.callback(selected.has(d) ? `✅ ${DAY_LABELS[d]}` : DAY_LABELS[d], `DAY_${d.toUpperCase()}`)
  );
  const row2 = dayList.slice(3, 6).map(d =>
    Markup.button.callback(selected.has(d) ? `✅ ${DAY_LABELS[d]}` : DAY_LABELS[d], `DAY_${d.toUpperCase()}`)
  );
  const row3 = [
    Markup.button.callback(selected.has('sunday') ? `✅ Нд` : 'Нд', 'DAY_SUNDAY'),
    Markup.button.callback('Готово', 'DAYS_DONE'),
  ];
  return Markup.inlineKeyboard([row1, row2, row3]);
}

export function timeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('08:00', 'TIME_0800'), Markup.button.callback('12:00', 'TIME_1200')],
    [Markup.button.callback('18:00', 'TIME_1800'), Markup.button.callback('20:00', 'TIME_2000')],
    [Markup.button.callback('Ввести вручну', 'TIME_MANUAL')],
  ]);
}

export function scheduleConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Зберегти розклад', 'SCHEDULE_SAVE')],
    [Markup.button.callback('Змінити', 'SCHEDULE_EDIT')],
    [Markup.button.callback('Скасувати', 'SCHEDULE_CANCEL')],
  ]);
}

export function rescheduleKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Змінити дні', 'RESCHEDULE_DAYS')],
    [Markup.button.callback('Змінити час', 'RESCHEDULE_TIME')],
    [Markup.button.callback('Скасувати', 'SCHEDULE_CANCEL')],
  ]);
}

export function openPlatformKeyboard(url: string, label: string = 'Open Mentium') {
  return Markup.inlineKeyboard([[Markup.button.url(label, url)]]);
}

export function reminderActionKeyboard(openUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open Mentium', openUrl)],
    [Markup.button.callback('Змінити час', 'RESCHEDULE_TIME')],
  ]);
}

export function missedLessonKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Перенести на сьогодні', 'MISSED_TODAY')],
    [Markup.button.callback('Перенести на завтра', 'MISSED_TOMORROW')],
    [Markup.button.url('Open Mentium', env.PLATFORM_FRONTEND_URL)],
  ]);
}

export function remindLaterKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Через 15 хвилин', 'REMIND_15')],
    [Markup.button.callback('Через 1 годину', 'REMIND_60')],
    [Markup.button.callback('Завтра', 'REMIND_TOMORROW')],
  ]);
}

export function connectKeyboard(linkUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Підключити акаунт', linkUrl)],
    [Markup.button.url('Open Mentium', env.PLATFORM_FRONTEND_URL)],
  ]);
}

export function expiredLinkKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Нове посилання', 'DO_CONNECT')]]);
}

export function scheduleSavedKeyboard(platformUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open Mentium', platformUrl)],
    [Markup.button.callback('Змінити час', 'RESCHEDULE_TIME')],
  ]);
}
