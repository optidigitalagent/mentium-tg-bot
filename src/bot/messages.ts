import { FIXED_LESSON_DURATION_MINUTES } from '../env';
import { UserSummary } from '../services/platformApi';

const UA_DAY_SHORT: Record<string, string> = {
  monday: 'Пн',
  tuesday: 'Вт',
  wednesday: 'Ср',
  thursday: 'Чт',
  friday: 'Пт',
  saturday: 'Сб',
  sunday: 'Нд',
};

function formatDays(days: string[]): string {
  return days.map(d => UA_DAY_SHORT[d] ?? d).join(', ');
}

export const MSG = {
  welcome: () =>
    `Вітаю в Mentium 👋\n\n` +
    `Mentium — це платформа для структурованих уроків англійської з AI-викладачем.\n\n` +
    `Цей бот допоможе:\n• відкрити платформу\n• підключити акаунт\n• налаштувати нагадування про уроки\n\n` +
    `Самі уроки проходять на платформі Mentium.`,

  discoverMore:
    `Mentium — це не чат-бот для випадкових повідомлень.\n\n` +
    `Це платформа, де ти проходиш структуровані 50-хвилинні уроки англійської з AI-викладачем.\n\n` +
    `Фокус Mentium:\n• speaking practice\n• послідовні уроки\n• зрозумілий прогрес\n• регулярність у навчанні\n\n` +
    `Telegram-бот лише допомагає з навігацією, підключенням акаунта та нагадуваннями.\n\n` +
    `Відео скоро буде доступне.`,

  accountLinked: (_name?: string) =>
    `Акаунт Mentium підключено ✅\n\nХочеш налаштувати нагадування про уроки?`,

  alreadyLinked: `Твій акаунт Mentium вже підключено.`,

  linkExpired: `Посилання для підключення недійсне.\n\nНатисни /connect, щоб створити нове.`,

  linkInvalid: `Посилання для підключення недійсне або вже використане.\n\nНатисни /connect, щоб створити нове.`,

  platformVisitedNudge:
    `Бачу, ти відкрив Mentium 👀\n\n` +
    `Хочеш, я допоможу налаштувати нагадування, щоб не пропустити перший урок?`,

  paidLessonReady:
    `Твій оплачений урок готовий 🎉\n\n` +
    `Обери зручний день і час — я нагадаю тобі перед уроком.\n\n` +
    `Тривалість уроку: ${FIXED_LESSON_DURATION_MINUTES} хвилин.`,

  scheduleAskDays:
    `Коли тобі зручно займатися?\n\nСпочатку обери день або кілька днів для уроків.`,

  scheduleNeedAtLeastOneDay: `Обери хоча б один день для уроку.`,

  scheduleAskTime:
    `О котрій годині тобі зручно починати урок?\n\nЧас вказується за твоїм локальним часовим поясом.`,

  scheduleManualTimePrompt: `Напиши час у форматі 24 години.\n\nНаприклад:\n18:30`,

  scheduleInvalidTime: `Не схоже на правильний час.\n\nВведи час у форматі HH:MM, наприклад:\n18:30`,

  scheduleConfirm: (days: string[], time: string) =>
    `Перевір розклад:\n\n` +
    `Дні: ${formatDays(days)}\n` +
    `Час: ${time}\n` +
    `Тривалість уроку: ${FIXED_LESSON_DURATION_MINUTES} хвилин\n\n` +
    `Я нагадаю:\n• у день уроку\n• за 1 годину до початку\n\n` +
    `Зберегти?`,

  schedulesSaved: `Готово ✅\n\nЯ нагадаю тобі перед уроком у Mentium.`,

  scheduleCancelled: `Налаштування скасовано. Використай /schedule, щоб повернутися до цього пізніше.`,

  scheduleNotSet: `Розклад ще не встановлено. Використай /schedule.`,

  currentSchedule: (days: string[], time: string) =>
    `Твій поточний розклад:\n\n` +
    `Дні: ${formatDays(days)}\n` +
    `Час: ${time}\n` +
    `Тривалість уроку: ${FIXED_LESSON_DURATION_MINUTES} хвилин\n\n` +
    `Що хочеш змінити?`,

  remindersDisabled:
    `Нагадування вимкнено.\n\nТи можеш знову налаштувати їх у будь-який момент через /schedule.`,

  notConnected:
    `Твій Telegram ще не підключено до Mentium.\n\nПідключення потрібне, щоб бот міг надсилати корисні нагадування.`,

  status: (s: UserSummary, schedule?: { study_time: string; study_days: string[] }) => {
    const nextLesson = schedule
      ? `Наступний урок: ${formatDays(schedule.study_days)} о ${schedule.study_time}`
      : 'Розклад не встановлено';
    return (
      `Статус Mentium:\n\n` +
      `Акаунт: підключено\n` +
      `План: ${s.subscriptionStatus}\n` +
      `Уроків завершено: ${s.lessonsCompleted}\n` +
      `${nextLesson}\n\n` +
      `Тривалість уроку: ${FIXED_LESSON_DURATION_MINUTES} хвилин`
    );
  },

  statusLoadError: `Не вдалося отримати статус. Спробуй пізніше.`,

  nextLesson: `Твій наступний урок у Mentium готовий.`,

  dayOfLessonReminder: (studyTime: string) =>
    `Сьогодні день твого уроку в Mentium 📚\n\n` +
    `Початок: ${studyTime}\n` +
    `Тривалість: ${FIXED_LESSON_DURATION_MINUTES} хвилин.`,

  hourBeforeReminder: () =>
    `Твій урок у Mentium почнеться за 1 годину ⏰\n\n` +
    `Підготуйся до ${FIXED_LESSON_DURATION_MINUTES}-хвилинного уроку англійської.`,

  dayBeforeReminder: (topicTitle: string | null, studyTime: string) =>
    `📚 Завтра у тебе урок у Mentium.\n\n` +
    `Тема: ${topicTitle || 'Продовжуємо навчання'}\n` +
    `Час: ${studyTime}\n` +
    `Тривалість: ${FIXED_LESSON_DURATION_MINUTES} хвилин\n\n` +
    `Я нагадаю ще раз перед початком.`,

  fifteenMinReminder: () =>
    `Залишилось 15 хвилин ⏰\n\nТвій урок розпочнеться зовсім скоро.`,

  lessonStartReminder: () =>
    `Час твого уроку настав 🚀\n\nГотовий?`,

  missedLesson:
    `Схоже, сьогоднішній урок пропущено.\n\nХочеш перенести?`,

  interruptedLesson:
    `Схоже, урок міг бути перерваний.\n\nХочеш продовжити пізніше?`,

  inactivity3Days:
    `Ти не займався вже 3 дні.\n\nКороткий урок допоможе повернутись у ритм.`,

  demoNotCompleted:
    `Твій перший AI-урок ще чекає.\n\nВін займе кілька хвилин і допоможе визначити рівень англійської.`,

  demoCompletedNoPurchase:
    `Ти завершив перший AI-урок 🎉\n\nНаступні уроки доступні за підпискою.`,

  activeUser: (book: string | null, section: string | null) =>
    `Готовий до наступного уроку?\n\nЗараз ти на:\n${book || 'поточна книга'} — ${section || 'поточний розділ'}`,

  subscriptionExpired:
    `Твоя підписка завершилась.\n\nПоновіть підписку, щоб продовжити уроки.`,

  error:
    `Щось пішло не так.\n\nСпробуй ще раз або відкрій Mentium напряму.`,

  maybeLater: `Добре. Повернись до /schedule, коли будеш готовий.`,

  accountNotLinked: `Акаунт не підключено. Спочатку скористайся /connect.`,

  missedTodayAck: `Добре! Використай /schedule, щоб обрати новий час.`,

  missedTomorrowAck: `Зрозуміло. Нагадаю тобі завтра у звичний час.`,

  remindLaterAck: `Зрозуміло, нагадаю незабаром.`,

  help:
    `/start — привітання та огляд Mentium\n` +
    `/connect — підключити акаунт Mentium\n` +
    `/schedule — налаштувати нагадування\n` +
    `/reschedule — змінити розклад\n` +
    `/status — переглянути статус\n` +
    `/next — посилання на наступний урок\n` +
    `/stop — вимкнути нагадування\n` +
    `/help — показати це повідомлення`,
};
