import { messageRepository } from '../database/repositories/messageRepository.js';
import { profileRepository } from '../database/repositories/profileRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { linkRepository } from '../database/repositories/linkRepository.js';
import { logger } from '../utils/logger.js';

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
}

export const contextBuilder = {
  buildContext(guildId: string, question: string, mentionedUserIds: string[], channelId?: string): QueryContext {
    const context: QueryContext = {
      recentConversation: [],
      relevantMessages: [],
      userProfiles: [],
      referencedLinks: [],
    };

    // 0. Fetch recent conversation from the current channel for context awareness
    if (channelId) {
      try {
        const recentMessages = messageRepository.getRecentByChannel(channelId, 20);
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
        const channelRecord = channelRepository.findById(msg.channel_id);
        context.relevantMessages.push({
          author: ((user?.global_display_name ?? user?.username) as string) ?? userId,
          content: msg.content,
          date: new Date(msg.message_created_at).toLocaleDateString(),
          channel: (channelRecord?.name as string) ?? msg.channel_id,
        });
      }
    }

    // 2. Full-text search for relevant messages
    try {
      // Sanitize for FTS5: wrap terms in quotes for phrase matching
      const sanitized = question.replace(/[^\w\s]/g, '').trim();
      if (sanitized) {
        const searchResults = messageRepository.searchMessages(guildId, sanitized, 30);
        const authorCache = new Map<string, string>();
        const channelCache = new Map<string, string>();

        for (const msg of searchResults) {
          if (!authorCache.has(msg.author_id)) {
            const user = userRepository.findById(msg.author_id);
            authorCache.set(msg.author_id, ((user?.global_display_name ?? user?.username) as string) ?? msg.author_id);
          }
          if (!channelCache.has(msg.channel_id)) {
            const ch = channelRepository.findById(msg.channel_id);
            channelCache.set(msg.channel_id, (ch?.name as string) ?? msg.channel_id);
          }

          context.relevantMessages.push({
            author: authorCache.get(msg.author_id)!,
            content: msg.content,
            date: new Date(msg.message_created_at).toLocaleDateString(),
            channel: channelCache.get(msg.channel_id)!,
          });
        }
      }
    } catch (err) {
      logger.warn('FTS search failed, continuing with user context only', { error: err });
    }

    // 3. If no mentioned users, try to find users by name in the question
    if (mentionedUserIds.length === 0) {
      const allUsers = userRepository.findAllNonBot();
      const questionLower = question.toLowerCase();

      for (const user of allUsers) {
        const username = (user.username as string).toLowerCase();
        const displayName = (user.global_display_name as string | null)?.toLowerCase();

        // Check username, display name, and nicknames
        let matched = questionLower.includes(username) || (displayName && questionLower.includes(displayName));
        if (!matched) {
          const nicknames = userRepository.getNicknames(user.id as string, guildId);
          matched = nicknames.some((n) => {
            const nick = (n.nickname as string | null)?.toLowerCase();
            const display = (n.display_name as string | null)?.toLowerCase();
            return (nick && questionLower.includes(nick)) || (display && questionLower.includes(display));
          });
        }

        if (matched) {
          const profile = profileRepository.findByUserAndGuild(user.id as string, guildId);
          if (profile) {
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

    // Trim to ~80k chars to stay well within Claude's context window
    let totalChars = 0;
    context.relevantMessages = context.relevantMessages.filter(msg => {
      totalChars += msg.content.length + msg.author.length + 50;
      return totalChars < 80_000;
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
