import { messageRepository } from '../database/repositories/messageRepository.js';
import { profileRepository } from '../database/repositories/profileRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { linkRepository } from '../database/repositories/linkRepository.js';
import { logger } from '../utils/logger.js';

export type QueryMode = 'default' | 'recall';

const RECALL_PATTERNS = [
  /every\s+time/i,
  /all\s+the\s+times/i,
  /how\s+many\s+times/i,
  /list\s+every/i,
  /show\s+me\s+all/i,
  /give\s+me\s+(all|every)/i,
  /list\s+all/i,
  /how\s+often/i,
  /find\s+(every|all)/i,
];

export function detectQueryMode(question: string): QueryMode {
  return RECALL_PATTERNS.some(p => p.test(question)) ? 'recall' : 'default';
}

// Cache users+nicknames per guild — refreshed once per context build
let userCacheGuildId: string | null = null;
let userCacheData: ReturnType<typeof userRepository.findAllWithNicknames> = [];

function getUsersWithNicknames(guildId: string) {
  if (userCacheGuildId !== guildId) {
    userCacheData = userRepository.findAllWithNicknames(guildId);
    userCacheGuildId = guildId;
  }
  return userCacheData;
}

function resolveUserIdFromQuestion(question: string, guildId: string): string | null {
  const allUsers = getUsersWithNicknames(guildId);
  const questionLower = question.toLowerCase();

  for (const user of allUsers) {
    const username = user.username.toLowerCase();
    const displayName = user.global_display_name?.toLowerCase();
    const matched = questionLower.includes(username)
      || (displayName && questionLower.includes(displayName))
      || user.nicknames.some(n => questionLower.includes(n.toLowerCase()));

    if (matched) return user.id;
  }
  return null;
}

interface ArchiveStats {
  totalMessages: number;
  earliestDate: string | null;
  latestDate: string | null;
  uniqueAuthors: number;
}

interface RecallData {
  totalCount: number;
  monthlyBreakdown: Array<{ month: string; count: number }>;
  samples: Array<{ author: string; content: string; date: string; channel: string }>;
  targetUser: string | null;
}

interface QueryContext {
  recentConversation: Array<{
    author: string;
    content: string;
    date: string;
  }>;
  relevantMessages: Array<{
    author: string;
    content: string;
    date: string;
    channel: string;
  }>;
  userProfiles: Array<{
    username: string;
    summary: string;
    traits: string[];
    games: string[];
    topics: string[];
    communicationStyle: string | null;
    quotes: string[];
  }>;
  referencedLinks: Array<{
    url: string;
    summary: string;
    author: string;
    date: string;
  }>;
  archiveStats: ArchiveStats | null;
  recallData: RecallData | null;
}

