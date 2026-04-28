import type { z } from 'zod';

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

export interface ActionConfig<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> {
  name: string;
  input: TInput;
  output: TOutput;
  run: (ctx: { input: z.infer<TInput>; signal: AbortSignal }) => Promise<z.infer<TOutput>>;
}

export interface ActionDefinition<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> {
  readonly kind: 'action';
  readonly name: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly run: (ctx: { input: z.infer<TInput>; signal: AbortSignal }) => Promise<z.infer<TOutput>>;
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
  output: z.ZodType;
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
  subagent(input: { prompt: string; output: z.ZodType; allowRecursion?: boolean }): ActSegment;
  survey(questions: SurveyQuestion[]): ActSegment;
}

export type SystemBuilder = {
  (strings: TemplateStringsArray, ...values: unknown[]): SystemSegment;
  (text: string): SystemSegment;
};

// --- Type helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferActionOutput<A> = A extends ActionDefinition<any, infer TOut> ? z.infer<TOut> : undefined;

// --- Steps ---

export interface StepResult<TOutput = unknown> {
  readonly step: string;
  readonly stepOutput: TOutput;
  readonly actionOutput?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PromptContext<TParams = any, TStash = any> {
  history: readonly StepResult[];
  getStep: <TOutput = unknown, TAction = unknown>(
    stepName: string,
  ) => { stepOutput: TOutput; actionOutput: TAction } | undefined;
  params: TParams;
  refs: ReferenceLoader;
  attempts: number;
  host: Handshake;
  stash: Readonly<TStash>;
  act: ActBuilder;
  system: SystemBuilder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptFn<TParams = any, TStash = any> = (ctx: PromptContext<TParams, TStash>) => PromptReturn;

export type TransitionFn<TOutput = unknown, TActionOutput = unknown, TParams = unknown, TStash = unknown> = (ctx: {
  stepOutput: TOutput;
  attempts: number;
  actionOutput: TActionOutput;
  params: Readonly<TParams>;
  stash: Readonly<TStash>;
}) => string;

/**
 * Lifecycle: prompt → model → validate(stepOutput) → action.input → action.run → action.updateStash → updateStash → next
 *
 * When prompt is omitted the engine auto-advances (no LLM round-trip).
 * When output is omitted no schema block is emitted and validation is skipped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StepConfig<
  TOutput extends z.ZodType = z.ZodType,
  TParams = any,
  TStash = any,
  TActionOutput = unknown,
> {
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn<TParams, TStash>;
  output?: TOutput;
  next: string | TransitionFn<z.infer<TOutput>, TActionOutput, TParams, TStash> | { terminal: true };
  action?: {
    run: ActionDefinition;
    input?: (ctx: { stepOutput: z.infer<TOutput>; stash: Readonly<TStash>; params: Readonly<TParams> }) => unknown;
    updateStash?: (ctx: { actionOutput: TActionOutput }) => Partial<TStash>;
  };
  updateStash?: (ctx: {
    stepOutput: z.infer<TOutput>;
    actionOutput: TActionOutput;
    stash: Readonly<TStash>;
    params: Readonly<TParams>;
  }) => Partial<TStash>;
  maxVisits?: number;
  onMaxVisits?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StepDefinition<
  TOutput extends z.ZodType = z.ZodType,
  TParams = any,
  TStash = any,
  TActionOutput = unknown,
> {
  readonly kind: 'step';
  readonly config: StepConfig<TOutput, TParams, TStash, TActionOutput>;
  extend(
    overrides: Partial<StepConfig<TOutput, TParams, TStash, TActionOutput>>,
  ): StepDefinition<TOutput, TParams, TStash, TActionOutput>;
}

// --- Observers ---

export interface ObserverMap {
  onStepStart?: (ctx: { step: string; params: unknown }) => void | Promise<void>;
  onStepComplete?: (ctx: { step: string; stepOutput: unknown; durationMs: number }) => void | Promise<void>;
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

export type SkillBuilderConfig<TParams extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType> = {
  name: string;
  description?: string;
  triggers?: string[];
  entry: string;
  system?: string;
  params?: TParams;
  stash?: TStash;
  observers?: ObserverMap;
  finalOutput?: z.ZodType;
  skillMd?: string | ((skill: SkillDefinition) => string);
  package?: PackageConfig;
} & VersionStrategy;

// --- Skill Definition (output of .build()) ---

export interface SkillDefinition<TParams extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType> {
  readonly kind: 'skill';
  readonly name: string;
  readonly version: string;
  readonly resolveVersion: boolean;
  readonly description: string;
  readonly entry: string;
  readonly system: string | undefined;
  readonly params: TParams | undefined;
  readonly stash: TStash | undefined;
  readonly steps: Readonly<Record<string, StepDefinition>>;
  readonly observers: ObserverMap | undefined;
  readonly finalOutput: z.ZodType | undefined;
  readonly skillMd: string | ((skill: SkillDefinition) => string) | undefined;
  readonly package: PackageConfig | undefined;
  readonly subskills?: Readonly<Record<string, SubskillRegistration>>;
  readonly topics?: Readonly<Record<string, TopicConfig>>;
}

// --- Module Definition (output of module().build()) ---

export interface ModuleDefinition<TModuleStash extends z.ZodType = z.ZodType> {
  readonly kind: 'module';
  readonly name: string;
  readonly entry: string;
  readonly stash: TModuleStash;
  readonly steps: Record<string, StepDefinition>;
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
} & VersionStrategy;

export interface ReferenceDefinition {
  readonly kind: 'reference';
  readonly name: string;
  readonly version: string;
  readonly resolveVersion: boolean;
  readonly description: string;
  readonly package: PackageConfig | undefined;
  readonly topics: Readonly<Record<string, TopicConfig>>;
}

// --- Sub-skills ---

export interface SubskillRegistration {
  readonly definition: SkillDefinition;
  readonly paramsMap?: (stepOutput: unknown, stash: unknown) => unknown;
}

export type Buildable = SkillDefinition | ReferenceDefinition;

// --- Protocol (CLI output) ---

export interface PromptResult {
  step: string;
  preamble?: string;
  prompt: string;
  schema: unknown;
  completed?: StepResult;
}

export interface DoneResult {
  done: true;
  finalOutput: unknown;
  completed?: StepResult;
}

export interface ValidationErrorResult {
  error: 'validation';
  step: string;
  message: string;
  retry: boolean;
}

export interface RedirectResult {
  redirect: string;
  completed: StepResult;
  stash: unknown;
}

export type CliResult = PromptResult | DoneResult | ValidationErrorResult | RedirectResult;

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
  stepOutput: unknown;
  history: readonly StepResult[];
}

export interface ModelAdapter {
  respond(stepName: string, prompt: string): unknown | Promise<unknown>;
}
