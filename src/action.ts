import type { type } from 'arktype';
import type { ActionConfig, ActionDefinition } from './types.js';

export function action<TInput extends type.Any, TOutput extends type.Any>(
  config: ActionConfig<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
  if (!config.name) throw new Error('action: name is required');
  if (!config.input) throw new Error('action: input schema is required');
  if (!config.output) throw new Error('action: output schema is required');
  if (!config.run) throw new Error('action: run function is required');

  const definition: ActionDefinition<TInput, TOutput> = {
    kind: 'action',
    name: config.name,
    input: config.input,
    output: config.output,
    run: config.run,
  };

  return Object.freeze(definition);
}
