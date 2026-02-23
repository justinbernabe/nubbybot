import { settingsRepository } from '../admin/settingsRepository.js';
import { logger } from '../utils/logger.js';

const SETTINGS_KEY = 'custom_instructions';

interface TrainingInstruction {
  text: string;
  addedAt: string;
  source: 'dm' | 'admin';
}

function getInstructions(): TrainingInstruction[] {
  const raw = settingsRepository.get(SETTINGS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveInstructions(instructions: TrainingInstruction[]): void {
  settingsRepository.set(SETTINGS_KEY, JSON.stringify(instructions));
}

export const trainingManager = {
  addInstruction(text: string, source: 'dm' | 'admin'): TrainingInstruction[] {
    const instructions = getInstructions();
    instructions.push({
      text: text.trim(),
      addedAt: new Date().toISOString(),
      source,
    });
    saveInstructions(instructions);
    logger.info(`Training instruction added: "${text.trim()}" (source: ${source})`);
    return instructions;
  },

  getInstructions(): TrainingInstruction[] {
    return getInstructions();
  },

  removeInstruction(index: number): TrainingInstruction[] | null {
    const instructions = getInstructions();
    if (index < 0 || index >= instructions.length) return null;
    instructions.splice(index, 1);
    saveInstructions(instructions);
    logger.info(`Training instruction removed at index ${index}`);
    return instructions;
  },

  clearAll(): void {
    settingsRepository.delete(SETTINGS_KEY);
    logger.info('All training instructions cleared');
  },

  buildInstructionsBlock(): string {
    const instructions = getInstructions();
    if (instructions.length === 0) return '';
    let block = '\n\nCUSTOM INSTRUCTIONS (from bot owner — follow these):\n';
    for (const inst of instructions) {
      block += `- ${inst.text}\n`;
    }
    return block;
  },

  handleCommand(content: string, source: 'dm' | 'admin'): string | null {
    const trimmed = content.trim();

    // "train: <instruction>"
    const trainMatch = trimmed.match(/^train:\s*(.+)/is);
    if (trainMatch) {
      const instruction = trainMatch[1].trim();
      if (!instruction) return 'Train what? Give me an instruction after "train:".';
      const instructions = trainingManager.addInstruction(instruction, source);
      return `Got it. Instruction saved (${instructions.length} total). I'll follow this going forward.`;
    }

    // "show training"
    if (/^show\s+training$/i.test(trimmed)) {
      const instructions = getInstructions();
      if (instructions.length === 0) return 'No custom instructions set.';
      let response = `**Custom Instructions (${instructions.length}):**\n`;
      instructions.forEach((inst, i) => {
        response += `${i + 1}. ${inst.text} _(added ${new Date(inst.addedAt).toLocaleDateString()})_\n`;
      });
      return response;
    }

    // "clear training"
    if (/^clear\s+training$/i.test(trimmed)) {
      trainingManager.clearAll();
      return 'All custom instructions cleared. Back to defaults.';
    }

    // "remove training: <number>"
    const removeMatch = trimmed.match(/^remove\s+training:\s*(\d+)/i);
    if (removeMatch) {
      const index = parseInt(removeMatch[1], 10) - 1; // 1-based to 0-based
      const result = trainingManager.removeInstruction(index);
      if (result === null) return 'Invalid instruction number. Use "show training" to see the list.';
      return `Removed. ${result.length} instruction(s) remaining.`;
    }

    return null; // Not a training command
  },
};
