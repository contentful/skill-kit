import type { type } from 'arktype';
import type { SkillBuilderConfig } from './types.js';
import { SkillBuilder } from './skill-builder.js';

export function skill<TParams extends type.Any = type.Any, TStash extends type.Any = type.Any>(
  config: SkillBuilderConfig<TParams, TStash>,
): SkillBuilder<TParams['infer'], TStash['infer']> {
  return new SkillBuilder<TParams['infer'], TStash['infer']>(config);
}
