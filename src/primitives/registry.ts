import type { PrimitiveConfig, Handshake } from '../types.js';
import { HOST_REGISTRY } from '../protocol/host.js';
import type { PreambleRow } from './primitive.js';
import { askUserPrimitive } from './ask-user.js';
import { confirmPrimitive } from './confirm.js';
import { planPrimitive } from './plan.js';
import { checklistPrimitive } from './checklist.js';
import { subagentPrimitive } from './subagent.js';

const ALL_PRIMITIVES = [askUserPrimitive, confirmPrimitive, planPrimitive, checklistPrimitive, subagentPrimitive];

const RENDERERS: Record<string, (config: never) => string> = {
  askUser: askUserPrimitive.render as (config: never) => string,
  confirm: confirmPrimitive.render as (config: never) => string,
  plan: planPrimitive.render as (config: never) => string,
  checklist: checklistPrimitive.render as (config: never) => string,
  subagent: subagentPrimitive.render as (config: never) => string,
};

export function renderPrimitive(config: PrimitiveConfig): string {
  return RENDERERS[config.kind]!(config as never);
}

export type ToolResolver = Record<string, string | undefined>;

export function resolveTools(handshake: Handshake): ToolResolver {
  const tools = handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);

  const resolved: ToolResolver = {};
  for (const p of ALL_PRIMITIVES) {
    const match = p.tools.find((t: string) => tools.includes(t));
    resolved[p.tag] = match;
  }
  return resolved;
}

export function preambleRows(resolved: ToolResolver): PreambleRow[] {
  return [
    { tag: '`<system>`', tool: '—', instruction: 'Behavioral directives. Follow as persona/tone guidelines.' },
    { tag: '`<prompt>`', tool: '—', instruction: 'Task instructions. The work to perform.' },
    ...ALL_PRIMITIVES.map((p) => p.preambleRow(resolved[p.tag])),
  ];
}

export type { PreambleRow };
