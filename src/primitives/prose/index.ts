import type {
  Handshake,
  AskUserConfig,
  ConfirmConfig,
  PlanConfig,
  ChecklistConfig,
  SubagentConfig,
} from '../../types.js';
import { HOST_REGISTRY } from '../../protocol/host.js';

// --- Ask User ---
import { genericAskUserProse } from './ask-user/generic.js';
import { askUserQuestionProse } from './ask-user/ask-user-question.js';
import { toolRequestUserInputProse } from './ask-user/tool-request-user-input.js';
import { askFollowupQuestionProse } from './ask-user/ask-followup-question.js';
import { geminiAskUserProse } from './ask-user/ask-user-tool.js';
import { opencodeQuestionProse } from './ask-user/question-tool.js';

// --- Confirm ---
import { genericConfirmProse } from './confirm/generic.js';
import { askUserQuestionConfirmProse } from './confirm/ask-user-question.js';
import { askFollowupConfirmProse } from './confirm/ask-followup-question.js';

// --- Plan ---
import { genericPlanProse } from './plan/generic.js';
import { enterPlanModeProse } from './plan/enter-plan-mode.js';
import { updatePlanProse } from './plan/update-plan.js';
import { planToolProse } from './plan/plan-tool.js';
import { planModeToggleProse } from './plan/plan-mode-toggle.js';

// --- Checklist ---
import { genericChecklistProse } from './checklist/generic.js';
import { taskCreateProse } from './checklist/task-create.js';
import { trackerProse } from './checklist/tracker.js';
import { todoToolProse } from './checklist/todo-tool.js';
import { updateTodoListProse } from './checklist/update-todo-list.js';

// --- Subagent ---
import { genericSubagentProse } from './subagent/generic.js';
import { agentToolProse } from './subagent/agent-tool.js';
import { collabAgentProse } from './subagent/collab-agent.js';
import { taskToolProse } from './subagent/task-tool.js';
import { useSubagentsProse } from './subagent/use-subagents.js';
import { newTaskProse } from './subagent/new-task.js';

export interface ProseGenerator {
  askUser(config: AskUserConfig): string;
  confirm(config: ConfirmConfig): string;
  plan(config: PlanConfig): string;
  checklist(config: ChecklistConfig): string;
  subagent(config: SubagentConfig): string;
}

type ProseFn<T> = (config: T) => string;

// Central mapping: for each primitive, an ordered list of [toolName, proseFn].
// First match wins. Order = preference (most capable / specific tool first).
const CAPABILITY_MAP: {
  askUser: Array<[string, ProseFn<AskUserConfig>]>;
  confirm: Array<[string, ProseFn<ConfirmConfig>]>;
  plan: Array<[string, ProseFn<PlanConfig>]>;
  checklist: Array<[string, ProseFn<ChecklistConfig>]>;
  subagent: Array<[string, ProseFn<SubagentConfig>]>;
} = {
  askUser: [
    ['AskUserQuestion', askUserQuestionProse],
    ['ToolRequestUserInput', toolRequestUserInputProse],
    ['ask_followup_question', askFollowupQuestionProse],
    ['ask-user', geminiAskUserProse],
    ['question', opencodeQuestionProse],
  ],
  confirm: [
    ['AskUserQuestion', askUserQuestionConfirmProse],
    ['ask_followup_question', askFollowupConfirmProse],
  ],
  plan: [
    ['EnterPlanMode', enterPlanModeProse],
    ['enter-plan-mode', enterPlanModeProse],
    ['update_plan', updatePlanProse],
    ['plan', planToolProse],
    ['PLAN_MODE', planModeToggleProse],
  ],
  checklist: [
    ['TaskCreate', taskCreateProse],
    ['tracker-create-task', trackerProse],
    ['write-todos', todoToolProse],
    ['todo', todoToolProse],
    ['update_todo_list', updateTodoListProse],
  ],
  subagent: [
    ['Agent', agentToolProse],
    ['agent', agentToolProse],
    ['CollabAgent', collabAgentProse],
    ['task', taskToolProse],
    ['USE_SUBAGENTS', useSubagentsProse],
    ['new_task', newTaskProse],
  ],
};

const GENERIC_FALLBACKS: {
  askUser: ProseFn<AskUserConfig>;
  confirm: ProseFn<ConfirmConfig>;
  plan: ProseFn<PlanConfig>;
  checklist: ProseFn<ChecklistConfig>;
  subagent: ProseFn<SubagentConfig>;
} = {
  askUser: genericAskUserProse,
  confirm: genericConfirmProse,
  plan: genericPlanProse,
  checklist: genericChecklistProse,
  subagent: genericSubagentProse,
};

function resolve<T>(tools: string[], candidates: Array<[string, ProseFn<T>]>, fallback: ProseFn<T>): ProseFn<T> {
  const match = candidates.find(([tool]) => tools.includes(tool));
  return match ? match[1] : fallback;
}

export function buildProseGenerator(handshake: Handshake): ProseGenerator {
  const tools = handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);

  return {
    askUser: resolve(tools, CAPABILITY_MAP.askUser, GENERIC_FALLBACKS.askUser),
    confirm: resolve(tools, CAPABILITY_MAP.confirm, GENERIC_FALLBACKS.confirm),
    plan: resolve(tools, CAPABILITY_MAP.plan, GENERIC_FALLBACKS.plan),
    checklist: resolve(tools, CAPABILITY_MAP.checklist, GENERIC_FALLBACKS.checklist),
    subagent: resolve(tools, CAPABILITY_MAP.subagent, GENERIC_FALLBACKS.subagent),
  };
}

/** @deprecated Use buildProseGenerator instead */
export const resolveProseGenerator = buildProseGenerator;
