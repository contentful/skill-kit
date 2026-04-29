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

function checkActionInputCompat(stepName: string, outputSchema: z.ZodType, actionDef: ActionDefinition): void {
  try {
    const stepJson = outputSchema.toJSONSchema() as Record<string, unknown>;
    const actionJson = actionDef.input.toJSONSchema() as Record<string, unknown>;

    const stepProps = Object.keys((stepJson['properties'] as Record<string, unknown>) ?? {});
    const actionRequired = (actionJson['required'] as string[]) ?? [];

    const missing = actionRequired.filter((k) => !stepProps.includes(k));
    if (missing.length > 0) {
      throw new Error(
        `Step "${stepName}" uses action "${actionDef.name}" without an input mapper, ` +
          `but the step output is missing properties required by the action input: [${missing.join(', ')}]. ` +
          `Add an action.input mapper to transform the step output.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Step "')) throw err;
  }
}

export class SkillBuilder<TParams, TStash, TSteps extends Record<string, unknown> = Record<string, never>> {
  private readonly config: SkillBuilderConfig;
  private readonly steps: Record<string, StepDefinition> = {};
  private readonly subskills: Record<string, SubskillRegistration> = {};
  private readonly topics: Record<string, TopicConfig> = {};

  constructor(config: SkillBuilderConfig) {
    this.config = config;
  }

  step<Name extends string, TOutput extends z.ZodType, A extends ActionDefinition | undefined = undefined>(
    name: Name,
    configOrDef:
      | (Omit<
          StepConfig<TOutput, TParams, TStash, A extends ActionDefinition ? InferActionOutput<A> : undefined, TSteps>,
          'action'
        > & {
          action?: A extends ActionDefinition
            ? {
                run: A;
                input?: (ctx: { stepOutput: z.infer<TOutput>; stash: Readonly<TStash>; params: TParams }) => unknown;
                updateStash?: (ctx: { actionOutput: InferActionOutput<A> }) => Partial<TStash>;
              }
            : undefined;
        })
      | StepDefinition,
  ): SkillBuilder<TParams, TStash, TSteps & { [K in Name]: TOutput extends z.ZodType ? z.infer<TOutput> : unknown }> {
    if ('kind' in configOrDef && configOrDef.kind === 'step') {
      this.steps[name] = configOrDef;
    } else {
      const config = configOrDef as StepConfig;
      if (config.action && !config.action.input && config.output) {
        checkActionInputCompat(name, config.output, config.action.run);
      }
      this.steps[name] = createStep(config);
    }
    return this as SkillBuilder<
      TParams,
      TStash,
      TSteps & { [K in Name]: TOutput extends z.ZodType ? z.infer<TOutput> : unknown }
    >;
  }

  extend<Name extends string, TOutput extends z.ZodType>(
    name: Name,
    base: StepDefinition<TOutput>,
    overrides: Partial<StepConfig<TOutput, TParams, TStash, unknown, TSteps>>,
  ): SkillBuilder<TParams, TStash, TSteps & { [K in Name]: z.infer<TOutput> }> {
    this.steps[name] = createStep({ ...base.config, ...overrides } as StepConfig);
    return this as SkillBuilder<TParams, TStash, TSteps & { [K in Name]: z.infer<TOutput> }>;
  }

  register<TModuleStash extends z.ZodType>(
    mod: ModuleDefinition<TModuleStash>,
    opts: { next: string },
  ): SkillBuilder<TParams, TStash & z.infer<TModuleStash>, TSteps> {
    for (const [name, stepDef] of Object.entries(mod.steps)) {
      const isExit = stepDef.config.next === '__parent__';
      if (isExit) {
        this.steps[name] = createStep({ ...stepDef.config, next: opts.next });
      } else {
        this.steps[name] = stepDef;
      }
    }

    return this as unknown as SkillBuilder<TParams, TStash & z.infer<TModuleStash>, TSteps>;
  }

  subskill(
    name: string,
    definition: SkillDefinition,
    opts?: { params?: (stepOutput: unknown, stash: unknown) => unknown },
  ): SkillBuilder<TParams, TStash, TSteps> {
    if (definition.subskills && Object.keys(definition.subskills).length > 0) {
      throw new Error(`subskill "${name}": sub-skills cannot be nested (definition already has subskills)`);
    }
    this.subskills[name] = Object.freeze({
      definition,
      paramsMap: opts?.params,
    });
    return this;
  }

  topic(name: string, config: TopicConfig): SkillBuilder<TParams, TStash, TSteps> {
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
      params: this.config.params,
      stash: this.config.stash,
      steps: Object.freeze({ ...this.steps }),
      observers: this.config.observers,
      finalOutput: this.config.finalOutput,
      skillMd: this.config.skillMd,
      resolveVersion: this.config.resolveVersion ?? false,
      package: this.config.package,
      argumentHint: this.config.argumentHint,
      allowedTools: this.config.allowedTools,
      paths: this.config.paths,
      context: this.config.context,
      license: this.config.license,
      compatibility: this.config.compatibility,
      agent: this.config.agent,
      model: this.config.model,
      effort: this.config.effort,
      disableModelInvocation: this.config.disableModelInvocation,
      userInvocable: this.config.userInvocable,
      ...(hasSubskills ? { subskills: Object.freeze({ ...this.subskills }) } : {}),
      ...(hasTopics ? { topics: Object.freeze({ ...this.topics }) } : {}),
    };

    return Object.freeze(definition);
  }
}
