import { env } from '../env';
import { logger } from '../utils/logger';

const headers = () => ({
  'Authorization': `Bearer ${env.INTERNAL_TELEGRAM_API_KEY}`,
  'Content-Type': 'application/json',
});

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${env.PLATFORM_API_URL}${path}`;
  const res = await fetch(url, { ...options, headers: headers() });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Platform API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface UserSummary {
  platformUserId: string;
  name: string;
  telegramLinked: boolean;
  subscriptionStatus: 'free' | 'active' | 'expired';
  demoLessonsCompleted: number;
  lessonsCompleted: number;
  currentBook: string | null;
  currentSection: string | null;
  currentSectionTitle: string | null;
  xp: number;
  rank: string;
  streakDays: number;
  lastLessonAt: string | null;
}

export interface NextLessonLink {
  url: string;
  label: string;
}

export async function getUserSummary(telegramChatId: string): Promise<UserSummary | null> {
  try {
    return await apiFetch<UserSummary>(`/api/internal/telegram/users/${telegramChatId}/summary`);
  } catch (err: any) {
    logger.warn('Failed to fetch user summary', { telegramChatId, error: err.message });
    return null;
  }
}

export async function getNextLessonLink(telegramChatId: string): Promise<NextLessonLink | null> {
  try {
    return await apiFetch<NextLessonLink>(`/api/internal/telegram/users/${telegramChatId}/next-lesson-link`);
  } catch (err: any) {
    logger.warn('Failed to fetch next lesson link', { telegramChatId, error: err.message });
    return null;
  }
}

export async function notifyScheduleUpdated(payload: {
  telegramChatId: string;
  platformUserId: string;
  timezone: string;
  studyDays: string[];
  studyTime: string;
  lessonDurationMinutes: 50;
  reminderOffsetsMinutes: number[];
}): Promise<void> {
  try {
    await apiFetch('/api/internal/telegram/schedule-updated', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    logger.warn('Failed to notify platform of schedule update', { error: err.message });
  }
}

export function buildPlatformUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, env.PLATFORM_FRONTEND_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

export function buildLinkUrl(token: string, action: string = 'start'): string {
  return buildPlatformUrl('/tg-connect', { token, source: 'telegram', action });
}

export function buildConnectPlaceholderUrl(): string {
  return buildPlatformUrl('/', { source: 'telegram', action: 'connect_placeholder' });
}

export function buildStartUrl(): string {
  return buildPlatformUrl('/', { source: 'telegram', action: 'start' });
}

export function buildStartLinkedUrl(): string {
  return buildPlatformUrl('/', { source: 'telegram', action: 'start_linked' });
}

export function buildDiscoverUrl(): string {
  return buildPlatformUrl('/', { source: 'telegram', action: 'discover' });
}

export function buildReminderUrl(type: string): string {
  return buildPlatformUrl('/learning', { source: 'telegram', action: 'reminder', type });
}

export function buildLearningUrl(
  source: string = 'telegram',
  action?: string,
  type?: string
): string {
  const params: Record<string, string> = { source };
  if (action) params.action = action;
  if (type) params.type = type;
  return buildPlatformUrl('/learning', params);
}
