import type { z } from 'zod';
import type { SkillConfig, SkillDefinition } from './types.js';

export function skill<TContext extends z.ZodType = z.ZodType>(
  config: SkillConfig<TContext>,
): SkillDefinition<TContext> {
  const { name, entry, steps } = config;

  if (!name) throw new Error('skill: name is required');
  if (!entry) throw new Error('skill: entry is required');
  if (!steps || Object.keys(steps).length === 0) throw new Error('skill: at least one step is required');
  if (!(entry in steps)) throw new Error(`skill: entry step "${entry}" not found in steps`);

  const definition: SkillDefinition<TContext> = {
    kind: 'skill',
    name,
    version: config.version ?? '0.0.0',
    description: config.description ?? '',
    entry,
    context: config.context,
    steps: Object.freeze({ ...steps }),
    capabilities: config.capabilities,
    observers: config.observers,
    finalOutput: config.finalOutput,
    skillMd: config.skillMd,
  };

  return Object.freeze(definition);
}
