import type { z } from 'zod';
import type { SkillBuilderConfig } from './types.js';
import { SkillBuilder } from './skill-builder.js';

export function skill<TParams extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType>(
  config: SkillBuilderConfig<TParams, TStash>,
): SkillBuilder<z.infer<TParams>, z.infer<TStash>> {
  return new SkillBuilder<z.infer<TParams>, z.infer<TStash>>(config);
}
