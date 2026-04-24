import type { PrimitiveConfig, Handshake } from '../types.js';
import { HOST_REGISTRY } from '../protocol/host.js';
import { renderAskUser, askUserTools, askUserPreambleRow, askUserOpenPreambleRow } from './ask-user.js';
import { renderConfirm, confirmTools, confirmPreambleRow } from './confirm.js';
import { renderPlan, planTools, planPreambleRow } from './plan.js';
import { renderChecklist, checklistTools, checklistPreambleRow } from './checklist.js';
import { renderSubagent, subagentTools, subagentPreambleRow } from './subagent.js';

export function renderPrimitive(config: PrimitiveConfig): string {
  switch (config.kind) {
    case 'askUser':
      return renderAskUser(config);
    case 'confirm':
      return renderConfirm(config);
    case 'plan':
      return renderPlan(config);
    case 'checklist':
      return renderChecklist(config);
    case 'subagent':
      return renderSubagent(config);
  }
}

const TOOL_CANDIDATES: Record<string, string[]> = {
  askUser: askUserTools,
  confirm: confirmTools,
  plan: planTools,
  checklist: checklistTools,
  subagent: subagentTools,
};

export type ToolResolver = Record<string, string | undefined>;

export function resolveTools(handshake: Handshake): ToolResolver {
  const tools = handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);

  const resolved: ToolResolver = {};
  for (const [kind, candidates] of Object.entries(TOOL_CANDIDATES)) {
    resolved[kind] = candidates.find((t) => tools.includes(t));
  }
  return resolved;
}

export interface PreambleRow {
  tag: string;
  tool: string;
  instruction: string;
}

export function preambleRows(resolved: ToolResolver): PreambleRow[] {
  return [
    { tag: '`<system>`', tool: '—', instruction: 'Behavioral directives. Follow as persona/tone guidelines.' },
    { tag: '`<prompt>`', tool: '—', instruction: 'Task instructions. The work to perform.' },
    askUserPreambleRow(resolved['askUser']),
    askUserOpenPreambleRow(),
    confirmPreambleRow(resolved['confirm']),
    planPreambleRow(resolved['plan']),
    checklistPreambleRow(resolved['checklist']),
    subagentPreambleRow(resolved['subagent']),
  ];
}
