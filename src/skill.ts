import type { type } from 'arktype';
import type { SkillBuilderConfig } from './types.js';
import { SkillBuilder } from './skill-builder.js';

export function skill<TParams extends type.Any = type.Any>(
  config: SkillBuilderConfig<TParams>,
): SkillBuilder<TParams['infer']> {
  return new SkillBuilder<TParams['infer']>(config);
}
