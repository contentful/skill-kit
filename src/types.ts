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

export interface AskUserConfig {
  readonly kind: 'askUser';
  question: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

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

export interface TasksConfig {
  readonly kind: 'tasks';
  create: Array<{ title: string; status: string }>;
}

export interface SubtaskConfig {
  readonly kind: 'subtask';
  prompt: string;
  output: z.ZodType;
  contextBudget?: 'narrow' | 'normal' | 'wide';
}

export type PrimitiveConfig = AskUserConfig | ConfirmConfig | PlanConfig | TasksConfig | SubtaskConfig;

// --- Capabilities ---

export interface CapabilityManifest {
  fs?: { read?: string[]; write?: string[] };
  net?: string[];
  subprocess?: string[];
  env?: string[];
}

// --- Steps ---

export interface StepResult<TOutput = unknown> {
  readonly step: string;
  readonly output: TOutput;
  readonly action?: unknown;
}

export interface PromptContext<TPrev = unknown, TContext = unknown> {
  prev: TPrev;
  history: readonly StepResult[];
  context: TContext;
  rendered: string | undefined;
  refs: ReferenceLoader;
  attempts: number;
  host: Handshake;
  stash: Readonly<Record<string, unknown>>;
}

export type PromptFn<TPrev = unknown, TContext = unknown> = (ctx: PromptContext<TPrev, TContext>) => string;

export type TransitionFn<TOutput = unknown> = (ctx: { output: TOutput; attempts: number }) => string;

export interface StepConfig<TOutput extends z.ZodType = z.ZodType> {
  prompt?: string | PromptFn;
  output: TOutput;
  next: string | TransitionFn<z.infer<TOutput>> | { terminal: true };
  render?: (ctx: PromptContext) => string;
  action?: ActionDefinition;
  stash?: (ctx: { output: z.infer<TOutput> }) => unknown;
  maxVisits?: number;
  onMaxVisits?: string;
  ask?: AskUserConfig;
  confirm?: ConfirmConfig;
  plan?: PlanConfig;
  tasks?: TasksConfig;
  subtask?: SubtaskConfig;
}

export interface StepDefinition<TOutput extends z.ZodType = z.ZodType> {
  readonly kind: 'step';
  readonly config: StepConfig<TOutput>;
  extend(overrides: Partial<StepConfig<TOutput>>): StepDefinition<TOutput>;
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

// --- Skill ---

export interface SkillConfig<TContext extends z.ZodType = z.ZodType> {
  name: string;
  version?: string;
  description?: string;
  entry: string;
  context?: TContext;
  steps: Record<string, StepDefinition>;
  capabilities?: CapabilityManifest;
  observers?: ObserverMap;
  finalOutput?: z.ZodType;
  skillMd?: string | ((skill: SkillDefinition) => string);
}

export interface SkillDefinition<TContext extends z.ZodType = z.ZodType> {
  readonly kind: 'skill';
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entry: string;
  readonly context: TContext | undefined;
  readonly steps: Readonly<Record<string, StepDefinition>>;
  readonly capabilities: CapabilityManifest | undefined;
  readonly observers: ObserverMap | undefined;
  readonly finalOutput: z.ZodType | undefined;
  readonly skillMd: string | ((skill: SkillDefinition) => string) | undefined;
}

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

export type CliResult = PromptResult | DoneResult | ValidationErrorResult;

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
