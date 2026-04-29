import type { CliResult, StepResult } from '../types.js';
import type { SkillEngine } from './skill-engine.js';

const MAX_AUTO_ADVANCE = 20;

export async function autoAdvance(
  engine: SkillEngine,
  result: CliResult,
  onIntermediateResult?: (result: CliResult) => void,
): Promise<CliResult> {
  let current = result;
  let depth = 0;
  const collected: StepResult[] = [];

  while (current.kind === 'prompt') {
    if (!engine.isPromptless(current.step)) break;
    depth += 1;
    if (depth > MAX_AUTO_ADVANCE) {
      throw new Error(`Auto-advance depth exceeded (${MAX_AUTO_ADVANCE}). Check for infinite prompt-less step loops.`);
    }
    onIntermediateResult?.(current);
    current = await engine.advance(current.step, {});
    if (current.kind === 'prompt' || current.kind === 'done') {
      if (current.completed) {
        collected.push(current.completed);
      }
    }
  }

  if (collected.length === 0) return current;

  if (current.kind === 'prompt') {
    return { ...current, autoAdvanced: collected };
  }
  if (current.kind === 'done') {
    return { ...current, autoAdvanced: collected };
  }
  return current;
}
