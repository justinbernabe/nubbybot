# NubbyGPT

A Discord bot that archives all server messages, builds AI-powered user profiles, and answers questions about your server's history using Claude AI.

## Features

- **Message Archiving** - Automatically archives every message sent in the server
- **History Backfill** - Fetches and archives all historical messages from accessible channels
- **User Profiling** - AI-generated personality profiles including favorite games, topics, communication style, and notable quotes
- **Name Tracking** - Records nickname and username changes over time
- **Question Answering** - @mention the bot to ask questions about server history and members
- **Conversation Summaries** - `@NubbyGPT summarize today` gives a 3-sentence TLDR of the day's conversations
- **Full-Text Search** - SQLite FTS5 index for fast message searching
- **DM Support** - Direct message the bot to chat privately using server data as context
- **Training Mode** - Owner can teach the bot new behaviors via DM (e.g., "train: be more sarcastic")
- **Channel Lock** - Restrict bot responses to specific channels while still archiving everywhere
- **Link Analysis** - Automatically fetches and summarizes URLs posted in chat
- **Admin Panel** - Web dashboard on port 7774 with stats, logs, prompt editor, and chat interface

## Bot Commands

### @mention (in server)
| Command | Description |
|---------|-------------|
| `@NubbyGPT <question>` | Ask anything — server history, general knowledge, trivia |
| `@NubbyGPT summarize today` | Summarize today's conversation |
| `@NubbyGPT summarize this week` | Summarize this week's conversation |
| `@NubbyGPT summarize last 3 hours` | Summarize a specific time range |
| `@NubbyGPT tldr` | Quick summary of today |

### Slash Commands
| Command | Permission | Description |
|---------|------------|-------------|
| `/backfill` | Admin | Archive all historical messages from all channels |
| `/backfill force:True` | Admin | Re-archive everything, even already-backfilled channels |
| `/profile @user` | Anyone | View a user's AI-generated personality profile |
| `/profile @user rebuild:True` | Anyone | Force-rebuild a profile from scratch |
| `/ask <question>` | Anyone | Ask a question (alternative to @mention) |

### Direct Messages
| Command | Who | Description |
|---------|-----|-------------|
| Any message | Anyone | Ask the bot anything privately — uses server data for context |
| `train: <instruction>` | Owner only | Add a persistent behavioral instruction |
| `show training` | Owner only | List all custom instructions |
| `clear training` | Owner only | Remove all custom instructions |
| `remove training: <number>` | Owner only | Remove a specific instruction by number |

### Admin Panel (port 7774)
- Dashboard with server stats and API usage
- Live log viewer
- Runtime prompt editor (edit bot personality without redeploying)
- Chat interface (same as Discord, supports training commands)
- Link scrape trigger (analyze URLs from past messages)
- Profile build trigger

## Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot** tab: Enable these Privileged Gateway Intents:
   - `MESSAGE CONTENT`
   - `SERVER MEMBERS`
3. **OAuth2** tab: Generate an invite URL with scopes `bot` + `applications.commands` and permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
   - Use Slash Commands
   - Embed Links
   - Add Reactions

## Deploy on Synology / Homelab (Portainer)

1. In Portainer: **Stacks** > **Add Stack** > **Web editor**
2. Paste the contents of `docker-compose.yml`
3. Add environment variables in the Portainer UI:
   - `DISCORD_TOKEN` = your bot token
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy

**Data persistence**: The SQLite database is stored at `/config/nubbybot.db`. The `/config` volume is mounted to your Synology at `/volume2/docker-ssd/nubbybot/config`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_APP_ID` | No | Defaults to `1363093908526993509` |
| `ANTHROPIC_API_KEY` | Yes | API key from Anthropic Console |
| `DB_PATH` | No | SQLite path (defaults to `/config/nubbybot.db`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |
| `BACKFILL_BATCH_DELAY_MS` | No | Delay between backfill batches (default: `1000`) |
| `PROFILE_UPDATE_INTERVAL_HOURS` | No | Hours between profile rebuilds (default: `24`) |
| `ADMIN_PORT` | No | Admin panel port (default: `7774`) |
| `ADMIN_TOKEN` | No | Bearer token for admin panel auth (empty = no auth) |
| `ALLOWED_CHANNEL_IDS` | No | Comma-separated channel IDs where bot responds (empty = all) |
| `PRIMARY_GUILD_ID` | No | Server ID for DM context (auto-detects if not set) |
| `OWNER_USER_ID` | No | Your Discord user ID (enables training commands in DMs) |
| `ALLOWED_DM_USER_IDS` | No | Comma-separated user IDs allowed to DM the bot (empty = owner + anyone) |

## Architecture

```
src/
  index.ts                    # Entry point
  config.ts                   # Environment config
  bot/
    client.ts                 # Discord.js client setup
    events/                   # Event handlers (messageCreate, etc.)
  database/
    client.ts                 # SQLite connection (better-sqlite3)
    migrations.ts             # Schema + FTS5 setup
    repositories/             # Data access layer
  services/
    archiveService.ts         # Message archiving
    backfillService.ts        # Historical message fetching
    profileService.ts         # AI profile generation
    linkAnalysisService.ts    # URL extraction and summarization
  ai/
    claude.ts                 # Anthropic client
    promptTemplates.ts        # System prompts
    promptManager.ts          # Runtime prompt overrides
    trainingManager.ts        # Custom instruction persistence
    contextBuilder.ts         # Query context assembly
    queryHandler.ts           # @mention, DM, summarize, follow-up handling
  admin/
    server.ts                 # HTTP server (port 7774)
    handlers/                 # API + page handlers
    templates/                # Inline HTML templates
  commands/
    register.ts               # Slash command registration
```
