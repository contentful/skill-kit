import type { PrimitiveConfig, Handshake } from '../types.js';
import { HOST_REGISTRY } from '../protocol/host.js';
import type { PreambleRow, RenderContext } from './primitive.js';
import { askUserPrimitive } from './ask-user.js';
import { confirmPrimitive } from './confirm.js';
import { planPrimitive } from './plan.js';
import { checklistPrimitive } from './checklist.js';
import { subagentPrimitive } from './subagent.js';
import { surveyPrimitive } from './survey.js';

const ALL_PRIMITIVES = [
  askUserPrimitive,
  confirmPrimitive,
  planPrimitive,
  checklistPrimitive,
  subagentPrimitive,
  surveyPrimitive,
];

const RENDERERS: Record<string, (config: never, ctx?: RenderContext) => string> = {
  askUser: askUserPrimitive.render as (config: never, ctx?: RenderContext) => string,
  confirm: confirmPrimitive.render as (config: never, ctx?: RenderContext) => string,
  plan: planPrimitive.render as (config: never, ctx?: RenderContext) => string,
  checklist: checklistPrimitive.render as (config: never, ctx?: RenderContext) => string,
  subagent: subagentPrimitive.render as (config: never, ctx?: RenderContext) => string,
  survey: surveyPrimitive.render as (config: never, ctx?: RenderContext) => string,
};

export function renderPrimitive(config: PrimitiveConfig, ctx?: RenderContext): string {
  return RENDERERS[config.kind]!(config as never, ctx);
}

export type ToolResolver = Record<string, string | undefined>;

export function resolveTools(handshake: Handshake): ToolResolver {
  // Explicit tools (from --tools) are authoritative — subagents may report a subset.
  // Only fall back to host registry when no tools are reported at all.
  const tools = handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);

  const resolved: ToolResolver = {};
  for (const p of ALL_PRIMITIVES) {
    resolved[p.tag] = p.tools.find((t: string) => tools.includes(t));
  }
  return resolved;
}

export function preambleRows(resolved: ToolResolver): PreambleRow[] {
  return [
    { tag: '`<system>`', tool: '—', instruction: 'Behavioral directives. Follow as persona/tone guidelines.' },
    { tag: '`<prompt>`', tool: '—', instruction: 'Task instructions. The work to perform.' },
    ...ALL_PRIMITIVES.map((p) => p.preambleRow(resolved[p.tag])),
    {
      tag: '`<rendered>`',
      tool: '—',
      instruction: 'Pre-rendered output from the skill. Emit verbatim — no edits, no commentary.',
    },
  ];
}

export type { PreambleRow };
