import type { type } from 'arktype';
import type {
  SkillBuilderConfig,
  SkillDefinition,
  StepConfig,
  StepDefinition,
  ModuleDefinition,
  ActionDefinition,
  InferActionResult,
  SubskillRegistration,
  TopicConfig,
} from './types.js';
import type { StoreAccessor } from './runtime/state-store.js';
import { step as createStep } from './step.js';
import type { DeepPartial, BranchState, GuaranteeState, AddStepGuarantees, AddStepBranches } from './types/store.js';

function checkActionInputCompat(stepName: string, outputSchema: type.Any, actionDef: ActionDefinition): void {
  try {
    const stepJson = outputSchema.toJsonSchema() as Record<string, unknown>;
    const actionJson = actionDef.input.toJsonSchema() as Record<string, unknown>;

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

type ExtractStoreWrites<T> = T extends void ? {} : Omit<T, 'step'>;

export class SkillBuilder<
  TParams,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TSteps extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TGuarantees extends GuaranteeState<any, any> = GuaranteeState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TBranches extends BranchState<any, any, any> = BranchState,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TStores extends Record<string, unknown> = {},
> {
  private readonly config: SkillBuilderConfig;
  private readonly steps: Record<string, StepDefinition> = {};
  private readonly subskills: Record<string, SubskillRegistration> = {};
  private readonly topics: Record<string, TopicConfig> = {};

  constructor(config: SkillBuilderConfig) {
    this.config = config;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step<
    Name extends string,
    TOutput extends type.Any,
    A extends ActionDefinition<any, any> | undefined = undefined,
    TSaveReturn extends ({ step?: unknown } & DeepPartial<TStores>) | void = void,
    TResultValue = TSaveReturn extends { step: infer S }
      ? S
      : A extends ActionDefinition<any, infer TActionOut>
        ? TActionOut['infer']
        : TOutput extends type.Any
          ? TOutput['infer']
          : unknown,
    const TNext extends StepConfig<
      TOutput,
      TParams,
      A extends ActionDefinition<any, any> ? InferActionResult<A> : undefined,
      TSteps,
      never,
      TStores,
      TGuarantees['storeWrites']
    >['next'] = StepConfig<
      TOutput,
      TParams,
      A extends ActionDefinition<any, any> ? InferActionResult<A> : undefined,
      TSteps,
      never,
      TStores,
      TGuarantees['storeWrites']
    >['next'],
  >(
    name: Name,
    configOrDef:
      | (Omit<
          StepConfig<
            TOutput,
            TParams,
            A extends ActionDefinition<any, any> ? InferActionResult<A> : undefined,
            TSteps,
            Exclude<TGuarantees['steps'], Name>,
            TStores,
            TGuarantees['storeWrites']
          >,
          'action' | 'next' | 'save'
        > & {
          next: TNext;
          save?: (ctx: {
            response: TOutput['infer'];
            actionResult: A extends ActionDefinition<any, any> ? InferActionResult<A> : undefined;
            store: StoreAccessor<TSteps, Exclude<TGuarantees['steps'], Name>, TStores, TGuarantees['storeWrites']>;
            params: Readonly<TParams>;
          }) => TSaveReturn;
          action?: A extends ActionDefinition<any, any>
            ? {
                run: A;
                input?: (ctx: {
                  response: TOutput['infer'];
                  store: StoreAccessor<TSteps, never, TStores, TGuarantees['storeWrites']>;
                  params: TParams;
                }) => unknown;
              }
            : undefined;
        })
      | StepDefinition,
  ): SkillBuilder<
    TParams,
    TSteps & { [K in Name]: TResultValue },
    AddStepGuarantees<TGuarantees, Name, TBranches, ExtractStoreWrites<TSaveReturn>>,
    AddStepBranches<TBranches, Name, TNext, Extract<keyof TSteps, string> | Name>,
    TStores
  > {
    if ('kind' in configOrDef && configOrDef.kind === 'step') {
      this.steps[name] = configOrDef;
    } else {
      const config = configOrDef as StepConfig;
      if (config.action && !config.action.input && config.response) {
        checkActionInputCompat(name, config.response, config.action.run);
      }
      this.steps[name] = createStep(config);
    }
    return this as unknown as SkillBuilder<
      TParams,
      TSteps & { [K in Name]: TResultValue },
      AddStepGuarantees<TGuarantees, Name, TBranches, ExtractStoreWrites<TSaveReturn>>,
      AddStepBranches<TBranches, Name, TNext, Extract<keyof TSteps, string> | Name>,
      TStores
    >;
  }

  extend<Name extends string, TOutput extends type.Any>(
    name: Name,
    base: StepDefinition<TOutput>,
    overrides: Partial<StepConfig<TOutput, TParams, unknown, TSteps, Exclude<TGuarantees['steps'], Name>>>,
  ): SkillBuilder<
    TParams,
    TSteps & { [K in Name]: TOutput['infer'] },
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    AddStepGuarantees<TGuarantees, Name, TBranches, {}>,
    TBranches,
    TStores
  > {
    this.steps[name] = createStep({ ...base.config, ...overrides } as StepConfig);
    return this as unknown as SkillBuilder<
      TParams,
      TSteps & { [K in Name]: TOutput['infer'] },
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      AddStepGuarantees<TGuarantees, Name, TBranches, {}>,
      TBranches,
      TStores
    >;
  }

  register<TModuleSteps extends Record<string, unknown>>(
    mod: ModuleDefinition<TModuleSteps>,
    opts: { next: string },
  ): SkillBuilder<TParams, TSteps & TModuleSteps, TGuarantees, TBranches, TStores> {
    for (const [name, stepDef] of Object.entries(mod.steps)) {
      const isExit = stepDef.config.next === '__parent__';
      if (isExit) {
        this.steps[name] = createStep({ ...stepDef.config, next: opts.next });
      } else {
        this.steps[name] = stepDef;
      }
    }

    return this as unknown as SkillBuilder<TParams, TSteps & TModuleSteps, TGuarantees, TBranches, TStores>;
  }

  subskill(
    name: string,
    definition: SkillDefinition,
    opts?: { params?: (response: unknown, store: StoreAccessor<TSteps, TGuarantees['steps']>) => unknown },
  ): SkillBuilder<TParams, TSteps, TGuarantees, TBranches, TStores> {
    if (definition.subskills && Object.keys(definition.subskills).length > 0) {
      throw new Error(`subskill "${name}": sub-skills cannot be nested (definition already has subskills)`);
    }
    this.subskills[name] = Object.freeze({
      definition,
      paramsMap: opts?.params,
    });
    return this;
  }

  topic(name: string, config: TopicConfig): SkillBuilder<TParams, TSteps, TGuarantees, TBranches, TStores> {
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

    if (this.config.stores) {
      const reserved = new Set(['steps', 'step']);
      for (const storeName of Object.keys(this.config.stores)) {
        if (reserved.has(storeName)) {
          throw new Error(`skill: store name "${storeName}" is reserved`);
        }
      }
    }

    const hasSubskills = Object.keys(this.subskills).length > 0;
    const hasTopics = Object.keys(this.topics).length > 0;
    const hasStores = this.config.stores && Object.keys(this.config.stores).length > 0;

    const definition: SkillDefinition = {
      kind: 'skill',
      name,
      version: this.config.version ?? '0.0.0',
      description,
      entry,
      system: this.config.system,
      params: this.config.params,
      steps: Object.freeze({ ...this.steps }),
      ...(hasStores ? { stores: Object.freeze({ ...this.config.stores }) } : {}),
      observers: this.config.observers,
      finalOutput: this.config.finalOutput,
      skillMd: this.config.skillMd,
      resolveVersion: this.config.resolveVersion ?? false,
      package: this.config.package,
      argumentHint: this.config.argumentHint,
      arguments: this.config.arguments,
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
