// Typed API client for all admin panel endpoints

export interface StatsResponse {
  messages: { total: number; today: number };
  users: { total: number; withProfiles: number };
  channels: { total: number; backfillComplete: number };
  guilds: { total: number };
  links: { analyzed: number; total: number };
  queries: { total: number; today: number; avgResponseMs: number | null };
  uptime: number;
  version: string;
}

export interface CostRow {
  callType: string;
  label: string;
  model: string;
  callCount: number;
  totalInput: number;
  totalOutput: number;
  costLevel: 'HIGH' | 'NORMAL';
  estimatedCost: number;
}

export interface CostsResponse {
  byType: CostRow[];
  today: {
    call_count: number;
    total_input: number;
    total_output: number;
    estimatedCost: number;
  };
  allTime: { estimatedCost: number };
  activeFollowUpWindows: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  error?: string;
}

export interface PromptInfo {
  current: string;
  default: string;
  isOverridden: boolean;
}

export interface PromptsResponse {
  prompts: Record<string, PromptInfo>;
}

export interface SettingsResponse {
  settings: Record<string, string>;
}

export interface Guild {
  id: string;
  name: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  fetchStats: () => apiFetch<StatsResponse>('/api/stats'),

  fetchCosts: () => apiFetch<CostsResponse>('/api/costs'),

  fetchLogs: (level?: string, since?: string) => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (since) params.set('since', since);
    return apiFetch<{ logs: LogEntry[] }>(`/api/logs?${params}`);
  },

  fetchPrompts: () => apiFetch<PromptsResponse>('/api/prompts'),

  updatePrompt: (key: string, value: string) =>
    apiFetch<{ ok: boolean }>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),

  resetPrompt: (key: string) =>
    apiFetch<{ ok: boolean }>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  fetchSettings: () => apiFetch<SettingsResponse>('/api/settings'),

  fetchGuilds: () => apiFetch<{ guilds: Guild[] }>('/api/guilds'),

  sendChat: (question: string, guildId: string) =>
    apiFetch<{ answer?: string; error?: string }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, guildId }),
    }),

  startLinkScrape: (guildId: string) =>
    apiFetch<{ ok: boolean; message: string }>('/api/link-scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId }),
    }),

  getLinkScrapeStatus: () => apiFetch<{ running: boolean }>('/api/link-scrape/status'),

  startProfileBuild: (guildId: string) =>
    apiFetch<{ ok: boolean; message: string }>('/api/profile-build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId }),
    }),

  getProfileBuildStatus: () => apiFetch<{ running: boolean }>('/api/profile-build/status'),

  login: (token: string) =>
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
};
