import type { CliResult, PromptResult } from '../types.js';

const MAX_AUTO_ADVANCE = 20;

export interface Advanceable {
  isPromptless(stepName: string): boolean;
  advance(stepName: string, output: unknown): Promise<CliResult>;
}

export async function autoAdvance(
  engine: Advanceable,
  result: CliResult,
  onIntermediateResult?: (result: CliResult) => void,
): Promise<CliResult> {
  let current = result;
  let depth = 0;
  while ('step' in current && !('error' in current) && !('done' in current) && !('redirect' in current)) {
    const prompt = current as PromptResult;
    if (!engine.isPromptless(prompt.step)) break;
    depth += 1;
    if (depth > MAX_AUTO_ADVANCE) {
      throw new Error(`Auto-advance depth exceeded (${MAX_AUTO_ADVANCE}). Check for infinite prompt-less step loops.`);
    }
    onIntermediateResult?.(current);
    current = await engine.advance(prompt.step, {});
  }
  return current;
}
