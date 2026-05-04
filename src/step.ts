import type { type } from 'arktype';
import type { StepConfig, StepDefinition } from './types.js';

export function step<
  TOutput extends type.Any = type.Any,
  TParams = unknown,
  TActionOutput = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
>(
  config: StepConfig<TOutput, TParams, TActionOutput, TSteps>,
): StepDefinition<TOutput, TParams, TActionOutput, TSteps> {
  if (config.next === undefined) throw new Error('step: next is required');

  const definition: StepDefinition<TOutput, TParams, TActionOutput, TSteps> = {
    kind: 'step',
    config,
    extend(
      overrides: Partial<StepConfig<TOutput, TParams, TActionOutput, TSteps>>,
    ): StepDefinition<TOutput, TParams, TActionOutput, TSteps> {
      return step({ ...config, ...overrides } as StepConfig<TOutput, TParams, TActionOutput, TSteps>);
    },
  };

  return Object.freeze(definition);
}
