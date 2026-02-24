import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Router } from './router.js';
import { checkAuth } from './middleware.js';
import { statsApiHandler, costsApiHandler } from './handlers/dashboard.js';
import { logsApiHandler } from './handlers/logs.js';
import { promptsListApiHandler, promptUpdateApiHandler, promptDeleteApiHandler } from './handlers/prompts.js';
import { settingsApiHandler } from './handlers/settings.js';
import { loginApiHandler } from './handlers/login.js';
import { chatApiHandler, guildsApiHandler, linkScrapeApiHandler, linkScrapeStatusHandler, profileBuildApiHandler, profileBuildStatusHandler } from './handlers/chat.js';

let server: Server | null = null;

// Resolve static dir: works in both dev (dist/admin/server.js -> ../../admin-ui/dist)
// and Docker (/app/dist/admin/server.js -> /app/admin-ui/dist)
const STATIC_DIR = join(import.meta.dirname, '../../admin-ui/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStaticFile(pathname: string, res: import('node:http').ServerResponse): boolean {
  const filePath = join(STATIC_DIR, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) return false;

  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  } catch {
    return false;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);

  // Hashed assets get long cache, everything else no-cache
  const isHashed = pathname.startsWith('/assets/');
  const cacheControl = isHashed ? 'public, max-age=31536000, immutable' : 'no-cache';

  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
  res.end(content);
  return true;
}

function serveSpaFallback(res: import('node:http').ServerResponse): void {
  const indexPath = join(STATIC_DIR, 'index.html');
  try {
    const content = readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Admin UI not built. Run: cd admin-ui && npm run build');
  }
}

export function startAdminServer(): Server {
  const router = new Router();

  // API routes only — no page handlers
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
  router.post('/api/profile-build', profileBuildApiHandler);
  router.get('/api/profile-build/status', profileBuildStatusHandler);
  router.post('/api/login', loginApiHandler);

  server = createServer(async (req, res) => {
    try {
      const rawUrl = req.url ?? '/';
      const url = rawUrl.split('?')[0];

      // Public routes: login page, login API, and static assets (JS/CSS for login page)
      const isPublicRoute = url === '/login' || url === '/api/login' || url.startsWith('/assets/');

      if (!isPublicRoute && !checkAuth(req, res)) {
        return;
      }

      // 1. Try API routes first
      const handled = await router.handle(req, res);
      if (handled) return;

      // 2. Try serving a static file
      if (serveStaticFile(url, res)) return;

      // 3. SPA fallback — serve index.html for all other routes
      serveSpaFallback(res);
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
