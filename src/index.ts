import { config } from './config.js';
import { createDiscordClient } from './bot/client.js';
import { registerEvents } from './bot/events/index.js';
import { closeDb } from './database/client.js';
import { startAdminServer, stopAdminServer } from './admin/server.js';
import { autoProfileService } from './services/autoProfileService.js';
import { logger } from './utils/logger.js';

const VERSION = '0.4.0';

async function main() {
  logger.info(`Starting NubbyGPT v${VERSION}`);

  startAdminServer();

  const client = createDiscordClient();
  registerEvents(client);

  try {
    await client.login(config.discord.token);
  } catch (err) {
    logger.error('Discord login failed — admin panel still running', { error: err });
  }

  const shutdown = () => {
    logger.info('Shutting down...');
    stopAdminServer();
    autoProfileService.stopPeriodicRefresh();
    client.destroy();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Fatal error during startup', { error: err });
  process.exit(1);
});
