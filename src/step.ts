import type { z } from 'zod';
import type { StepConfig, StepDefinition } from './types.js';

export function step<
  TOutput extends z.ZodType = z.ZodType,
  TContext = unknown,
  TStash = unknown,
>(config: StepConfig<TOutput, TContext, TStash>): StepDefinition<TOutput, TContext, TStash> {
  if (!config.output) throw new Error('step: output schema is required');
  if (config.next === undefined) throw new Error('step: next is required');

  const definition: StepDefinition<TOutput, TContext, TStash> = {
    kind: 'step',
    config,
    extend(
      overrides: Partial<StepConfig<TOutput, TContext, TStash>>,
    ): StepDefinition<TOutput, TContext, TStash> {
      return step({ ...config, ...overrides });
    },
  };

  return Object.freeze(definition);
}
