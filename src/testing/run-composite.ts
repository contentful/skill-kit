import type {
  SkillDefinition,
  Handshake,
  ModelAdapter,
  RedirectResult,
  StepResult,
  ReferenceLoader,
  CliResult,
} from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';

export interface CompositeRunResult {
  path: string[];
  outputs: Record<string, unknown>;
  output: unknown;
  history: readonly StepResult[];
  redirectedTo?: { kind: 'subskill' | 'topic'; name: string };
}

export interface RunCompositeOptions {
  params?: Record<string, unknown>;
  model: ModelAdapter;
  host?: Partial<Handshake>;
  directSubskill?: string;
  refs?: ReferenceLoader;
}

const NOOP_REFS: ReferenceLoader = { load: () => '', asset: (p) => p };
const MAX_AUTO_ADVANCE = 20;

function collectAutoAdvanced(result: CliResult, history: StepResult[]): void {
  if ((result.kind === 'prompt' || result.kind === 'done') && result.autoAdvanced) {
    for (const entry of result.autoAdvanced) {
      history.push(entry);
    }
  }
}

async function drainPromptless(engine: WorkflowEngine, result: CliResult, path: string[]): Promise<CliResult> {
  let current = result;
  let depth = 0;
  while (current.kind === 'prompt') {
    if (!engine.isPromptless(current.step)) break;
    depth += 1;
    if (depth > MAX_AUTO_ADVANCE) {
      throw new Error(`Auto-advance depth exceeded (${MAX_AUTO_ADVANCE}). Check for infinite prompt-less step loops.`);
    }
    path.push(current.step);
    current = await engine.advance(current.step, {});
  }
  return current;
}

export async function runComposite(skill: SkillDefinition, opts: RunCompositeOptions): Promise<CompositeRunResult> {
  const handshake: Handshake = {
    host: opts.host?.host ?? 'generic',
    toolsAvailable: opts.host?.toolsAvailable ?? [],
    isSubagent: opts.host?.isSubagent ?? false,
  };
  const refs = opts.refs ?? NOOP_REFS;

  if (opts.directSubskill) {
    return runSubskillDirect(skill, opts.directSubskill, handshake, opts, refs);
  }

  return runFromDispatcher(skill, handshake, opts, refs);
}

async function runFromDispatcher(
  skill: SkillDefinition,
  handshake: Handshake,
  opts: RunCompositeOptions,
  refs: ReferenceLoader,
): Promise<CompositeRunResult> {
  const engine = new WorkflowEngine(skill, handshake, opts.params ?? {}, refs);
  const startResult = engine.start();

  const path: string[] = [];
  const outputs: Record<string, unknown> = {};
  const allHistory: StepResult[] = [];

  const initial = await drainPromptless(engine, startResult, path);
  if (initial.kind === 'done') {
    return { path, outputs, output: initial.finalOutput, history: allHistory };
  }
  if (initial.kind === 'redirect') {
    allHistory.push(initial.completed);
    return handleRedirect(skill, initial, path, outputs, allHistory, handshake, opts, refs);
  }
  if (initial.kind !== 'prompt') {
    throw new Error(`Unexpected result kind "${initial.kind}" at start`);
  }
  let current = initial;

  while (true) {
    path.push(current.step);
    const response = await opts.model.respond(current.step, current.prompt);
    const result = await engine.advance(current.step, response);

    if (result.kind === 'error') {
      throw new Error(`Validation error at step "${result.step}": ${result.message}`);
    }

    outputs[current.step] = response;

    const drained = await drainPromptless(engine, result, path);
    collectAutoAdvanced(drained, allHistory);

    if (drained.kind === 'redirect') {
      allHistory.push(drained.completed);
      return handleRedirect(skill, drained, path, outputs, allHistory, handshake, opts, refs);
    }

    if (drained.kind === 'done') {
      return { path, outputs, output: drained.finalOutput, history: allHistory };
    }

    if (drained.kind !== 'prompt') {
      throw new Error(`Unexpected result kind "${drained.kind}" during run`);
    }
    if (drained.completed) {
      allHistory.push(drained.completed);
    }
    current = drained;
  }
}

