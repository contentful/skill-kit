import type { z } from 'zod';
import type {
  SkillBuilderConfig,
  SkillDefinition,
  StepConfig,
  StepDefinition,
  ModuleDefinition,
  ActionDefinition,
  InferActionOutput,
  SubskillRegistration,
  TopicConfig,
} from './types.js';
import { step as createStep } from './step.js';

export class SkillBuilder<TContext, TStash> {
  private readonly config: SkillBuilderConfig;
  private readonly steps: Record<string, StepDefinition> = {};
  private readonly subskills: Record<string, SubskillRegistration> = {};
  private readonly topics: Record<string, TopicConfig> = {};

  constructor(config: SkillBuilderConfig) {
    this.config = config;
  }

  step<TOutput extends z.ZodType, A extends ActionDefinition | undefined = undefined>(
    name: string,
    configOrDef:
      | (Omit<
          StepConfig<TOutput, TContext, TStash, A extends ActionDefinition ? InferActionOutput<A> : undefined>,
          'action'
        > & {
          action?: A;
        })
      | StepDefinition,
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

  subskill(
    name: string,
    definition: SkillDefinition,
    opts?: { context?: (stepOutput: unknown, stash: unknown) => unknown },
  ): SkillBuilder<TContext, TStash> {
    if (definition.subskills && Object.keys(definition.subskills).length > 0) {
      throw new Error(`subskill "${name}": sub-skills cannot be nested (definition already has subskills)`);
    }
    this.subskills[name] = Object.freeze({
      definition,
      contextMap: opts?.context,
    });
    return this;
  }

  topic(name: string, config: TopicConfig): SkillBuilder<TContext, TStash> {
    this.topics[name] = config;
    return this;
  }

  build(): SkillDefinition {
    const { name, entry } = this.config;

    if (!name) throw new Error('skill: name is required');
    if (!entry) throw new Error('skill: entry is required');
    if (Object.keys(this.steps).length === 0) throw new Error('skill: at least one step is required');
    if (!(entry in this.steps)) throw new Error(`skill: entry step "${entry}" not found in steps`);

    let description = this.config.description ?? '';
    if (this.config.triggers?.length) {
      const triggerLine = `Trigger keywords: ${this.config.triggers.join(', ')}`;
      const separator = description.endsWith('.') ? ' ' : '. ';
      description = description ? `${description}${separator}${triggerLine}` : triggerLine;
    }

    const hasSubskills = Object.keys(this.subskills).length > 0;
    const hasTopics = Object.keys(this.topics).length > 0;

    const definition: SkillDefinition = {
      kind: 'skill',
      name,
      version: this.config.version ?? '0.0.0',
      description,
      entry,
      system: this.config.system,
      context: this.config.context,
      stash: this.config.stash,
      steps: Object.freeze({ ...this.steps }),
      observers: this.config.observers,
      finalOutput: this.config.finalOutput,
      skillMd: this.config.skillMd,
      resolveVersion: this.config.resolveVersion ?? false,
      package: this.config.package,
      ...(hasSubskills ? { subskills: Object.freeze({ ...this.subskills }) } : {}),
      ...(hasTopics ? { topics: Object.freeze({ ...this.topics }) } : {}),
    };

    return Object.freeze(definition);
  }
}
