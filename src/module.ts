import type { z } from 'zod';
import type { ModuleDefinition, StepConfig, StepDefinition } from './types.js';
import { step as createStep } from './step.js';

export interface ModuleConfig<TModuleStash extends z.ZodType = z.ZodType> {
  name: string;
  entry: string;
  stash: TModuleStash;
}

export class ModuleBuilder<TStashSchema extends z.ZodType> {
  private readonly config: ModuleConfig<TStashSchema>;
  private readonly steps: Record<string, StepDefinition> = {};

  constructor(config: ModuleConfig<TStashSchema>) {
    this.config = config;
  }

  step<TOutput extends z.ZodType>(
    name: string,
    configOrDef: StepConfig<TOutput, unknown, z.infer<TStashSchema>> | StepDefinition,
  ): ModuleBuilder<TStashSchema> {
    if ('kind' in configOrDef && configOrDef.kind === 'step') {
      this.steps[name] = configOrDef;
    } else {
      this.steps[name] = createStep(configOrDef as StepConfig);
    }
    return this;
  }

  build(): ModuleDefinition<TStashSchema> {
    const { name, entry } = this.config;

    if (!name) throw new Error('module: name is required');
    if (!entry) throw new Error('module: entry is required');
    if (Object.keys(this.steps).length === 0) throw new Error('module: at least one step is required');
    if (!(entry in this.steps)) throw new Error(`module: entry step "${entry}" not found in steps`);

    return Object.freeze({
      kind: 'module' as const,
      name,
      entry,
      stash: this.config.stash,
      steps: { ...this.steps },
    }) as ModuleDefinition<TStashSchema>;
  }
}

export function module<TModuleStash extends z.ZodType>(
  config: ModuleConfig<TModuleStash>,
): ModuleBuilder<TModuleStash> {
  return new ModuleBuilder<TModuleStash>(config);
}