async function handleRedirect(
  skill: SkillDefinition,
  redirect: RedirectResult,
  path: string[],
  outputs: Record<string, unknown>,
  allHistory: StepResult[],
  handshake: Handshake,
  opts: RunCompositeOptions,
  refs: ReferenceLoader,
): Promise<CompositeRunResult> {
  const target = redirect.redirect;

  if (target.startsWith('topic:')) {
    const topicName = target.slice('topic:'.length);
    const topic = skill.topics?.[topicName];
    if (!topic) throw new Error(`Redirect to unknown topic "${topicName}"`);
    const content = topic.content({ refs });
    return {
      path,
      outputs,
      output: { topic: topicName, content },
      history: allHistory,
      redirectedTo: { kind: 'topic', name: topicName },
    };
  }

  if (target.startsWith('subskill:')) {
    const subName = target.slice('subskill:'.length);
    const sub = skill.subskills?.[subName];
    if (!sub) throw new Error(`Redirect to unknown sub-skill "${subName}"`);

    const params = sub.paramsMap ? sub.paramsMap(redirect.completed.stepOutput, redirect.stash) : {};
    const subResult = await runSubskillEngine(sub.definition, subName, handshake, params, opts, refs);

    return {
      path: [...path, ...subResult.path],
      outputs: { ...outputs, ...subResult.outputs },
      output: subResult.output,
      history: [...allHistory, ...subResult.history],
      redirectedTo: { kind: 'subskill', name: subName },
    };
  }

  throw new Error(`Unknown redirect target "${target}"`);
}

async function runSubskillDirect(
  skill: SkillDefinition,
  subskillName: string,
  handshake: Handshake,
  opts: RunCompositeOptions,
  refs: ReferenceLoader,
): Promise<CompositeRunResult> {
  const sub = skill.subskills?.[subskillName];
  if (!sub) throw new Error(`Unknown sub-skill "${subskillName}"`);
  const result = await runSubskillEngine(sub.definition, subskillName, handshake, opts.params ?? {}, opts, refs);
  return { ...result, redirectedTo: { kind: 'subskill', name: subskillName } };
}

async function runSubskillEngine(
  def: SkillDefinition,
  subName: string,
  handshake: Handshake,
  params: unknown,
  opts: RunCompositeOptions,
  refs: ReferenceLoader,
): Promise<{ path: string[]; outputs: Record<string, unknown>; output: unknown; history: StepResult[] }> {
  const engine = new WorkflowEngine(def, handshake, params, refs);
  const startResult = engine.start();

  const path: string[] = [];
  const outputs: Record<string, unknown> = {};
  const history: StepResult[] = [];

  const initial = await drainPromptless(engine, startResult, path);
  if (initial.kind === 'done') {
    return { path, outputs, output: initial.finalOutput, history };
  }
  if (initial.kind !== 'prompt') {
    throw new Error(`Unexpected result kind "${initial.kind}" in subskill start`);
  }
  let current = initial;

  while (true) {
    const prefixedStep = `${subName}/${current.step}`;
    path.push(prefixedStep);

    const response = await opts.model.respond(prefixedStep, current.prompt);
    const result = await engine.advance(current.step, response);

    if (result.kind === 'error') {
      throw new Error(`Validation error at step "${prefixedStep}": ${result.message}`);
    }

    outputs[prefixedStep] = response;

    const drained = await drainPromptless(engine, result, path);
    collectAutoAdvanced(drained, history);

    if (drained.kind === 'done') {
      return { path, outputs, output: drained.finalOutput, history };
    }

    if (drained.kind !== 'prompt') {
      throw new Error(`Unexpected result kind "${drained.kind}" in subskill`);
    }
    if (drained.completed) {
      history.push({ ...drained.completed, step: prefixedStep });
    }
    current = drained;
  }
}
