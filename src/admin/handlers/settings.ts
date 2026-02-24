import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../../config.js';
import { sendJson } from '../middleware.js';

export function settingsApiHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, {
    settings: {
      DB_PATH: config.db.path,
      LOG_LEVEL: config.bot.logLevel,
      BACKFILL_BATCH_DELAY_MS: config.bot.backfillBatchDelayMs,
      PROFILE_UPDATE_INTERVAL_HOURS: config.bot.profileUpdateIntervalHours,
      ADMIN_PORT: config.admin.port,
      ADMIN_AUTH: config.admin.token ? 'Enabled' : 'Disabled',
    },
  });
}
