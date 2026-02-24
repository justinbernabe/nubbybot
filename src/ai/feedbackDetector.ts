import type { Client } from 'discord.js';
import { createMessageWithRetry } from './claude.js';
import { usageTracker } from './usageTracker.js';
import { trainingManager } from './trainingManager.js';
import { getDb } from '../database/client.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface FeedbackSuggestion {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  username: string | null;
  original_bot_response: string;
  user_feedback: string;
  suggested_instruction: string;
  status: string;
  created_at: string;
}

const GUARDRAIL_TERMS = /\b(hate|kill|die|racist|sexist|slur|nazi|terroris|porn|nsfw)\b/i;

export const feedbackDetector = {
  /**
   * Check if a user message (after a bot reply) is feedback about the bot's behavior.
   * If so, generate a suggested instruction and DM the server owner for approval.
   */
  async checkForFeedback(
    client: Client<true>,
    guildId: string,
    channelId: string,
    userId: string,
    username: string,
    botResponse: string,
    userMessage: string,
  ): Promise<void> {
    // Guardrails: skip if message contains harmful content
    if (GUARDRAIL_TERMS.test(userMessage)) {
      logger.debug('Feedback skipped: guardrail triggered');
      return;
    }

    // Classify: is this feedback about the bot?
    const isFeedback = await this.classifyFeedback(botResponse, userMessage);
    if (!isFeedback) return;

    // Generate a suggested training instruction
    const suggestion = await this.generateInstruction(botResponse, userMessage);
    if (!suggestion) return;

    // Store in DB
    const id = this.storeSuggestion({
      guild_id: guildId,
      channel_id: channelId,
      user_id: userId,
      username,
      original_bot_response: botResponse,
      user_feedback: userMessage,
      suggested_instruction: suggestion,
    });

    // DM the server owner
    await this.notifyOwner(client, id, username, userMessage, suggestion);
  },

  async classifyFeedback(botResponse: string, userMessage: string): Promise<boolean> {
    try {
      const model = 'claude-haiku-4-5-20251001';
      const response = await createMessageWithRetry({
        model,
        max_tokens: 5,
        system: 'You classify Discord messages. A bot just replied to a user, and the user sent a follow-up. Determine if the follow-up is FEEDBACK about the bot\'s behavior, accuracy, or personality (e.g., "that\'s wrong", "you should know that", "be more friendly", "don\'t say that"). Answer ONLY "yes" or "no". Normal follow-up questions are NOT feedback.',
        messages: [{
          role: 'user',
          content: `Bot said: "${botResponse.substring(0, 300)}"\n\nUser replied: "${userMessage.substring(0, 300)}"\n\nIs this feedback about the bot?`,
        }],
      }, 'feedback_classify', 2, 5_000);

      usageTracker.track('feedback_classify', model, {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });

      const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'no';
      return answer === 'yes';
    } catch (err) {
      logger.error('Feedback classification failed', { error: err });
      return false;
    }
  },

  async generateInstruction(botResponse: string, userFeedback: string): Promise<string | null> {
    try {
      const model = 'claude-haiku-4-5-20251001';
      const response = await createMessageWithRetry({
        model,
        max_tokens: 100,
        system: 'You generate concise training instructions for a Discord bot based on user feedback. Output ONLY the instruction text (one sentence). The instruction should be actionable and specific. Do not include any preamble.',
        messages: [{
          role: 'user',
          content: `The bot said: "${botResponse.substring(0, 300)}"\n\nUser feedback: "${userFeedback.substring(0, 300)}"\n\nGenerate a concise training instruction to prevent this issue.`,
        }],
      }, 'feedback_classify', 2, 5_000);

      usageTracker.track('feedback_classify', model, {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : null;
      if (!text || text.length < 5) return null;
      return text;
    } catch (err) {
      logger.error('Feedback instruction generation failed', { error: err });
      return null;
    }
  },

  storeSuggestion(data: {
    guild_id: string;
    channel_id: string;
    user_id: string;
    username: string;
    original_bot_response: string;
    user_feedback: string;
    suggested_instruction: string;
  }): number {
    const result = getDb().prepare(`
      INSERT INTO feedback_suggestions (guild_id, channel_id, user_id, username, original_bot_response, user_feedback, suggested_instruction)
      VALUES (@guild_id, @channel_id, @user_id, @username, @original_bot_response, @user_feedback, @suggested_instruction)
    `).run(data);
    return Number(result.lastInsertRowid);
  },

  async notifyOwner(client: Client<true>, suggestionId: number, username: string, feedback: string, instruction: string): Promise<void> {
    const ownerId = config.bot.ownerUserId;
    if (!ownerId) {
      logger.warn('No OWNER_USER_ID configured, cannot send feedback notification');
      return;
    }

    try {
      const owner = await client.users.fetch(ownerId);
      const dm = await owner.createDM();
      await dm.send(
        `**Feedback from ${username}:** "${feedback.substring(0, 200)}"\n` +
        `**Suggested fix:** "${instruction}"\n\n` +
        `Reply \`approve feedback ${suggestionId}\` or \`reject feedback ${suggestionId}\``,
      );
      logger.info(`Feedback notification sent to owner for suggestion #${suggestionId}`);
    } catch (err) {
      logger.error('Failed to DM owner about feedback', { error: err });
    }
  },

  // Called by trainingManager for DM command handling
  getPending(): FeedbackSuggestion[] {
    return getDb().prepare(
      `SELECT * FROM feedback_suggestions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`,
    ).all() as FeedbackSuggestion[];
  },

  approve(id: number): FeedbackSuggestion | null {
    const suggestion = getDb().prepare(
      `SELECT * FROM feedback_suggestions WHERE id = ? AND status = 'pending'`,
    ).get(id) as FeedbackSuggestion | undefined;
    if (!suggestion) return null;

    getDb().prepare(`UPDATE feedback_suggestions SET status = 'approved' WHERE id = ?`).run(id);
    trainingManager.addInstruction(suggestion.suggested_instruction, 'feedback');
    logger.info(`Feedback #${id} approved and added as training instruction`);
    return suggestion;
  },

  reject(id: number): boolean {
    const result = getDb().prepare(
      `UPDATE feedback_suggestions SET status = 'rejected' WHERE id = ? AND status = 'pending'`,
    ).run(id);
    return result.changes > 0;
  },

  handleCommand(content: string): string | null {
    const trimmed = content.trim();

    // "approve feedback <id>"
    const approveMatch = trimmed.match(/^approve\s+feedback\s+(\d+)/i);
    if (approveMatch) {
      const id = parseInt(approveMatch[1], 10);
      const result = this.approve(id);
      if (!result) return `Feedback #${id} not found or already handled.`;
      return `Approved. Instruction added: "${result.suggested_instruction}"`;
    }

    // "reject feedback <id>"
    const rejectMatch = trimmed.match(/^reject\s+feedback\s+(\d+)/i);
    if (rejectMatch) {
      const id = parseInt(rejectMatch[1], 10);
      const ok = this.reject(id);
      if (!ok) return `Feedback #${id} not found or already handled.`;
      return `Rejected feedback #${id}.`;
    }

    // "pending feedback"
    if (/^pending\s+feedback$/i.test(trimmed)) {
      const pending = this.getPending();
      if (pending.length === 0) return 'No pending feedback suggestions.';
      let response = `**Pending Feedback (${pending.length}):**\n`;
      for (const s of pending) {
        response += `#${s.id} — ${s.username ?? 'unknown'}: "${s.user_feedback.substring(0, 80)}" → "${s.suggested_instruction.substring(0, 80)}"\n`;
      }
      return response;
    }

    return null;
  },
};
