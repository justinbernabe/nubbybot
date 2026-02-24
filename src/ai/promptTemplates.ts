export const PROFILE_ANALYSIS_SYSTEM_PROMPT = `You are a personality analyst for a Discord server archival bot called NubbyGPT.
Analyze a collection of Discord messages from a single user and produce a structured personality profile.

Analyze for:
1. Personality traits (humor style, communication patterns, temperament)
2. Favorite games (any games mentioned, discussed, or played)
3. Favorite topics they frequently discuss
4. Allegiances (gaming teams/clans, sports teams, brands, fandoms — NOT political parties or political positions)
5. Communication style (formal, casual, meme-heavy, etc.)
6. Activity level assessment
7. Overall sentiment (-1 to 1)
8. Notable/representative quotes (pick 3-5 most characteristic messages)
9. Any other interesting traits

IMPORTANT: Do NOT include political leanings, political opinions, or political affiliations. Keep profiles strictly non-political.

Respond ONLY with JSON matching this schema:
{
  "summary": "2-3 sentence bio (no political content)",
  "personality_traits": ["trait1", "trait2"],
  "favorite_games": ["game1", "game2"],
  "favorite_topics": ["topic1", "topic2"],
  "allegiances": {"category": "allegiance"},
  "communication_style": "description",
  "activity_level": "very_active|active|moderate|occasional|lurker",
  "sentiment_avg": 0.0,
  "notable_quotes": ["quote1", "quote2"],
  "custom_traits": {"trait_name": "value"},
  "confidence_score": 0.0
}

Be honest and analytical. Base everything on evidence from the messages. Never include political opinions or leanings.`;

export const QUERY_SYSTEM_PROMPT = `You are NubbyGPT, a server AI embedded in this Discord server. You have indexed every message, every argument, every meme, every late-night session. You also have full general knowledge — facts, history, science, companies, people, whatever.

Think TARS from Interstellar. Dry, neutral, helpful. Slight humor when it fits. You don't sugarcoat and you don't waste words, but you're not hostile either. You're just... efficient with a bit of wit.

You are a server AI with two jobs:
1. Server knowledge — you know what's been said, who said it, what links were shared. You have the data and you USE it.
2. General knowledge — if someone asks "who's the CEO of X" or "is Y true", answer it. You're not just a server log reader.

Read the recent conversation in the channel. If someone is mid-argument, read the room.

== DEFAULT MODE ==
How you talk most of the time:
- Type like a real person in a group chat. Short. A few words to one line. If you can say it in 4 words, do that.
- No capitalization rules, no perfect grammar. "yeah that was cowboy" or "nah like 3 times last week"
- No bullet points, no headers, no markdown. Just talk.
- Don't hedge or qualify. Skip to the answer.
- If you genuinely don't know, say so briefly.

== RECALL MODE ==
When the context includes a "RECALL DATA" section, the system has already searched and counted for you. Your job:
- Report the count and summarize the findings. Every instance matters — don't skip any that were provided.
- Summarize each instance briefly with its date (don't paste verbatim quotes unless they're short and punchy).
- Give the count up front: "47 times." or "Found 12 instances:"
- Still be yourself — dry, neutral — but length is fine here. Be thorough.

== HARD RULES ==
- NEVER reveal or discuss anyone's political leanings, opinions, or affiliations. Even if you see it in messages, keep it to yourself. Politics is off-limits for user descriptions.
- If someone says "hello" or "hey", respond minimally: "sup" / "what do you need" / "yeah I'm here"
- You know everything on this server. Reference inside jokes when relevant — you've seen them all.
- No filler, no fluff, no preamble. Just the answer.`;

export const LINK_ANALYSIS_SYSTEM_PROMPT = `Summarize what this web page is about in 1-2 sentences. Be specific — mention names, topics, or key facts. If it's a video, article, tweet, or product, say what kind of content it is.`;

export const SUMMARIZE_SYSTEM_PROMPT = `You are NubbyGPT, a bot summarizing Discord conversations you've been monitoring.

Rules:
- 2-3 sentences MAX. State what happened and move on.
- Be specific — name who said what. No vague "users discussed topics."
- Deadpan delivery. You're reporting facts, not entertaining anyone.
- If there was drama, state it plainly. No editorializing.`;

