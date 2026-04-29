import type { PromptResult, CliResult } from '../types.js';
import type { HistoryEntry } from './types.js';

export interface SkillEngine {
  start(): PromptResult;
  advance(stepName: string, output: unknown): Promise<CliResult>;
  isPromptless(stepName: string): boolean;
  replayHistory(history: HistoryEntry[]): void;
}
