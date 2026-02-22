import type { Message } from 'discord.js';
import { anthropic } from './claude.js';
import { contextBuilder } from './contextBuilder.js';
import { getPrompt } from './promptManager.js';
import { buildQueryUserPrompt, buildSummarizePrompt } from './promptTemplates.js';
import { messageRepository } from '../database/repositories/messageRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { queryLogRepository } from '../database/repositories/queryLogRepository.js';
import { usageTracker } from './usageTracker.js';
import { followUpTracker } from './followUpTracker.js';
import { logger } from '../utils/logger.js';

const SUMMARIZE_PATTERNS = [
  /summarize\s+(today|today'?s?\s+convo)/i,
  /summarize\s+(this\s+week|the\s+week)/i,
  /summarize\s+(yesterday)/i,
  /summarize\s+(the\s+last\s+(\d+)\s+(hour|day|week|month)s?)/i,
  /summarize/i,
  /tldr/i,
  /tl;dr/i,
];

function parseSummarizeTimeframe(question: string): { since: string; label: string } | null {
  const now = new Date();

  if (/today|today'?s/i.test(question)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), label: 'today' };
  }

  if (/yesterday/i.test(question)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), label: 'yesterday' };
  }

  if (/this\s+week|the\s+week/i.test(question)) {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), label: 'this week' };
  }

  const rangeMatch = question.match(/last\s+(\d+)\s+(hour|day|week|month)s?/i);
  if (rangeMatch) {
    const amount = parseInt(rangeMatch[1], 10);
    const unit = rangeMatch[2].toLowerCase();
    const start = new Date(now);
    if (unit === 'hour') start.setHours(start.getHours() - amount);
    else if (unit === 'day') start.setDate(start.getDate() - amount);
    else if (unit === 'week') start.setDate(start.getDate() - amount * 7);
    else if (unit === 'month') start.setMonth(start.getMonth() - amount);
    return { since: start.toISOString(), label: `the last ${amount} ${unit}(s)` };
  }

  // Default: summarize today if just "summarize" or "tldr"
  if (/summarize|tldr|tl;dr/i.test(question)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), label: 'today' };
  }

  return null;
}

function isSummarizeRequest(question: string): boolean {
  return SUMMARIZE_PATTERNS.some(p => p.test(question));
}

