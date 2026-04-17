import type { StepDefinition } from '../types.js';

export class CycleGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleGuardError';
  }
}

export function validateCycleGuards(steps: Readonly<Record<string, StepDefinition>>): void {
  const stepNames = Object.keys(steps);
  const graph = buildGraph(steps, stepNames);
  const cycles = findCycles(graph, stepNames);

  for (const cycle of cycles) {
    for (const stepName of cycle) {
      const stepDef = steps[stepName]!;
      const { maxVisits, onMaxVisits } = stepDef.config;

      if (maxVisits === undefined || onMaxVisits === undefined) {
        throw new CycleGuardError(
          `Step "${stepName}" is in a cycle [${cycle.join(' → ')}] but lacks maxVisits and onMaxVisits. ` +
            `All steps in a cycle must declare both.`,
        );
      }

      if (!(onMaxVisits in steps)) {
        throw new CycleGuardError(`Step "${stepName}" has onMaxVisits "${onMaxVisits}" which does not exist in steps.`);
      }
    }
  }
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
