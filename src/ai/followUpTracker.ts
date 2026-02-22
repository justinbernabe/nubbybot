import { anthropic } from './claude.js';
import { usageTracker } from './usageTracker.js';
import { settingsRepository } from '../admin/settingsRepository.js';
import { logger } from '../utils/logger.js';

interface ConversationWindow {
  channelId: string;
  userId: string;
  originalQuestion: string;
  botAnswer: string;
  history: Array<{ role: 'user' | 'bot'; content: string }>;
  createdAt: number;
  lastActivityAt: number;
  lastClassifiedAt: number;
  followUpCount: number;
}

export type { ConversationWindow };

// Key: "channelId:userId"
const activeWindows = new Map<string, ConversationWindow>();

const MAX_ACTIVE_WINDOWS = 500;
const MIN_CLASSIFY_INTERVAL_MS = 5000;

const SETTINGS = {
  ENABLED: 'followup:enabled',
  WINDOW_SECONDS: 'followup:window_seconds',
  MAX_FOLLOWUPS: 'followup:max_followups',
} as const;

function getKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

function getSetting(key: string, defaultValue: string): string {
  return settingsRepository.get(key) ?? defaultValue;
}

function isEnabled(): boolean {
  return getSetting(SETTINGS.ENABLED, 'true') === 'true';
}

function getWindowSeconds(): number {
  return parseInt(getSetting(SETTINGS.WINDOW_SECONDS, '120'), 10);
}

function getMaxFollowups(): number {
  return parseInt(getSetting(SETTINGS.MAX_FOLLOWUPS, '3'), 10);
}

function evictOldestWindow(): void {
  let oldestKey = '';
  let oldestTime = Infinity;
  for (const [key, win] of activeWindows) {
    if (win.lastActivityAt < oldestTime) {
      oldestTime = win.lastActivityAt;
      oldestKey = key;
    }
  }
  if (oldestKey) activeWindows.delete(oldestKey);
}

export const followUpTracker = {
  registerWindow(channelId: string, userId: string, question: string, botAnswer: string): void {
    if (!isEnabled()) return;

    const key = getKey(channelId, userId);
    const now = Date.now();

    // Cap total windows to prevent unbounded memory growth
    if (!activeWindows.has(key) && activeWindows.size >= MAX_ACTIVE_WINDOWS) {
      evictOldestWindow();
    }

    activeWindows.set(key, {
      channelId,
      userId,
      originalQuestion: question,
      botAnswer,
      history: [
        { role: 'user', content: question },
        { role: 'bot', content: botAnswer },
      ],
      createdAt: now,
      lastActivityAt: now,
      lastClassifiedAt: 0,
      followUpCount: 0,
    });

    logger.debug(`Follow-up window opened for ${key}`);
  },

  async checkFollowUp(
    channelId: string,
    userId: string,
    messageContent: string,
  ): Promise<{ isFollowUp: true; window: ConversationWindow } | null> {
    if (!isEnabled()) return null;

    const key = getKey(channelId, userId);
    const window = activeWindows.get(key);
    if (!window) return null;

    // Check TTL
    const windowMs = getWindowSeconds() * 1000;
    if (Date.now() - window.lastActivityAt > windowMs) {
      activeWindows.delete(key);
      logger.debug(`Follow-up window expired for ${key}`);
      return null;
    }

    // Check max follow-ups
    if (window.followUpCount >= getMaxFollowups()) {
      activeWindows.delete(key);
      logger.debug(`Follow-up window max reached for ${key}`);
      return null;
    }

    // Rate limit: skip if classified too recently (prevents spam-to-API-cost attacks)
    if (Date.now() - window.lastClassifiedAt < MIN_CLASSIFY_INTERVAL_MS) {
      return null;
    }

    // Use Haiku to classify
    window.lastClassifiedAt = Date.now();
    const isRelated = await this.classifyWithHaiku(window, messageContent);
    if (!isRelated) return null;

    // Update window state
    window.followUpCount++;
    window.lastActivityAt = Date.now();
    window.history.push({ role: 'user', content: messageContent });

    return { isFollowUp: true, window };
  },

  recordFollowUpResponse(channelId: string, userId: string, botAnswer: string): void {
    const key = getKey(channelId, userId);
    const window = activeWindows.get(key);
    if (window) {
      window.history.push({ role: 'bot', content: botAnswer });
      window.lastActivityAt = Date.now();
    }
  },

  evictExpired(): void {
    const windowMs = getWindowSeconds() * 1000;
    const now = Date.now();
    for (const [key, window] of activeWindows) {
      if (now - window.lastActivityAt > windowMs) {
        activeWindows.delete(key);
      }
    }
  },

  async classifyWithHaiku(window: ConversationWindow, newMessage: string): Promise<boolean> {
    const lastExchanges = window.history.slice(-4);
    let conversationSummary = '';
    for (const entry of lastExchanges) {
      const label = entry.role === 'user' ? 'User' : 'Bot';
      conversationSummary += `${label}: ${entry.content}\n`;
    }

    const prompt = `Here is a recent conversation between a user and a bot:\n\n${conversationSummary}\nNew message from the same user: "${newMessage}"\n\nIs this new message a follow-up or continuation of the above conversation? Answer only "yes" or "no".`;

    try {
      const model = 'claude-haiku-4-5-20251001';
      const response = await anthropic.messages.create({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: prompt }],
      });

      usageTracker.track('followup_check', model, {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : '';
      return text.startsWith('yes');
    } catch (err) {
      logger.error('Follow-up classification failed', { error: err });
      return false;
    }
  },

  getActiveWindowCount(): number {
    return activeWindows.size;
  },
};

// Evict expired windows every 60 seconds
setInterval(() => followUpTracker.evictExpired(), 60_000);
