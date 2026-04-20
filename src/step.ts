import type { z } from 'zod';
import type { StepConfig, StepDefinition } from './types.js';

export function step<
  TOutput extends z.ZodType = z.ZodType,
  TContext = unknown,
  TStash = unknown,
  TActionOutput = unknown,
>(
  config: StepConfig<TOutput, TContext, TStash, TActionOutput>,
): StepDefinition<TOutput, TContext, TStash, TActionOutput> {
  if (!config.output) throw new Error('step: output schema is required');
  if (config.next === undefined) throw new Error('step: next is required');

  const definition: StepDefinition<TOutput, TContext, TStash, TActionOutput> = {
    kind: 'step',
    config,
    extend(
      overrides: Partial<StepConfig<TOutput, TContext, TStash, TActionOutput>>,
    ): StepDefinition<TOutput, TContext, TStash, TActionOutput> {
      return step({ ...config, ...overrides });
    },
  };

  return Object.freeze(definition);
}
