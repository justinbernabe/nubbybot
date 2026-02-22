import { createServer, type Server } from 'node:http';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Router } from './router.js';
import { checkAuth } from './middleware.js';
import { dashboardPageHandler, statsApiHandler, costsApiHandler } from './handlers/dashboard.js';
import { logsPageHandler, logsApiHandler } from './handlers/logs.js';
import { promptsPageHandler, promptsListApiHandler, promptUpdateApiHandler, promptDeleteApiHandler } from './handlers/prompts.js';
import { settingsPageHandler, settingsApiHandler } from './handlers/settings.js';
import { loginPageHandler, loginApiHandler } from './handlers/login.js';
import { chatPageHandler, chatApiHandler, guildsApiHandler, linkScrapeApiHandler, linkScrapeStatusHandler } from './handlers/chat.js';

let server: Server | null = null;

export function startAdminServer(): Server {
  const router = new Router();

  // Pages
  router.get('/', dashboardPageHandler);
  router.get('/logs', logsPageHandler);
  router.get('/prompts', promptsPageHandler);
  router.get('/settings', settingsPageHandler);
  router.get('/chat', chatPageHandler);
  router.get('/login', loginPageHandler);

  // API
  router.get('/api/stats', statsApiHandler);
  router.get('/api/costs', costsApiHandler);
  router.get('/api/logs', logsApiHandler);
  router.get('/api/prompts', promptsListApiHandler);
  router.put('/api/prompts/:key', promptUpdateApiHandler);
  router.delete('/api/prompts/:key', promptDeleteApiHandler);
  router.get('/api/settings', settingsApiHandler);
  router.get('/api/guilds', guildsApiHandler);
  router.post('/api/chat', chatApiHandler);
  router.post('/api/link-scrape', linkScrapeApiHandler);
  router.get('/api/link-scrape/status', linkScrapeStatusHandler);
  router.post('/api/login', loginApiHandler);

  server = createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';
      const isLoginRoute = url === '/login' || url === '/api/login';

      if (!isLoginRoute && !checkAuth(req, res)) {
        return;
      }

      const handled = await router.handle(req, res);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    } catch (err) {
      logger.error('Admin panel error', { error: err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
      }
    }
  });

  server.listen(config.admin.port, () => {
    logger.info(`Admin panel listening on http://0.0.0.0:${config.admin.port}`);
  });

  return server;
}

export function stopAdminServer(): void {
  if (server) {
    server.close();
  }
}
