import type { type } from 'arktype';
import type { StoreAccessor } from './runtime/state-store.js';

// --- Host ---

export interface Handshake {
  host: string;
  toolsAvailable: string[];
  isSubagent: boolean;
}

// --- Fragments ---

export interface Fragment {
  readonly name: string;
  readonly content: string;
}

// --- References ---

export interface ReferenceLoader {
  load(filename: string): string;
  asset(path: string): string;
}

// --- Actions ---

export interface ActionConfig<TInput extends type.Any = type.Any, TOutput extends type.Any = type.Any> {
  name: string;
  input: TInput;
  output: TOutput;
  run: (ctx: { input: TInput['infer']; signal: AbortSignal }) => Promise<TOutput['infer']>;
}

export interface ActionDefinition<TInput extends type.Any = type.Any, TOutput extends type.Any = type.Any> {
  readonly kind: 'action';
  readonly name: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly run: (ctx: { input: TInput['infer']; signal: AbortSignal }) => Promise<TOutput['infer']>;
}

// --- Primitives ---

export interface AskUserOption {
  value: string;
  label: string;
  description?: string;
  preview?: string;
}

export interface AskStructuredConfig {
  readonly kind: 'askUser';
  readonly type: 'structured';
  question: string;
  header?: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export interface AskOpenConfig {
  readonly kind: 'askUser';
  readonly type: 'open';
  question: string;
}

export type AskUserConfig = AskStructuredConfig | AskOpenConfig;

export interface ConfirmConfig {
  readonly kind: 'confirm';
  message: string;
  destructive?: boolean;
  defaultAnswer?: 'yes' | 'no';
}

export interface PlanConfig {
  readonly kind: 'plan';
  summary: string;
  steps: string[];
}

export interface ChecklistConfig {
  readonly kind: 'checklist';
  create: Array<{ title: string; status: string }>;
}

export interface SubagentConfig {
  readonly kind: 'subagent';
  prompt: string;
  output: type.Any;
  allowRecursion?: boolean;
}

export interface SurveyQuestion {
  question: string;
  header?: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export interface SurveyConfig {
  readonly kind: 'survey';
  readonly questions: SurveyQuestion[];
}

export type PrimitiveConfig =
  | AskUserConfig
  | ConfirmConfig
  | PlanConfig
  | ChecklistConfig
  | SubagentConfig
  | SurveyConfig;

// --- Prompt segments ---

export interface SystemSegment {
  readonly kind: 'system';
  readonly text: string;
}

export interface ActSegment {
  readonly kind: 'act';
  readonly primitive: PrimitiveConfig;
}

export interface ViewSegment {
  readonly kind: 'view';
  readonly label: string | undefined;
  readonly text: string;
}

export type PromptSegment = SystemSegment | ActSegment | ViewSegment;
export type PromptPiece = string | PromptSegment;
export type PromptReturn = string | PromptPiece | PromptPiece[];

export interface ActBuilder {
  askUser(input: {
    type: 'structured';
    question: string;
    header?: string;
    options: AskUserOption[];
    multiSelect?: boolean;
  }): ActSegment;
  askUser(input: { type: 'open'; question: string }): ActSegment;
  confirm(input: { message: string; destructive?: boolean; defaultAnswer?: 'yes' | 'no' }): ActSegment;
  plan(input: { summary: string; steps: string[] }): ActSegment;
  checklist(input: { create: Array<{ title: string; status: string }> }): ActSegment;
  subagent(input: { prompt: string; output: type.Any; allowRecursion?: boolean }): ActSegment;
  survey(questions: SurveyQuestion[]): ActSegment;
}

export type SystemBuilder = {
  (strings: TemplateStringsArray, ...values: unknown[]): SystemSegment;
  (text: string): SystemSegment;
};

// --- Type helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferActionResult<A> = A extends ActionDefinition<any, infer TOut> ? TOut['infer'] : undefined;

// --- Steps ---

export interface StepResult<TOutput = unknown> {
  readonly step: string;
  readonly response: TOutput;
  readonly actionResult?: unknown;
  readonly result: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PromptContext<
  TParams = any,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> {
  store: StoreAccessor<TSteps, TGuaranteed>;
  params: TParams;
  refs: ReferenceLoader;
  attempts: number;
  host: Handshake;
  act: ActBuilder;
  system: SystemBuilder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptFn<
  TParams = any,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> = (ctx: PromptContext<TParams, TSteps, TGuaranteed>) => PromptReturn;

export type TransitionFn<
  TOutput = unknown,
  TActionResult = unknown,
  TParams = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> = (ctx: {
  response: TOutput;
  attempts: number;
  actionResult: TActionResult;
  params: Readonly<TParams>;
  store: StoreAccessor<TSteps>;
}) => string;

export interface NextBranch<
  TOutput = unknown,
  TActionResult = unknown,
  TParams = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> {
  to: string;
  when?: (ctx: {
    response: TOutput;
    actionResult: TActionResult;
    params: Readonly<TParams>;
    store: StoreAccessor<TSteps>;
    attempts: number;
  }) => boolean;
}

export type NextTarget<
  TOutput = unknown,
  TActionResult = unknown,
  TParams = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> =
  | string
  | TransitionFn<TOutput, TActionResult, TParams, TSteps>
  | readonly NextBranch<TOutput, TActionResult, TParams, TSteps>[]
  | { terminal: true };

/**
 * Lifecycle: prompt → model → validate(response) → action.input → action.run → result → next
 *
 * When prompt is omitted the engine auto-advances (no LLM round-trip).
 * When response is omitted no schema block is emitted and validation is skipped.
 * When result is omitted, the step result defaults to the action output (if action exists) or the response.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface BaseStepFields<
  TOutput extends type.Any = type.Any,
  TParams = any,
  TActionResult = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> {
  result?: (ctx: { response: TOutput['infer']; actionResult: TActionResult }) => unknown;
  next:
    | string
    | TransitionFn<TOutput['infer'], TActionResult, TParams, TSteps>
    | readonly NextBranch<TOutput['infer'], TActionResult, TParams, TSteps>[]
    | { terminal: true };
  action?: {
    run: ActionDefinition;
    input?: (ctx: { response: TOutput['infer']; store: StoreAccessor<TSteps>; params: Readonly<TParams> }) => unknown;
  };
  maxVisits?: number;
  onMaxVisits?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PromptStepFields<
  TOutput extends type.Any = type.Any,
  TParams = any,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> {
  prompt: string | PromptPiece | PromptPiece[] | PromptFn<TParams, TSteps, TGuaranteed>;
  response?: TOutput;
}

interface PromptlessStepFields {
  prompt?: never;
  response?: never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StepConfig<
  TOutput extends type.Any = type.Any,
  TParams = any,
  TActionResult = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> = BaseStepFields<TOutput, TParams, TActionResult, TSteps> &
  (PromptStepFields<TOutput, TParams, TSteps, TGuaranteed> | PromptlessStepFields);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StepDefinition<
  TOutput extends type.Any = type.Any,
  TParams = any,
  TActionResult = unknown,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly kind: 'step';
  readonly config: StepConfig<TOutput, TParams, TActionResult, TSteps>;
  extend(
    overrides: Partial<StepConfig<TOutput, TParams, TActionResult, TSteps>>,
  ): StepDefinition<TOutput, TParams, TActionResult, TSteps>;
}

// --- Observers ---

export interface ObserverMap {
  onStepStart?: (ctx: { step: string; params: unknown }) => void | Promise<void>;
  onStepComplete?: (ctx: { step: string; response: unknown; durationMs: number }) => void | Promise<void>;
  onStepValidationFailed?: (ctx: {
    step: string;
    raw: unknown;
    error: string;
    attempt: number;
  }) => void | Promise<void>;
  onTransition?: (ctx: { from: string; to: string; reason: string }) => void | Promise<void>;
  onSkillComplete?: (ctx: { path: string[]; finalOutput: unknown; durationMs: number }) => void | Promise<void>;
}

// --- Package Config ---

export interface PackageConfig {
  name?: string;
  description?: string;
  license?: string;
  files?: string[];
  [key: string]: unknown;
}

export type VersionStrategy = { version?: string; resolveVersion?: never } | { version?: never; resolveVersion: true };

// --- Skill Builder Config (input to skill()) ---

export type SkillBuilderConfig<TParams extends type.Any = type.Any> = {
  name: string;
  description?: string;
  triggers?: string[];
  entry: string;
  system?: string;
  params?: TParams;
  observers?: ObserverMap;
  finalOutput?: type.Any;
  skillMd?: string | ((skill: SkillDefinition) => string);
  package?: PackageConfig;
  argumentHint?: string;
  arguments?: string | string[];
  allowedTools?: string | string[];
  paths?: string | string[];
  context?: string;
  license?: string;
  compatibility?: string;
  agent?: string;
  model?: string;
  effort?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
} & VersionStrategy;

// --- Skill Definition (output of .build()) ---

export interface SkillDefinition<TParams extends type.Any = type.Any> {
  readonly kind: 'skill';
  readonly name: string;
  readonly version: string;
  readonly resolveVersion: boolean;
  readonly description: string;
  readonly entry: string;
  readonly system: string | undefined;
  readonly params: TParams | undefined;
  readonly steps: Readonly<Record<string, StepDefinition>>;
  readonly observers: ObserverMap | undefined;
  readonly finalOutput: type.Any | undefined;
  readonly skillMd: string | ((skill: SkillDefinition) => string) | undefined;
  readonly package: PackageConfig | undefined;
  readonly argumentHint: string | undefined;
  readonly arguments: string | string[] | undefined;
  readonly allowedTools: string | string[] | undefined;
  readonly paths: string | string[] | undefined;
  readonly context: string | undefined;
  readonly license: string | undefined;
  readonly compatibility: string | undefined;
  readonly agent: string | undefined;
  readonly model: string | undefined;
  readonly effort: string | undefined;
  readonly disableModelInvocation: boolean | undefined;
  readonly userInvocable: boolean | undefined;
  readonly subskills?: Readonly<Record<string, SubskillRegistration>>;
  readonly topics?: Readonly<Record<string, TopicConfig>>;
}

// --- Module Definition (output of module().build()) ---

export interface ModuleDefinition<TModuleSteps extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'module';
  readonly name: string;
  readonly entry: string;
  readonly steps: Record<string, StepDefinition>;
  readonly _stepTypes?: TModuleSteps;
}

// --- Reference Definition ---

export interface TopicConfig {
  label: string;
  content: (ctx: { refs: ReferenceLoader }) => string;
}

export type ReferenceBuilderConfig = {
  name: string;
  description: string;
  package?: PackageConfig;
  argumentHint?: string;
  arguments?: string | string[];
  allowedTools?: string | string[];
  paths?: string | string[];
  context?: string;
  license?: string;
  compatibility?: string;
  agent?: string;
  model?: string;
  effort?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
} & VersionStrategy;

export interface ReferenceDefinition {
  readonly kind: 'reference';
  readonly name: string;
  readonly version: string;
  readonly resolveVersion: boolean;
  readonly description: string;
  readonly package: PackageConfig | undefined;
  readonly argumentHint: string | undefined;
  readonly arguments: string | string[] | undefined;
  readonly allowedTools: string | string[] | undefined;
  readonly paths: string | string[] | undefined;
  readonly context: string | undefined;
  readonly license: string | undefined;
  readonly compatibility: string | undefined;
  readonly agent: string | undefined;
  readonly model: string | undefined;
  readonly effort: string | undefined;
  readonly disableModelInvocation: boolean | undefined;
  readonly userInvocable: boolean | undefined;
  readonly topics: Readonly<Record<string, TopicConfig>>;
}

// --- Sub-skills ---

export interface SubskillRegistration {
  readonly definition: SkillDefinition;
  paramsMap?(response: unknown, store: StoreAccessor): unknown;
}

export type Buildable = SkillDefinition | ReferenceDefinition;

// --- Protocol (CLI output) ---

export interface PromptResult {
  readonly kind: 'prompt';
  step: string;
  preamble?: string;
  prompt: string;
  schema: unknown;
  completed?: StepResult;
  autoAdvanced?: StepResult[];
}

export interface DoneResult {
  readonly kind: 'done';
  done: true;
  finalOutput: unknown;
  completed?: StepResult;
  autoAdvanced?: StepResult[];
}

export interface ValidationErrorResult {
  readonly kind: 'error';
  error: 'validation';
  step: string;
  message: string;
  retry: boolean;
}

export interface RedirectResult {
  readonly kind: 'redirect';
  redirect: string;
  completed: StepResult;
  store: StoreAccessor;
}

export type CliResult = PromptResult | DoneResult | ValidationErrorResult | RedirectResult;

export function isPrompt(r: CliResult): r is PromptResult {
  return r.kind === 'prompt';
}
export function isDone(r: CliResult): r is DoneResult {
  return r.kind === 'done';
}
export function isError(r: CliResult): r is ValidationErrorResult {
  return r.kind === 'error';
}
export function isRedirect(r: CliResult): r is RedirectResult {
  return r.kind === 'redirect';
}

// --- Session Protocol ---

export type SessionOutputMode = 'file' | 'flag';

export interface SessionHeader {
  type: 'header';
  sessionId: string;
  skill: string;
  host: string;
  tools?: string[];
  isSubagent?: boolean;
  params: unknown;
  createdAt: string;
  outputMode: SessionOutputMode;
}

export interface SessionOutputLine {
  type: 'output';
  step: string;
  output: unknown;
}

export type SessionLine = SessionHeader | SessionOutputLine | (CliResult & { type: string });

export interface SessionPointer {
  sessionId: string;
  file: string;
  line: number;
}

// --- Testing ---

export interface SkillRunResult {
  path: string[];
  outputs: Record<string, unknown>;
  response: unknown;
  history: readonly StepResult[];
  store: StoreAccessor;
}

export interface ModelAdapter {
  respond(stepName: string, prompt: string): unknown | Promise<unknown>;
}
