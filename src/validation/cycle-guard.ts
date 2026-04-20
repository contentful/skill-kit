import type { StepDefinition } from '../types.js';

export class CycleGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleGuardError';
  }
}

const DEFAULT_MAX_VISITS = 10;

export interface CycleGuardResult {
  stepsInCycles: Set<string>;
  defaultMaxVisits: number;
}

export function validateCycleGuards(steps: Readonly<Record<string, StepDefinition>>): CycleGuardResult {
  const stepNames = Object.keys(steps);
  const graph = buildGraph(steps, stepNames);
  const cycles = findCycles(graph, stepNames);
  const stepsInCycles = new Set<string>();

  for (const cycle of cycles) {
    for (const stepName of cycle) {
      stepsInCycles.add(stepName);
    }
  }

  // Validate: onMaxVisits must point to a real step
  for (const stepName of stepsInCycles) {
    const { onMaxVisits } = steps[stepName]!.config;
    if (onMaxVisits !== undefined && !(onMaxVisits in steps)) {
      throw new CycleGuardError(`Step "${stepName}" has onMaxVisits "${onMaxVisits}" which does not exist in steps.`);
    }
  }

  return { stepsInCycles, defaultMaxVisits: DEFAULT_MAX_VISITS };
}

function buildGraph(steps: Readonly<Record<string, StepDefinition>>, stepNames: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const name of stepNames) {
    graph.set(name, new Set());
  }

  for (const name of stepNames) {
    const { next, onMaxVisits } = steps[name]!.config;
    const targets = graph.get(name)!;

    if (typeof next === 'string') {
      if (next in steps) targets.add(next);
    } else if (typeof next === 'function') {
      // Conservative: assume all steps are reachable from a function transition
      for (const target of stepNames) {
        if (target !== name) targets.add(target);
      }
    }
    // { terminal: true } adds no edges

    if (onMaxVisits && onMaxVisits in steps) {
      targets.add(onMaxVisits);
    }
  }

  return graph;
}

function findCycles(graph: Map<string, Set<string>>, stepNames: string[]): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  for (const name of stepNames) {
    color.set(name, WHITE);
    parent.set(name, null);
  }

  for (const name of stepNames) {
    if (color.get(name) === WHITE) {
      dfs(name);
    }
  }

  function dfs(u: string): void {
    color.set(u, GRAY);

    for (const v of graph.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        const cycle = extractCycle(u, v, parent);
        if (cycle.length > 0) cycles.push(cycle);
      } else if (color.get(v) === WHITE) {
        parent.set(v, u);
        dfs(v);
      }
    }

    color.set(u, BLACK);
  }

  return cycles;
}

function extractCycle(from: string, to: string, parent: Map<string, string | null>): string[] {
  const cycle: string[] = [to];
  let current = from;
  while (current !== to) {
    cycle.push(current);
    current = parent.get(current)!;
    if (current === null) return [];
  }
  cycle.reverse();
  return cycle;
}
