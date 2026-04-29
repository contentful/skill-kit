import type { z } from 'zod';
import type { StepConfig, StepDefinition } from './types.js';

export function step<
  TOutput extends z.ZodType = z.ZodType,
  TParams = unknown,
  TStash = unknown,
  TActionOutput = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
>(
  config: StepConfig<TOutput, TParams, TStash, TActionOutput, TSteps>,
): StepDefinition<TOutput, TParams, TStash, TActionOutput, TSteps> {
  if (config.next === undefined) throw new Error('step: next is required');

  const definition: StepDefinition<TOutput, TParams, TStash, TActionOutput, TSteps> = {
    kind: 'step',
    config,
    extend(
      overrides: Partial<StepConfig<TOutput, TParams, TStash, TActionOutput, TSteps>>,
    ): StepDefinition<TOutput, TParams, TStash, TActionOutput, TSteps> {
      return step({ ...config, ...overrides });
    },
  };

  return Object.freeze(definition);
}
