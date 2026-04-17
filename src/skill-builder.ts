import type { z } from 'zod';
import type { SkillBuilderConfig, SkillDefinition, StepConfig, StepDefinition, ModuleDefinition } from './types.js';
import { step as createStep } from './step.js';

export class SkillBuilder<TContext, TStash> {
  private readonly config: SkillBuilderConfig;
  private readonly steps: Record<string, StepDefinition> = {};

  constructor(config: SkillBuilderConfig) {
    this.config = config;
  }

  step<TOutput extends z.ZodType>(
    name: string,
    configOrDef: StepConfig<TOutput, TContext, TStash> | StepDefinition,
  ): SkillBuilder<TContext, TStash> {
    if ('kind' in configOrDef && configOrDef.kind === 'step') {
      this.steps[name] = configOrDef;
    } else {
      this.steps[name] = createStep(configOrDef as StepConfig);
    }
    return this;
  }

  extend<TOutput extends z.ZodType>(
    name: string,
    base: StepDefinition<TOutput>,
    overrides: Partial<StepConfig<TOutput, TContext, TStash>>,
  ): SkillBuilder<TContext, TStash> {
    this.steps[name] = createStep({ ...base.config, ...overrides } as StepConfig);
    return this;
  }

  register<TModuleStash extends z.ZodType>(
    mod: ModuleDefinition<TModuleStash>,
    opts: { next: string },
  ): SkillBuilder<TContext, TStash & z.infer<TModuleStash>> {
    for (const [name, stepDef] of Object.entries(mod.steps)) {
      const isExit = stepDef.config.next === '__parent__';
      if (isExit) {
        this.steps[name] = createStep({ ...stepDef.config, next: opts.next });
      } else {
        this.steps[name] = stepDef;
      }
    }

    return this as unknown as SkillBuilder<TContext, TStash & z.infer<TModuleStash>>;
  }

  build(): SkillDefinition {
    const { name, entry } = this.config;

    if (!name) throw new Error('skill: name is required');
    if (!entry) throw new Error('skill: entry is required');
    if (Object.keys(this.steps).length === 0) throw new Error('skill: at least one step is required');
    if (!(entry in this.steps)) throw new Error(`skill: entry step "${entry}" not found in steps`);

    const definition: SkillDefinition = {
      kind: 'skill',
      name,
      version: this.config.version ?? '0.0.0',
      description: this.config.description ?? '',
      entry,
      context: this.config.context,
      stash: this.config.stash,
      steps: Object.freeze({ ...this.steps }),
      capabilities: this.config.capabilities,
      observers: this.config.observers,
      finalOutput: this.config.finalOutput,
      skillMd: this.config.skillMd,
    };

    return Object.freeze(definition);
  }
}
