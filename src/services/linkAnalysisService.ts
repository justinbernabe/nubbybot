import type { Message } from 'discord.js';
import { anthropic } from '../ai/claude.js';
import { getPrompt } from '../ai/promptManager.js';
import { linkRepository } from '../database/repositories/linkRepository.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.webp', '.svg',
  '.ico', '.bmp', '.tiff', '.mov', '.avi', '.mkv',
]);

const SKIP_DOMAINS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (SKIP_DOMAINS.has(parsed.hostname)) return true;
    const ext = parsed.pathname.split('.').pop()?.toLowerCase();
    if (ext && SKIP_EXTENSIONS.has(`.${ext}`)) return true;
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

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: getPrompt('LINK_ANALYSIS_SYSTEM_PROMPT'),
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Could not summarize.';
}

export const linkAnalysisService = {
  async analyzeMessageLinks(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.author.bot) return;

    const urls = extractUrls(message.content);
    if (urls.length === 0) return;

    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const authorId = message.author.id;
    const messageId = message.id;

    for (const url of urls) {
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
      } catch (err) {
        logger.error(`Link analysis error for ${url}`, { error: err });
        linkRepository.markError(linkId, String(err));
      }

      // Rate limit between URLs
      if (urls.indexOf(url) < urls.length - 1) {
        await delay(1000);
      }
    }
  },
};
