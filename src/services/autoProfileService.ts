import { config } from '../config.js';
import { profileRepository } from '../database/repositories/profileRepository.js';
import { profileService } from './profileService.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

// Profiles send ~500 messages per call (~15-20k input tokens).
// Org rate limit may be as low as 10k tokens/min, so we need
// aggressive backoff on 429s and generous gaps between calls.
const DELAY_BETWEEN_BUILDS_MS = 15_000;
const RATE_LIMIT_BASE_DELAY_MS = 60_000;
const RATE_LIMIT_MAX_RETRIES = 5;

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('429') || err.message.includes('rate_limit');
  }
  return false;
}

async function buildProfileWithRetry(userId: string, guildId: string): Promise<void> {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      await profileService.buildProfile(userId, guildId);
      return;
    } catch (err) {
      if (isRateLimitError(err) && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`[Auto-Profile] Rate limited on ${userId} (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES + 1}), waiting ${Math.round(waitMs / 1000)}s`);
        await delay(waitMs);
      } else {
        throw err;
      }
    }
  }
}

export const autoProfileService = {
  isRunning(): boolean {
    return running;
  },

  async buildMissingAndStaleProfiles(guildId: string): Promise<{ built: number; errors: number }> {
    if (running) {
      logger.warn('[Auto-Profile] Build already in progress, skipping');
      return { built: 0, errors: 0 };
    }

    running = true;
    const stats = { built: 0, errors: 0 };

    try {
      const staleHours = config.bot.profileUpdateIntervalHours;
      const users = profileRepository.findUsersNeedingProfiles(guildId, staleHours);

      if (users.length === 0) {
        logger.info('[Auto-Profile] All profiles are up to date');
        return stats;
      }

      logger.info(`[Auto-Profile] Building profiles for ${users.length} users (stale threshold: ${staleHours}h)`);

      for (let i = 0; i < users.length; i++) {
        const user = users[i];

        try {
          await buildProfileWithRetry(user.user_id, guildId);
          stats.built++;
          logger.info(`[Auto-Profile] ${stats.built}/${users.length} — built profile for ${user.user_id} (${user.message_count} msgs)`);
        } catch (err) {
          stats.errors++;
          logger.error(`[Auto-Profile] Failed to build profile for ${user.user_id}`, { error: err });
        }

        if (i < users.length - 1) {
          await delay(DELAY_BETWEEN_BUILDS_MS);
        }
      }

      logger.info(`[Auto-Profile] Complete — ${stats.built} built, ${stats.errors} errors`);
      return stats;
    } finally {
      running = false;
    }
  },

  startPeriodicRefresh(guildId: string): void {
    if (intervalHandle) {
      logger.warn('[Auto-Profile] Periodic refresh already scheduled');
      return;
    }

    const intervalMs = config.bot.profileUpdateIntervalHours * 60 * 60 * 1000;
    logger.info(`[Auto-Profile] Scheduling periodic refresh every ${config.bot.profileUpdateIntervalHours}h`);

    intervalHandle = setInterval(() => {
      this.buildMissingAndStaleProfiles(guildId).catch((err) => {
        logger.error('[Auto-Profile] Periodic refresh failed', { error: err });
      });
    }, intervalMs);
  },

  stopPeriodicRefresh(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  },
};
