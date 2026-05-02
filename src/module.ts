import type { ModuleDefinition, StepConfig, StepDefinition } from './types.js';
import { step as createStep } from './step.js';

export interface ModuleConfig {
  name: string;
  entry: string;
}

export class ModuleBuilder {
  private readonly config: ModuleConfig;
  private readonly steps: Record<string, StepDefinition> = {};

  constructor(config: ModuleConfig) {
    this.config = config;
  }

  step<TOutput extends import('arktype').type.Any>(
    name: string,
    configOrDef: StepConfig<TOutput> | StepDefinition,
  ): ModuleBuilder {
    if ('kind' in configOrDef && configOrDef.kind === 'step') {
      this.steps[name] = configOrDef;
    } else {
      this.steps[name] = createStep(configOrDef as StepConfig);
    }
    return this;
  }

  build(): ModuleDefinition {
    const { name, entry } = this.config;

    if (!name) throw new Error('module: name is required');
    if (!entry) throw new Error('module: entry is required');
    if (Object.keys(this.steps).length === 0) throw new Error('module: at least one step is required');
    if (!(entry in this.steps)) throw new Error(`module: entry step "${entry}" not found in steps`);

    return Object.freeze({
      kind: 'module' as const,
      name,
      entry,
      steps: { ...this.steps },
    }) as ModuleDefinition;
  }
}

export function module(config: ModuleConfig): ModuleBuilder {
  return new ModuleBuilder(config);
}
