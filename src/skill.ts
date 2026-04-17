import type { z } from 'zod';
import type { SkillBuilderConfig } from './types.js';
import { SkillBuilder } from './skill-builder.js';

export function skill<TContext extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType>(
  config: SkillBuilderConfig<TContext, TStash>,
): SkillBuilder<z.infer<TContext>, z.infer<TStash>> {
  return new SkillBuilder<z.infer<TContext>, z.infer<TStash>>(config);
}
