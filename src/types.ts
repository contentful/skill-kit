import type { z } from 'zod';

// --- Host ---

export interface Handshake {
  host: string;
  toolsAvailable: string[];
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
}

export interface AskStructuredConfig {
  readonly kind: 'askUser';
  readonly type: 'structured';
  question: string;
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
}

export type PrimitiveConfig = AskUserConfig | ConfirmConfig | PlanConfig | ChecklistConfig | SubagentConfig;

// --- Prompt segments ---

export interface SystemSegment {
  readonly kind: 'system';
  readonly text: string;
}

export interface ActSegment {
  readonly kind: 'act';
  readonly primitive: PrimitiveConfig;
}

export type PromptSegment = SystemSegment | ActSegment;
export type PromptPiece = string | PromptSegment;
export type PromptReturn = string | PromptPiece | PromptPiece[];

export interface ActBuilder {
  askUser(input: { type: 'structured'; question: string; options: AskUserOption[]; multiSelect?: boolean }): ActSegment;
  askUser(input: { type: 'open'; question: string }): ActSegment;
  confirm(input: { message: string; destructive?: boolean; defaultAnswer?: 'yes' | 'no' }): ActSegment;
  plan(input: { summary: string; steps: string[] }): ActSegment;
  checklist(input: { create: Array<{ title: string; status: string }> }): ActSegment;
  subagent(input: { prompt: string; output: z.ZodType }): ActSegment;
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
  readonly output: TOutput;
  readonly action?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PromptContext<TContext = any, TStash = any> {
  prev: unknown;
  history: readonly StepResult[];
  getStep: <TOutput = unknown, TAction = unknown>(stepName: string) => { output: TOutput; action: TAction } | undefined;
  context: TContext;
  rendered: string | undefined;
  refs: ReferenceLoader;
  attempts: number;
  host: Handshake;
  stash: Readonly<TStash>;
  act: ActBuilder;
  system: SystemBuilder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptFn<TContext = any, TStash = any> = (ctx: PromptContext<TContext, TStash>) => PromptReturn;

export type TransitionFn<TOutput = unknown, TActionOutput = unknown> = (ctx: {
  output: TOutput;
  attempts: number;
  action: TActionOutput;
}) => string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StepConfig<
  TOutput extends z.ZodType = z.ZodType,
  TContext = any,
  TStash = any,
  TActionOutput = unknown,
> {
  prompt?: string | PromptPiece[] | PromptFn<TContext, TStash>;
  output: TOutput;
  next: string | TransitionFn<z.infer<TOutput>, TActionOutput> | { terminal: true };
  render?: (ctx: PromptContext<TContext, TStash>) => string;
  action?: ActionDefinition;
  actionInput?: (ctx: { output: z.infer<TOutput>; stash: Readonly<TStash> }) => unknown;
  stash?: (ctx: { output: z.infer<TOutput> }) => Partial<TStash>;
  afterAction?: (ctx: { output: z.infer<TOutput>; action: TActionOutput }) => Partial<TStash>;
  maxVisits?: number;
  onMaxVisits?: string;
  primitive?: PrimitiveConfig;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StepDefinition<
  TOutput extends z.ZodType = z.ZodType,
  TContext = any,
  TStash = any,
  TActionOutput = unknown,
> {
  readonly kind: 'step';
  readonly config: StepConfig<TOutput, TContext, TStash, TActionOutput>;
  extend(
    overrides: Partial<StepConfig<TOutput, TContext, TStash, TActionOutput>>,
  ): StepDefinition<TOutput, TContext, TStash, TActionOutput>;
}

// --- Observers ---

export interface ObserverMap {
  onStepStart?: (ctx: { step: string; context: unknown }) => void | Promise<void>;
  onStepComplete?: (ctx: { step: string; output: unknown; durationMs: number }) => void | Promise<void>;
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

export type SkillBuilderConfig<TContext extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType> = {
  name: string;
  description?: string;
  triggers?: string[];
  entry: string;
  context?: TContext;
  stash?: TStash;
  observers?: ObserverMap;
  finalOutput?: z.ZodType;
  skillMd?: string | ((skill: SkillDefinition) => string);
  package?: PackageConfig;
} & VersionStrategy;

// --- Skill Definition (output of .build()) ---

export interface SkillDefinition<TContext extends z.ZodType = z.ZodType, TStash extends z.ZodType = z.ZodType> {
  readonly kind: 'skill';
  readonly name: string;
  readonly version: string;
  readonly resolveVersion: boolean;
  readonly description: string;
  readonly entry: string;
  readonly context: TContext | undefined;
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
  readonly contextMap?: (stepOutput: unknown, stash: unknown) => unknown;
}

export type Buildable = SkillDefinition | ReferenceDefinition;

// --- Protocol (CLI output) ---

export interface PromptResult {
  step: string;
  prompt: string;
  schema: unknown;
  preamble?: string;
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
  context: unknown;
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
  output: unknown;
  history: readonly StepResult[];
}

export interface ModelAdapter {
  respond(stepName: string, prompt: string): unknown | Promise<unknown>;
}
