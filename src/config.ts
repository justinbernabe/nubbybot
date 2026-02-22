import 'dotenv/config';

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN!,
    appId: process.env.DISCORD_APP_ID ?? '1363093908526993509',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  db: {
    path: process.env.DB_PATH ?? '/db/nubbybot.db',
  },
  bot: {
    logLevel: process.env.LOG_LEVEL ?? 'info',
    backfillBatchDelayMs: parseInt(process.env.BACKFILL_BATCH_DELAY_MS ?? '1000', 10),
    profileUpdateIntervalHours: parseInt(process.env.PROFILE_UPDATE_INTERVAL_HOURS ?? '24', 10),
  },
} as const;

const required = ['DISCORD_TOKEN', 'ANTHROPIC_API_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
