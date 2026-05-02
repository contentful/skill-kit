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

/**
 * Build-time check that a step's response schema provides the properties
 * required by its action's input schema, when no explicit `action.input`
 * mapper is provided. This prevents a common misconfiguration where the
 * action would receive missing fields at runtime.
 */
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

/**
 * Extracts the sub-store write shape from a `save` callback's return type.
 *
 * A `save` callback can return `{ step?: ..., environment?: ..., config?: ... }`.
 * The `step` key is special — it overrides the step's result value in the store.
 * Everything else (environment, config, etc.) represents sub-store writes.
 *
 * This helper strips `step` to isolate just the sub-store writes:
 * - If save returns `void` (no save callback), there are no writes → `{}`
 * - Otherwise, `Omit<T, 'step'>` removes the step-result override, leaving
 *   only sub-store keys like `{ environment: { host: string } }`
 *
 * The result feeds into `AddStepGuarantees` to track which sub-store paths
 * have been written by guaranteed predecessors, enabling type narrowing from
 * optional (`store.env?.host`) to required (`store.env.host`) downstream.
 */
type ExtractStoreWrites<T> = T extends void ? {} : Omit<T, 'step'>;

/**
 * Fluent builder for defining a skill's step graph with full type safety.
 *
 * ## The accumulator pattern
 *
 * SkillBuilder uses a generic type accumulator — a technique where each method
 * call in a fluent chain returns the same class but with *evolved* generic
 * parameters. At runtime, `.step()` mutates internal state and returns `this`.
 * But at the *type level*, it returns `SkillBuilder<...new generics...>`, so
 * TypeScript tracks what has been defined so far.
 *
 * This is how the builder knows that in a chain like:
 *
 * ```ts
 * skill({ name: 'demo', entry: 'a' })
 *   .step('a', { response: type({ name: 'string' }), next: 'b' })
 *   .step('b', { prompt: ({ store }) => store.steps.a.name, ... })
 * ```
 *
 * ...step "b" can safely access `store.steps.a.name` as a non-optional `string`,
 * because by the time `.step('b', ...)` is called, `TSteps` has accumulated
 * `{ a: { name: string } }` and `TGuarantees.steps` includes `'a'`.
 *
 * Each `.step()` call evolves four of the five generic parameters:
 * - `TSteps` grows with the new step's result type
 * - `TGuarantees` may add the step to the guaranteed set (if it's on all paths)
 * - `TBranches` may record new branch targets (if `next` is a branch array)
 * - `TStores` stays fixed (declared once in the skill config)
 *
 * The generic parameters together form a complete picture of the skill's DAG
 * topology, enabling TypeScript to distinguish between steps that are guaranteed
 * to have run (direct property access) vs. steps that might not have run because
 * they're behind a branch (optional property access with `?.`).
 *
 * @template TParams — The skill's input parameters type, inferred from the
 *   `params` ArkType schema in the skill config. Passed to every step's `prompt`,
 *   `save`, and `action.input` callbacks as `ctx.params`.
 *
 * @template TSteps — An intersection of `{ [stepName]: resultType }` entries,
 *   one per `.step()` call. This is the "step result map" — it tracks what type
 *   each step contributes to the store. The result type comes from one of three
 *   sources (in priority order): the `save` callback's `step` property, the
 *   action's output type, or the response schema type. Starts as `{}` and grows
 *   with each `.step()` call.
 *
 * @template TGuarantees — A `GuaranteeState<TStepKeys, TStoreWrites>` tracking
 *   two things: (1) `steps` — a union of step names proven to be on ALL execution
 *   paths (these become non-optional in the store), and (2) `storeWrites` — the
 *   intersection of sub-store writes from guaranteed steps (these become non-optional
 *   in the sub-store view). The constraint uses `GuaranteeState<any, any>` rather
 *   than bare `GuaranteeState` because TypeScript's structural checking requires it:
 *   `GuaranteeState<'a', {}>` does not extend `GuaranteeState<never, {}>` (the
 *   default), since `'a'` is not assignable to `never`.
 *
 * @template TBranches — A `BranchState<TBranched, TGroups, TEdges>` tracking the
 *   DAG's branching topology. `branched` is a union of step names that are branch
 *   targets (they appear in a `next: [{ to: 'x' }, { to: 'y' }]` array with 2+
 *   forward targets). `groups` maps each target to its branch origin step. `edges`
 *   records sibling-to-sibling routing as `"source->target"` string literals, used
 *   to detect reconvergence (when all siblings route to the same step, that step
 *   gets promoted from branch-target to guaranteed). Same `any` constraint reasoning
 *   as TGuarantees.
 *
 * @template TStores — The sub-store schema types, inferred from the `stores` config.
 *   Unlike the other parameters, this does NOT evolve per `.step()` — it's fixed at
 *   skill creation. It constrains what keys `save` can write to and what the `store`
 *   accessor exposes at the top level (e.g., `store.environment?.host`).
 */
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

  /**
   * Adds a step to the skill's DAG and evolves the builder's type state.
   *
   * This is the core method of the accumulator pattern. Each call:
   * 1. Registers the step definition at runtime (mutates `this.steps`)
   * 2. Returns `this` cast to a SkillBuilder with evolved generics
   *
   * The generic parameters on this method are mostly inferred — the developer
   * writes plain config objects and TypeScript figures out the types.
   *
   * ## Generic parameters
   *
   * @template Name — The step's string literal name (e.g., `'greet'`). Inferred
   *   from the first argument. Becomes a key in `TSteps`.
   *
   * @template TOutput — The ArkType schema for the step's `response` field.
   *   Inferred from `config.response`. Its `TOutput['infer']` gives the
   *   TypeScript type the model's response will be validated against.
   *
   * @template A — The action definition type, if the step has an `action.run`.
   *   Defaults to `undefined` for steps without actions. Used to compute the
   *   action result type for `save` and for `TResultValue` fallback.
   *
   * @template TSaveReturn — The return type of the `save` callback, inferred
   *   from the callback the developer writes. Constrained to
   *   `{ step?: unknown } & DeepPartial<TStores>` — meaning it can optionally
   *   set a `step` value (overriding the step's result in the store) and/or
   *   write to any declared sub-store using a deep-partial shape. Defaults to
   *   `void` when no `save` is provided. The constraint uses `DeepPartial`
   *   because save callbacks typically write a subset of the full store schema.
   *
   * @template TResultValue — Determines what type downstream steps see when they
   *   access `store.steps[thisStep]`. This is a 3-way conditional with a clear
   *   priority order:
   *
   *   1. **`save().step`** — If the save callback returns `{ step: ... }`, that
   *      value's type becomes the result. This lets developers transform or
   *      reshape what downstream steps see.
   *   2. **Action output** — If there's an action but no `save().step`, the
   *      action's output schema type becomes the result. This makes sense because
   *      the action is the "real work" of the step.
   *   3. **Response schema** — If there's no action and no `save().step`, the
   *      response schema type (`TOutput['infer']`) becomes the result. This is
   *      the common case for simple prompt-and-collect steps.
   *
   * @template TNext — The type of the `next` field, which determines transitions.
   *   The `const` modifier is critical here: without it, TypeScript would widen
   *   `[{ to: 'a' }, { to: 'b' }]` to `{ to: string }[]`, and the builder
   *   could not extract the literal branch target names `'a' | 'b'`. With
   *   `const`, the array is inferred as a readonly tuple with literal `to`
   *   values, enabling `ExtractBranchTargets` to pull out exact step names.
   *   The default value and constraint both reference `StepConfig['next']` to
   *   ensure TNext stays compatible with the step config's `next` type.
   *
   * ## The `configOrDef` parameter: Omit + intersection pattern
   *
   * The config parameter uses `Omit<StepConfig, 'action' | 'next' | 'save'> & { ... }`
   * rather than just `StepConfig`. This is an intentional TypeScript inference
   * technique: `save`, `action`, and `next` are Omit'd from the base StepConfig
   * and then re-added with more precise types that reference this method's own
   * generic parameters (A, TSaveReturn, TNext, etc.).
   *
   * Why this is necessary: StepConfig's own `save` / `action` / `next` types
   * use wide types (`any`, `unknown`) for maximum flexibility. If we passed
   * them through directly, TypeScript couldn't infer the specific generic
   * parameters from the developer's code. By re-declaring them inline with
   * precise types, TypeScript infers A from `action.run`, TSaveReturn from
   * `save`'s return type, and TNext from the `next` value — all in one shot.
   *
   * ### `Exclude<TGuarantees['steps'], Name>` — self-exclusion
   *
   * When computing the store view for this step's `prompt` and `save` callbacks,
   * the current step's own name is excluded from the guaranteed set. This is
   * because the step hasn't completed yet when its prompt/save execute — you
   * can't read your own result from the store. After `.step()` returns, Name
   * gets added to the guarantee set for subsequent steps.
   *
   * The same self-exclusion does NOT apply to `action.input` — that callback
   * uses `never` for guaranteed steps because the action runs after the response
   * is validated but before save, so it only has access to the response and
   * the store's current state without any guarantee about which steps ran.
   *
   * ## Return type walkthrough
   *
   * The return type evolves all four mutable generic parameters:
   *
   * - `TSteps & { [K in Name]: TResultValue }` — Adds this step's name→result
   *   mapping to the accumulated step types.
   *
   * - `AddStepGuarantees<TGuarantees, Name, TBranches, ExtractStoreWrites<TSaveReturn>>`
   *   — If this step is on all execution paths (not a branch target, or promoted
   *   via reconvergence), adds it to the guaranteed set and merges its sub-store
   *   writes into the guaranteed store writes.
   *
   * - `AddStepBranches<TBranches, Name, TNext, Extract<keyof TSteps, string> | Name>`
   *   — If `next` is a branch array with 2+ forward targets, records those targets
   *   as branched, maps them to this step as their origin, and records any
   *   sibling-to-sibling routing edges. The `TKnownSteps` parameter (all step
   *   names defined so far, including this one) lets it distinguish forward edges
   *   (new targets) from backward edges (retry loops to already-defined steps).
   *
   * - `TStores` — Unchanged. Sub-store schemas are fixed at skill creation.
   */
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

    // The `as unknown as SkillBuilder<...>` cast bridges the gap between
    // runtime and type-level behavior. At runtime, `.step()` mutates
    // `this.steps` and returns `this` — the same object. But at the type
    // level, we need to return a SkillBuilder with evolved generics that
    // reflect the newly added step. TypeScript can't know that `this`
    // (typed as `SkillBuilder<TParams, TSteps, TGuarantees, TBranches, TStores>`)
    // is safely re-interpretable as `SkillBuilder<TParams, TSteps & { [K in Name]: ... }, ...>`.
    //
    // The cast is safe because:
    // 1. The runtime object is identical — no structural change occurs
    // 2. The only consumers of the evolved generics are downstream `.step()`
    //    calls, which use them to compute store types for prompt/save callbacks
    // 3. The generic parameters are a pure compile-time bookkeeping device —
    //    they affect what the developer sees in their IDE, not runtime behavior
    //
    // The double cast (`as unknown as`) is needed because TypeScript (correctly)
    // won't allow a direct cast between two SkillBuilder instantiations with
    // incompatible generic parameters. Going through `unknown` is the standard
    // escape hatch for this accumulator pattern.
    return this as unknown as SkillBuilder<
      TParams,
      TSteps & { [K in Name]: TResultValue },
      AddStepGuarantees<TGuarantees, Name, TBranches, ExtractStoreWrites<TSaveReturn>>,
      AddStepBranches<TBranches, Name, TNext, Extract<keyof TSteps, string> | Name>,
      TStores
    >;
  }

  /**
   * Adds a step by extending an existing step definition with overrides.
   *
   * Similar to `.step()` but starts from a pre-built `StepDefinition` (created
   * by the standalone `step()` factory) and applies partial overrides. Useful for
   * reusable step templates — e.g., a confirmation step whose prompt varies.
   *
   * Type state propagation: adds the step to `TSteps` using the base step's
   * response type, and adds it to guarantees if applicable. Branch state is NOT
   * updated because `extend` doesn't expose `TNext` for branch extraction — the
   * overridden `next` is typed loosely. Sub-store writes use `{}` (no save
   * inference) because the base definition's save is pre-compiled.
   */
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

  /**
   * Registers a pre-built module's steps into this skill.
   *
   * Modules are reusable step groups built with the `module()` factory. Their
   * exit steps (those with `next: '__parent__'`) are rewired to the `opts.next`
   * target, integrating the module into the parent skill's flow.
   *
   * Type state propagation: merges the module's step types (`TModuleSteps`) into
   * `TSteps`. Does NOT update `TGuarantees` or `TBranches` — module steps are
   * added opaquely without DAG analysis. This means steps after a module won't
   * get guaranteed access to the module's internal steps. This is a deliberate
   * simplification; modules are treated as black boxes for type narrowing.
   */
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

  /**
   * Registers a sub-skill that can be dispatched to during execution.
   *
   * Sub-skills are complete SkillDefinitions that run in their own step graph.
   * The optional `params` mapper receives the current response and store, letting
   * the parent skill pass context to the sub-skill.
   *
   * Type state propagation: none. Sub-skills don't affect the parent's TSteps,
   * TGuarantees, or TBranches — they execute in an isolated context. The return
   * type is the same SkillBuilder with unchanged generics.
   *
   * Nesting constraint: sub-skills cannot themselves contain sub-skills (throws
   * at registration time).
   */
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

  /**
   * Registers a reference topic — a named chunk of content the host can query.
   *
   * Topics are purely informational and don't participate in the step graph.
   * Type state propagation: none — returns the same SkillBuilder unchanged.
   */
  topic(name: string, config: TopicConfig): SkillBuilder<TParams, TSteps, TGuarantees, TBranches, TStores> {
    this.topics[name] = config;
    return this;
  }

  /**
   * Finalizes the builder into a frozen `SkillDefinition`.
   *
   * Validates that required fields are present (name, entry, at least one step,
   * entry step exists) and assembles the definition object. The generic type
   * state accumulated through `.step()` calls is discarded here — the returned
   * `SkillDefinition` uses erased types. The type safety has already done its
   * job during the builder chain; at runtime, the definition is a plain object.
   */
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
