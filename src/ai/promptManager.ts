import {
  QUERY_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
  PROFILE_ANALYSIS_SYSTEM_PROMPT,
  LINK_ANALYSIS_SYSTEM_PROMPT,
  IMAGE_ANALYSIS_SYSTEM_PROMPT,
} from './promptTemplates.js';
import { settingsRepository } from '../admin/settingsRepository.js';
import { trainingManager } from './trainingManager.js';

const PROMPT_KEYS = {
  QUERY_SYSTEM_PROMPT: 'prompt:QUERY_SYSTEM_PROMPT',
  SUMMARIZE_SYSTEM_PROMPT: 'prompt:SUMMARIZE_SYSTEM_PROMPT',
  PROFILE_ANALYSIS_SYSTEM_PROMPT: 'prompt:PROFILE_ANALYSIS_SYSTEM_PROMPT',
  LINK_ANALYSIS_SYSTEM_PROMPT: 'prompt:LINK_ANALYSIS_SYSTEM_PROMPT',
  IMAGE_ANALYSIS_SYSTEM_PROMPT: 'prompt:IMAGE_ANALYSIS_SYSTEM_PROMPT',
} as const;

const DEFAULTS: Record<string, string> = {
  QUERY_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
  PROFILE_ANALYSIS_SYSTEM_PROMPT,
  LINK_ANALYSIS_SYSTEM_PROMPT,
  IMAGE_ANALYSIS_SYSTEM_PROMPT,
};

type PromptName = keyof typeof PROMPT_KEYS;

export function getPrompt(name: PromptName): string {
  const base = settingsRepository.get(PROMPT_KEYS[name]) ?? DEFAULTS[name];
  if (name === 'QUERY_SYSTEM_PROMPT') {
    return base + trainingManager.buildInstructionsBlock();
  }
  return base;
}

export function getPromptInfo(name: PromptName) {
  const override = settingsRepository.get(PROMPT_KEYS[name]);
  return {
    current: override ?? DEFAULTS[name],
    default: DEFAULTS[name],
    isOverridden: override !== undefined,
  };
}

export function setPromptOverride(name: PromptName, value: string): void {
  settingsRepository.set(PROMPT_KEYS[name], value);
}

export function clearPromptOverride(name: PromptName): void {
  settingsRepository.delete(PROMPT_KEYS[name]);
}

export function getAllPromptInfo() {
  const result: Record<string, ReturnType<typeof getPromptInfo>> = {};
  for (const name of Object.keys(PROMPT_KEYS) as PromptName[]) {
    result[name] = getPromptInfo(name);
  }
  return result;
}
