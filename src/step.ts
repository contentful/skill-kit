import type { z } from 'zod';
import type { StepConfig, StepDefinition } from './types.js';

export function step<TOutput extends z.ZodType = z.ZodType>(config: StepConfig<TOutput>): StepDefinition<TOutput> {
  if (!config.output) throw new Error('step: output schema is required');
  if (config.next === undefined) throw new Error('step: next is required');

  const definition: StepDefinition<TOutput> = {
    kind: 'step',
    config,
    extend(overrides: Partial<StepConfig<TOutput>>): StepDefinition<TOutput> {
      return step({ ...config, ...overrides });
    },
  };

  return Object.freeze(definition);
}