export const contextBuilder = {
  buildContext(guildId: string, question: string, mentionedUserIds: string[], channelId?: string, mode: QueryMode = 'default'): QueryContext {
    const context: QueryContext = {
      recentConversation: [],
      relevantMessages: [],
      userProfiles: [],
      referencedLinks: [],
      archiveStats: null,
      recallData: null,
    };

    // Fetch archive metadata so the bot knows what it has
    try {
      const stats = messageRepository.getGuildStats(guildId);
      if (stats.totalMessages > 0) {
        context.archiveStats = stats;
      }
    } catch (err) {
      logger.warn('Failed to fetch archive stats', { error: err });
    }

    // 0. Fetch recent conversation from the current channel for context awareness
    if (channelId) {
      try {
        const recentMessages = messageRepository.getRecentByChannel(channelId, 50);
        // Reverse so oldest first (query returns DESC)
        for (const msg of recentMessages.reverse()) {
          context.recentConversation.push({
            author: ((msg.global_display_name ?? msg.username) as string) ?? 'Unknown',
            content: msg.content as string,
            date: new Date(msg.message_created_at as string).toLocaleTimeString(),
          });
        }
      } catch (err) {
        logger.warn('Failed to fetch recent channel messages', { error: err });
      }
    }

    // Shared cache for channel name lookups (avoids N+1 across all sections)
    const channelNameCache = new Map<string, string>();
    const resolveChannelName = (chId: string): string => {
      if (!channelNameCache.has(chId)) {
        const ch = channelRepository.findById(chId);
        channelNameCache.set(chId, (ch?.name as string) ?? chId);
      }
      return channelNameCache.get(chId)!;
    };

    // 1. Get profiles and recent messages for mentioned users
    for (const userId of mentionedUserIds) {
      const profile = profileRepository.findByUserAndGuild(userId, guildId);
      const user = userRepository.findById(userId);

      if (profile && user) {
        context.userProfiles.push({
          username: (user.global_display_name ?? user.username) as string,
          summary: profile.summary ?? 'No summary available',
          traits: profile.personality_traits ?? [],
          games: profile.favorite_games ?? [],
          topics: profile.favorite_topics ?? [],
          communicationStyle: profile.communication_style ?? null,
          quotes: profile.notable_quotes ?? [],
        });
      }

      const userMessages = messageRepository.getRecentByUser(userId, guildId, 50);
      for (const msg of userMessages) {
        context.relevantMessages.push({
          author: ((user?.global_display_name ?? user?.username) as string) ?? userId,
          content: msg.content,
          date: new Date(msg.message_created_at).toLocaleDateString(),
          channel: resolveChannelName(msg.channel_id),
        });
      }
    }

    // 2. Full-text search for relevant messages
    try {
      const sanitized = question.replace(/[^\w\s]/g, '').trim();
      if (sanitized) {
        const ftsLimit = mode === 'recall' ? 200 : 30;

        // In recall mode, try to filter by a specific user
        let targetAuthorId: string | undefined;
        if (mode === 'recall') {
          if (mentionedUserIds.length > 0) {
            targetAuthorId = mentionedUserIds[0];
          } else {
            const resolved = resolveUserIdFromQuestion(question, guildId);
            if (resolved) targetAuthorId = resolved;
          }
        }

        const searchResults = messageRepository.searchMessages(guildId, sanitized, ftsLimit, targetAuthorId);
        const authorCache = new Map<string, string>();

        if (mode === 'recall' && searchResults.length > 0) {
          // Pre-process locally: count, group by month, take samples
          const resolveAuthor = (authorId: string): string => {
            if (!authorCache.has(authorId)) {
              const user = userRepository.findById(authorId);
              authorCache.set(authorId, ((user?.global_display_name ?? user?.username) as string) ?? authorId);
            }
            return authorCache.get(authorId)!;
          };
          const resolveChannel = (chId: string): string => {
            if (!channelNameCache.has(chId)) {
              const ch = channelRepository.findById(chId);
              channelNameCache.set(chId, (ch?.name as string) ?? chId);
            }
            return channelNameCache.get(chId)!;
          };

          // Group by month
          const monthCounts = new Map<string, number>();
          const allResults: Array<{ author: string; content: string; date: string; channel: string }> = [];
          for (const msg of searchResults) {
            const d = new Date(msg.message_created_at);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
            allResults.push({
              author: resolveAuthor(msg.author_id),
              content: msg.content,
              date: d.toLocaleDateString(),
              channel: resolveChannel(msg.channel_id),
            });
          }

          const monthlyBreakdown = Array.from(monthCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, count]) => ({ month, count }));

          // Take up to 30 evenly spaced samples for Claude context
          const maxSamples = 30;
          let samples: typeof allResults;
          if (allResults.length <= maxSamples) {
            samples = allResults;
          } else {
            const step = allResults.length / maxSamples;
            samples = [];
            for (let i = 0; i < maxSamples; i++) {
              samples.push(allResults[Math.floor(i * step)]);
            }
          }

          const targetUserName = targetAuthorId ? resolveAuthor(targetAuthorId) : null;

          context.recallData = {
            totalCount: searchResults.length,
            monthlyBreakdown,
            samples,
            targetUser: targetUserName,
          };

          logger.info(`Recall mode: ${searchResults.length} results, ${samples.length} samples sent to Claude`, {
            targetUser: targetUserName,
          });
        } else {
          // Default mode: add all results directly
          for (const msg of searchResults) {
            if (!authorCache.has(msg.author_id)) {
              const user = userRepository.findById(msg.author_id);
              authorCache.set(msg.author_id, ((user?.global_display_name ?? user?.username) as string) ?? msg.author_id);
            }

            context.relevantMessages.push({
              author: authorCache.get(msg.author_id)!,
              content: msg.content,
              date: new Date(msg.message_created_at).toLocaleDateString(),
              channel: resolveChannelName(msg.channel_id),
            });
          }
        }
      }
    } catch (err) {
      logger.warn('FTS search failed, continuing with user context only', { error: err });
    }

    // 3. If no mentioned users, try to find users by name in the question
    if (mentionedUserIds.length === 0) {
      const allUsers = getUsersWithNicknames(guildId);
      const questionLower = question.toLowerCase();

      for (const user of allUsers) {
        const username = user.username.toLowerCase();
        const displayName = user.global_display_name?.toLowerCase();
        const matched = questionLower.includes(username)
          || (displayName && questionLower.includes(displayName))
          || user.nicknames.some(n => questionLower.includes(n.toLowerCase()));

        if (matched) {
          const profile = profileRepository.findByUserAndGuild(user.id, guildId);
          if (profile) {
            context.userProfiles.push({
              username: (user.global_display_name ?? user.username),
              summary: profile.summary ?? 'No summary available',
              traits: profile.personality_traits ?? [],
              games: profile.favorite_games ?? [],
              topics: profile.favorite_topics ?? [],
              communicationStyle: profile.communication_style ?? null,
              quotes: profile.notable_quotes ?? [],
            });
          }
        }
      }
    }

    // Deduplicate messages
    const seen = new Set<string>();
    context.relevantMessages = context.relevantMessages.filter(msg => {
      const key = `${msg.author}-${msg.content.substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Trim to stay within Claude's context window
    const charLimit = mode === 'recall' ? 120_000 : 80_000;
    let totalChars = 0;
    context.relevantMessages = context.relevantMessages.filter(msg => {
      totalChars += msg.content.length + msg.author.length + 50;
      return totalChars < charLimit;
    });

    // 5. Search for relevant link analyses
    try {
      const links = linkRepository.searchByGuild(guildId, question, 10);
      const authorCache = new Map<string, string>();

      for (const link of links) {
        if (!link.summary) continue;
        if (!authorCache.has(link.author_id)) {
          const user = userRepository.findById(link.author_id);
          authorCache.set(link.author_id, ((user?.global_display_name ?? user?.username) as string) ?? link.author_id);
        }

        context.referencedLinks.push({
          url: link.url,
          summary: link.summary,
          author: authorCache.get(link.author_id)!,
          date: new Date(link.created_at).toLocaleDateString(),
        });
      }
    } catch (err) {
      logger.warn('Link search failed', { error: err });
    }

    return context;
  },
};
