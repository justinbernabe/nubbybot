# NubbyGPT

A Discord bot that archives all server messages, builds AI-powered user profiles, and answers questions about your server's history using Claude AI.

## Features

- **Message Archiving** - Automatically archives every message sent in the server
- **History Backfill** - Fetches and archives all historical messages from accessible channels
- **User Profiling** - AI-generated personality profiles including favorite games, topics, communication style, political leanings, and notable quotes
- **Name Tracking** - Records nickname and username changes over time
- **Question Answering** - @mention the bot to ask questions about server history and members
- **Conversation Summaries** - `@NubbyGPT summarize today` gives a 3-sentence TLDR of the day's conversations
- **Full-Text Search** - SQLite FTS5 index for fast message searching

## Quick Start

### Prerequisites
- Node.js 22+
- A Discord bot token ([Developer Portal](https://discord.com/developers/applications))
- An Anthropic API key ([Console](https://console.anthropic.com/))

### Discord Bot Setup
1. Go to https://discord.com/developers/applications/1363093908526993509
2. **Bot** tab: Enable these Privileged Gateway Intents:
   - `MESSAGE CONTENT`
   - `SERVER MEMBERS`
3. **OAuth2** tab: Generate an invite URL with scopes `bot` + `applications.commands` and permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
   - Use Slash Commands

### Local Development
```bash
git clone https://github.com/justinbernabe/nubbybot.git
cd nubbybot
cp .env.example .env     # Fill in your tokens
npm install
npm run register-commands # Register slash commands with Discord
npm run dev               # Start with hot reload
```

### Deploy on Synology / Homelab (Docker)

Since this is a private repo, Portainer can't pull from GitHub directly. Clone the repo onto your server and build locally.

**Option A: SSH + docker compose**
```bash
# SSH into your Synology/server
ssh your-server

# Clone the repo (or git pull to update)
git clone https://github.com/justinbernabe/nubbybot.git /opt/nubbybot
cd /opt/nubbybot

# Create your .env file
cp .env.example .env
nano .env  # Add your DISCORD_TOKEN and ANTHROPIC_API_KEY

# Create the config directory for persistent data
mkdir -p config

# Build and run
docker compose up -d
```

**Option B: Portainer Stacks**
1. Clone the repo to your server (e.g., `/opt/nubbybot`)
2. In Portainer: **Stacks** > **Add Stack** > **Repository**
3. Since the repo is private, use the local path method:
   - Or: **Stacks** > **Add Stack** > **Web editor**
   - Paste the docker-compose.yml contents
   - Set the build context path to where you cloned the repo
4. Add environment variables (DISCORD_TOKEN, ANTHROPIC_API_KEY) in the Portainer UI

**Data persistence**: The SQLite database is stored at `./config/nubbybot.db` (mounted as a bind mount). This survives container rebuilds.

### Register Slash Commands
Run this once (or after changing commands):
```bash
# Local
npm run register-commands

# Docker
docker exec nubbybot node dist/commands/register.js
```

## Usage

### @mention (primary interaction)
- `@NubbyGPT what does John think about pineapple on pizza?`
- `@NubbyGPT who plays Valorant the most?`
- `@NubbyGPT summarize today`
- `@NubbyGPT summarize this week`
- `@NubbyGPT summarize last 3 hours`
- `@NubbyGPT tldr`

### Slash Commands
- `/backfill` - Archive all historical messages (admin only)
- `/profile @user` - View a user's AI-generated profile
- `/profile @user rebuild:true` - Rebuild a profile from scratch
- `/ask <question>` - Ask a question about the server

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
  ai/
    claude.ts                 # Anthropic client
    promptTemplates.ts        # System prompts
    contextBuilder.ts         # Query context assembly
    queryHandler.ts           # @mention + summarize handling
  commands/
    register.ts               # Slash command registration
```

**Database**: SQLite with FTS5 full-text search, stored in `/config/nubbybot.db` inside the container.

**AI Model**: Claude Sonnet 4.5 for both profile generation and question answering.

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

## Updating
```bash
cd /opt/nubbybot
git pull
docker compose up -d --build
```
