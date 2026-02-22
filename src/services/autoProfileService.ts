import { config } from '../config.js';
import { profileRepository } from '../database/repositories/profileRepository.js';
import { profileService } from './profileService.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

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
          await profileService.buildProfile(user.user_id, guildId);
          stats.built++;
          logger.info(`[Auto-Profile] ${stats.built}/${users.length} — built profile for ${user.user_id} (${user.message_count} msgs)`);
        } catch (err) {
          stats.errors++;
          logger.error(`[Auto-Profile] Failed to build profile for ${user.user_id}`, { error: err });
        }

        // Rate limit: 2s between Claude API calls
        if (i < users.length - 1) {
          await delay(2000);
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
