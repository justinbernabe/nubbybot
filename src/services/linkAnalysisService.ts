import type { Message } from 'discord.js';
import { createMessageWithRetry } from '../ai/claude.js';
import { getPrompt } from '../ai/promptManager.js';
import { usageTracker } from '../ai/usageTracker.js';
import { linkRepository } from '../database/repositories/linkRepository.js';
import { getDb } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
]);

const SKIP_EXTENSIONS = new Set([
  '.svg', '.ico', '.tiff',
]);

function isSafeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false;
    if (hostname.startsWith('10.')) return false;
    if (hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (hostname.startsWith('169.254.')) return false;
    if (hostname === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

function getUrlExtension(url: string): string | null {
  try {
    const parsed = new URL(url);
    const ext = parsed.pathname.split('.').pop()?.toLowerCase();
    return ext ? `.${ext}` : null;
  } catch {
    return null;
  }
}

function isImageUrl(url: string): boolean {
  const ext = getUrlExtension(url);
  return ext !== null && IMAGE_EXTENSIONS.has(ext);
}

function shouldSkipUrl(url: string): boolean {
  try {
    if (!isSafeUrl(url)) return true;
    const ext = getUrlExtension(url);
    if (ext && SKIP_EXTENSIONS.has(ext)) return true;
    if (ext && VIDEO_EXTENSIONS.has(ext)) return true;
    return false;
  } catch {
    return true;
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim().replace(/\s+/g, ' ') : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPageContent(url: string): Promise<{ title: string | null; text: string } | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'NubbyBot/1.3 (Discord Bot; link preview)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    const html = await response.text();
    const title = extractTitle(html);
    const text = stripHtml(html).substring(0, 3000);
    return { title, text };
  } catch (err) {
    logger.debug(`Failed to fetch ${url}: ${err}`);
    return null;
  }
}

async function analyzeWithClaude(url: string, title: string | null, text: string): Promise<string> {
  const userPrompt = title
    ? `URL: ${url}\nTitle: ${title}\n\nContent:\n${text}`
    : `URL: ${url}\n\nContent:\n${text}`;

  const model = 'claude-haiku-4-5-20251001';
  const response = await createMessageWithRetry({
    model,
    max_tokens: 200,
    system: getPrompt('LINK_ANALYSIS_SYSTEM_PROMPT'),
    messages: [{ role: 'user', content: userPrompt }],
  }, 'link_analysis', 2, 5_000);

  usageTracker.track('link_analysis', model, {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Could not summarize.';
}

async function analyzeImageWithClaude(url: string): Promise<string> {
  const model = 'claude-haiku-4-5-20251001';
  const response = await createMessageWithRetry({
    model,
    max_tokens: 200,
    system: getPrompt('IMAGE_ANALYSIS_SYSTEM_PROMPT'),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url } },
        { type: 'text', text: 'Describe this image.' },
      ],
    }],
  }, 'image_analysis', 2, 30_000);

  usageTracker.track('image_analysis', model, {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Could not describe image.';
}

let scrapeRunning = false;

export const linkAnalysisService = {
  isScraping(): boolean {
    return scrapeRunning;
  },

  async scrapeExistingLinks(guildId: string): Promise<{ processed: number; analyzed: number; skipped: number; errors: number }> {
    if (scrapeRunning) {
      throw new Error('Link scrape already in progress');
    }
    scrapeRunning = true;
    const stats = { processed: 0, analyzed: 0, skipped: 0, errors: 0 };

    try {
      // Get messages from the last year that contain http
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const messages = getDb().prepare(`
        SELECT m.id, m.guild_id, m.channel_id, m.author_id, m.content
        FROM messages m
        JOIN users u ON u.id = m.author_id
        WHERE m.guild_id = ? AND m.content LIKE '%http%' AND u.bot = 0
          AND m.message_created_at >= ?
        ORDER BY m.message_created_at DESC
        LIMIT 5000
      `).all(guildId, oneYearAgo.toISOString()) as Array<{
        id: string; guild_id: string; channel_id: string; author_id: string; content: string;
      }>;

      logger.info(`Link scrape: found ${messages.length} messages with URLs in last year`);

      for (const msg of messages) {
        const urls = extractUrls(msg.content);
        for (const url of urls) {
          stats.processed++;

          if (shouldSkipUrl(url)) {
            stats.skipped++;
            continue;
          }

          // Dedup
          const existing = linkRepository.findByUrl(url);
          if (existing) {
            stats.skipped++;
            continue;
          }

          let domain: string;
          try {
            domain = new URL(url).hostname;
          } catch {
            stats.skipped++;
            continue;
          }

          const linkId = linkRepository.insert({
            message_id: msg.id,
            guild_id: msg.guild_id,
            channel_id: msg.channel_id,
            author_id: msg.author_id,
            url,
            domain,
          });

          try {
            const content = await fetchPageContent(url);
            if (!content) {
              linkRepository.markError(linkId, 'Failed to fetch or non-HTML content');
              stats.errors++;
              continue;
            }

            if (content.text.length < 50) {
              linkRepository.markError(linkId, 'Page content too short');
              stats.errors++;
              continue;
            }

            const summary = await analyzeWithClaude(url, content.title, content.text);
            linkRepository.markAnalyzed(linkId, content.title, summary);
            stats.analyzed++;
            logger.info(`Link scrape: analyzed ${domain} — ${content.title ?? 'No title'} (${stats.analyzed} done)`);
          } catch (err) {
            logger.error(`Link scrape error for ${url}`, { error: err });
            linkRepository.markError(linkId, String(err));
            stats.errors++;
          }

          // Rate limit
          await delay(1500);
        }
      }

      logger.info(`Link scrape complete: ${stats.analyzed} analyzed, ${stats.skipped} skipped, ${stats.errors} errors`);
      return stats;
    } finally {
      scrapeRunning = false;
    }
  },

  async analyzeMessageLinks(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.author.bot) return;

    // Collect URLs from message content + attachments
    const contentUrls = extractUrls(message.content);
    const attachmentUrls = message.attachments
      .filter(a => a.contentType?.startsWith('image/') || isImageUrl(a.url))
      .map(a => a.url);
    const allUrls = [...new Set([...contentUrls, ...attachmentUrls])];

    if (allUrls.length === 0) return;

    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const authorId = message.author.id;
    const messageId = message.id;

    for (const url of allUrls) {
      if (shouldSkipUrl(url)) continue;

      // Dedup: skip if already analyzed
      const existing = linkRepository.findByUrl(url);
      if (existing) {
        logger.debug(`Link already analyzed, skipping: ${url}`);
        continue;
      }

      let domain: string;
      try {
        domain = new URL(url).hostname;
      } catch {
        continue;
      }

      const linkId = linkRepository.insert({
        message_id: messageId,
        guild_id: guildId,
        channel_id: channelId,
        author_id: authorId,
        url,
        domain,
      });

      try {
        if (isImageUrl(url) || domain === 'cdn.discordapp.com' || domain === 'media.discordapp.net') {
          // Image/GIF: use Claude vision API
          const summary = await analyzeImageWithClaude(url);
          linkRepository.markAnalyzed(linkId, '[Image]', summary);
          logger.info(`Image analyzed: ${domain} — ${summary.substring(0, 60)}`);
        } else {
          // Regular link: fetch HTML and analyze
          const content = await fetchPageContent(url);
          if (!content) {
            linkRepository.markError(linkId, 'Failed to fetch or non-HTML content');
            continue;
          }

          if (content.text.length < 50) {
            linkRepository.markError(linkId, 'Page content too short');
            continue;
          }

          const summary = await analyzeWithClaude(url, content.title, content.text);
          linkRepository.markAnalyzed(linkId, content.title, summary);
          logger.info(`Link analyzed: ${domain} — ${content.title ?? 'No title'}`);
        }
      } catch (err) {
        logger.error(`Link analysis error for ${url}`, { error: err });
        linkRepository.markError(linkId, String(err));
      }

      // Rate limit between URLs
      if (allUrls.indexOf(url) < allUrls.length - 1) {
        await delay(1000);
      }
    }
  },
};
