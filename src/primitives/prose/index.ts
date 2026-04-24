import type { Handshake } from '../../types.js';
import { HOST_REGISTRY } from '../../protocol/host.js';

// Central mapping: for each primitive kind, an ordered list of tool names.
// First match in toolsAvailable wins. Used by the preamble to map tags to tools.
const TOOL_MAP: Record<string, string[]> = {
  askUser: ['AskUserQuestion', 'ToolRequestUserInput', 'ask_followup_question', 'ask-user', 'question'],
  confirm: ['AskUserQuestion', 'ask_followup_question'],
  plan: ['EnterPlanMode', 'enter-plan-mode', 'update_plan', 'plan', 'PLAN_MODE'],
  checklist: ['TaskCreate', 'tracker-create-task', 'write-todos', 'todo', 'update_todo_list'],
  subagent: ['Agent', 'agent', 'CollabAgent', 'task', 'USE_SUBAGENTS', 'new_task'],
};

export type ToolResolver = Record<string, string | undefined>;

export function buildToolResolver(handshake: Handshake): ToolResolver {
  const tools = handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);

  const resolved: ToolResolver = {};
  for (const [kind, candidates] of Object.entries(TOOL_MAP)) {
    resolved[kind] = candidates.find((t) => tools.includes(t));
  }
  return resolved;
}
