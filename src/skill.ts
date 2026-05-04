import type { type } from 'arktype';
import type { SkillBuilderConfig } from './types.js';
import type { InferStores, GuaranteeState, BranchState } from './types/store.js';
import { SkillBuilder } from './skill-builder.js';

export function skill<
  TParams extends type.Any = type.Any,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TStoreSchemas extends Record<string, type.Any> = {},
>(
  config: Omit<SkillBuilderConfig<TParams>, 'stores'> & { stores?: TStoreSchemas },
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
): SkillBuilder<TParams['infer'], {}, GuaranteeState, BranchState, InferStores<TStoreSchemas>> {
  return new SkillBuilder<TParams['infer'], {}, GuaranteeState, BranchState, InferStores<TStoreSchemas>>(
    config as SkillBuilderConfig,
  );
}