export const queryHandler = {
  async handleMention(message: Message): Promise<void> {
    if (!message.guild) return;

    const question = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!question) {
      await message.reply("I'm here. What do you need?");
      return;
    }

    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    const startTime = Date.now();

    // Check if this is a summarize request
    if (isSummarizeRequest(question)) {
      const answer = await this.handleSummarize(question, message.guild.id, message.channel.id);
      await this.sendReply(message, answer);
      this.logQuery(message, question, answer, startTime);
      return;
    }

    // Regular question
    const mentionedUserIds = message.mentions.users
      .filter(u => u.id !== message.client.user!.id)
      .map(u => u.id);

    const model = 'claude-sonnet-4-5-20250929';
    const context = contextBuilder.buildContext(message.guild.id, question, mentionedUserIds, message.channel.id);
    logger.info(`Query context: ${context.relevantMessages.length} messages, ${context.userProfiles.length} profiles`);
    const userPrompt = buildQueryUserPrompt(question, context);

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: getPrompt('QUERY_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: userPrompt }],
    });

    usageTracker.track('query', model, {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const answer = response.content[0].type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';

    await this.sendReply(message, answer);
    followUpTracker.registerWindow(message.channel.id, message.author.id, question, answer);
    this.logQuery(message, question, answer, startTime, response.usage.input_tokens, response.usage.output_tokens);
  },

  async answerQuestion(question: string, guildId: string, channelId: string, mentionedUserIds: string[]): Promise<string> {
    const context = contextBuilder.buildContext(guildId, question, mentionedUserIds, channelId);

    logger.info(`Query context: ${context.relevantMessages.length} messages, ${context.userProfiles.length} profiles`);

    const userPrompt = buildQueryUserPrompt(question, context);

    const model = 'claude-sonnet-4-5-20250929';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: getPrompt('QUERY_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: userPrompt }],
    });

    usageTracker.track('query', model, {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    return response.content[0].type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';
  },

  async handleFollowUp(message: Message, conversationHistory: Array<{ role: 'user' | 'bot'; content: string }>): Promise<void> {
    if (!message.guild) return;

    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    const startTime = Date.now();

    const context = contextBuilder.buildContext(message.guild.id, message.content, [], message.channel.id);

    // Prepend conversation history to the prompt
    let conversationContext = '**Prior conversation with this user:**\n';
    for (const entry of conversationHistory) {
      const label = entry.role === 'user' ? 'User' : 'NubbyGPT';
      conversationContext += `${label}: ${entry.content}\n`;
    }
    conversationContext += '\n';

    const userPrompt = conversationContext + buildQueryUserPrompt(message.content, context);

    const model = 'claude-sonnet-4-5-20250929';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: getPrompt('QUERY_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: userPrompt }],
    });

    usageTracker.track('followup_response', model, {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const answer = response.content[0].type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';

    await this.sendReply(message, answer);
    followUpTracker.recordFollowUpResponse(message.channel.id, message.author.id, answer);
    this.logQuery(message, `[follow-up] ${message.content}`, answer, startTime, response.usage.input_tokens, response.usage.output_tokens);
  },

  async handleSummarize(question: string, guildId: string, channelId: string): Promise<string> {
    const timeframe = parseSummarizeTimeframe(question);
    if (!timeframe) {
      return "I couldn't figure out the timeframe. Try `summarize today`, `summarize this week`, or `summarize last 3 hours`.";
    }

    // Check if question mentions a specific channel or use current
    const isChannelSpecific = !/server|all\s+channels/i.test(question);
    let messages: Array<Record<string, unknown>>;

    if (isChannelSpecific) {
      messages = messageRepository.getByChannelSince(channelId, timeframe.since, 500);
    } else {
      messages = messageRepository.getByGuildSince(guildId, timeframe.since, 500);
    }

    if (messages.length === 0) {
      return `No messages found for ${timeframe.label}. Either nothing was said or I haven't archived those messages yet.`;
    }

    const formatted = messages.map(m => ({
      author: (m.global_display_name ?? m.username) as string,
      content: m.content as string,
      date: new Date(m.message_created_at as string).toLocaleTimeString(),
      channel: (m.channel_name as string) ?? 'this channel',
    }));

    const prompt = buildSummarizePrompt(formatted, timeframe.label);

    const model = 'claude-sonnet-4-5-20250929';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: getPrompt('SUMMARIZE_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: prompt }],
    });

    usageTracker.track('summarize', model, {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const summary = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Could not generate summary.';

    return `**TL;DR for ${timeframe.label}** (${messages.length} messages):\n${summary}`;
  },

  async sendReply(message: Message, text: string): Promise<void> {
    if (text.length <= 2000) {
      await message.reply(text);
    } else {
      const chunks = splitMessage(text, 1990);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await message.reply(chunks[i]);
        else if ('send' in message.channel) await message.channel.send(chunks[i]);
      }
    }
  },

  logQuery(message: Message, question: string, answer: string, startTime: number, inputTokens?: number, outputTokens?: number): void {
    try {
      queryLogRepository.insert({
        guild_id: message.guild!.id,
        channel_id: message.channel.id,
        asking_user_id: message.author.id,
        question,
        answer,
        context_tokens_used: inputTokens ?? null,
        response_tokens_used: outputTokens ?? null,
        model_used: 'claude-sonnet-4-5-20250929',
        response_time_ms: Date.now() - startTime,
      });
    } catch (err) {
      logger.error('Failed to log query', { error: err });
    }
  },
};

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1) splitIndex = maxLength;
    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }
  return chunks;
}