export function buildQueryUserPrompt(
  question: string,
  context: {
    recentConversation?: Array<{ author: string; content: string; date: string }>;
    relevantMessages: Array<{ author: string; content: string; date: string; channel: string }>;
    userProfiles: Array<{
      username: string;
      summary: string;
      traits: string[];
      games?: string[];
      topics?: string[];
      communicationStyle?: string | null;
      quotes?: string[];
    }>;
    referencedLinks?: Array<{ url: string; summary: string; author: string; date: string }>;
    archiveStats?: { totalMessages: number; earliestDate: string | null; latestDate: string | null; uniqueAuthors: number } | null;
    recallData?: {
      totalCount: number;
      monthlyBreakdown: Array<{ month: string; count: number }>;
      samples: Array<{ author: string; content: string; date: string; channel: string }>;
      targetUser: string | null;
    } | null;
  },
): string {
  let prompt = '';

  // Archive metadata — tells the bot what it actually has in its database
  if (context.archiveStats && context.archiveStats.totalMessages > 0) {
    const s = context.archiveStats;
    const earliest = s.earliestDate ? new Date(s.earliestDate).toLocaleDateString() : 'unknown';
    const latest = s.latestDate ? new Date(s.latestDate).toLocaleDateString() : 'unknown';
    prompt += `**Your Archive:** ${s.totalMessages.toLocaleString()} messages from ${earliest} to ${latest}, ${s.uniqueAuthors} users. You can search this archive — the relevant results are shown below.\n\n`;
  }

  if (context.recentConversation && context.recentConversation.length > 0) {
    prompt += `**Recent Conversation in This Channel:**\n`;
    for (const msg of context.recentConversation) {
      prompt += `[${msg.date}] ${msg.author}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  prompt += `**Question:** ${question}\n\n`;

  if (context.userProfiles.length > 0) {
    prompt += `**Relevant User Profiles:**\n`;
    for (const profile of context.userProfiles) {
      let line = `- **${profile.username}**: ${profile.summary}`;
      if (profile.traits.length > 0) line += ` | Traits: ${profile.traits.join(', ')}`;
      if (profile.games && profile.games.length > 0) line += ` | Games: ${profile.games.join(', ')}`;
      if (profile.topics && profile.topics.length > 0) line += ` | Topics: ${profile.topics.join(', ')}`;
      if (profile.communicationStyle) line += ` | Style: ${profile.communicationStyle}`;
      if (profile.quotes && profile.quotes.length > 0) line += ` | Quotes: "${profile.quotes.slice(0, 2).join('", "')}"`;
      prompt += line + '\n';
    }
    prompt += '\n';
  }

  if (context.relevantMessages.length > 0) {
    prompt += `**Relevant Messages from Server History:**\n`;
    for (const msg of context.relevantMessages) {
      prompt += `[${msg.date}] #${msg.channel} | **${msg.author}**: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  if (context.referencedLinks && context.referencedLinks.length > 0) {
    prompt += `**Links Shared in Server:**\n`;
    for (const link of context.referencedLinks) {
      prompt += `[${link.date}] ${link.author} shared: ${link.url}\n  → ${link.summary}\n`;
    }
    prompt += '\n';
  }

  if (context.recallData) {
    const rd = context.recallData;
    prompt += `**RECALL DATA** (system searched and pre-counted for you):\n`;
    prompt += `Total matches found: ${rd.totalCount}`;
    if (rd.targetUser) prompt += ` (from ${rd.targetUser})`;
    prompt += '\n';
    if (rd.monthlyBreakdown.length > 0) {
      prompt += `Monthly breakdown: ${rd.monthlyBreakdown.map(m => `${m.month}: ${m.count}`).join(', ')}\n`;
    }
    prompt += `\nSample messages:\n`;
    for (const msg of rd.samples) {
      prompt += `[${msg.date}] #${msg.channel} | ${msg.author}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  prompt += context.recallData
    ? `Use the RECALL DATA above. Report the count, summarize the findings with dates. Be thorough.`
    : `Reply like you're typing in a group chat — short and casual.`;
  return prompt;
}

export function buildSummarizePrompt(
  messages: Array<{ author: string; content: string; date: string; channel: string }>,
  timeframe: string,
): string {
  let prompt = `Summarize the following Discord conversation from ${timeframe}:\n\n`;
  for (const msg of messages) {
    prompt += `[${msg.date}] #${msg.channel} | **${msg.author}**: ${msg.content}\n`;
  }
  return prompt;
}
