import type { Handshake } from '../types.js';
import { HOST_REGISTRY } from '../protocol/host.js';

function effectiveTools(handshake: Handshake): string[] {
  return handshake.toolsAvailable.length > 0 ? handshake.toolsAvailable : (HOST_REGISTRY[handshake.host] ?? []);
}

function has(tools: string[], ...names: string[]): string | undefined {
  return names.find((n) => tools.includes(n));
}

export function generatePreamble(handshake: Handshake): string {
  const tools = effectiveTools(handshake);

  const lines = [
    'You are following a structured workflow driven by a skill CLI.',
    'Each step provides a prompt describing what to do and a JSON schema for the expected output.',
    'Follow the prompt instructions precisely and return output matching the schema.',
    '',
    'The prompt may use these verbs. Follow the mapping below:',
  ];

  // ASK_STRUCTURED
  const askTool = has(
    tools,
    'AskUserQuestion',
    'ToolRequestUserInput',
    'ask_followup_question',
    'ask-user',
    'question',
  );
  if (askTool) {
    lines.push(
      `- "ASK_STRUCTURED" → Use the ${askTool} tool with the exact options provided. Do not modify or add options.`,
    );
  } else {
    lines.push(
      '- "ASK_STRUCTURED" → Present the listed options to the user as a numbered list. Accept only answers matching one of the options.',
    );
  }

  // ASK_FREEFORM
  lines.push(
    '- "ASK_FREEFORM" → Ask the user conversationally in plain text. Do NOT use any structured question tool or present multiple-choice. Let the user answer in their own words.',
  );

  // PRESENT_PLAN
  const planTool = has(tools, 'EnterPlanMode', 'enter-plan-mode', 'update_plan', 'plan', 'PLAN_MODE');
  if (planTool) {
    lines.push(`- "PRESENT_PLAN" → Use ${planTool} to present the plan. Wait for approval before proceeding.`);
  } else {
    lines.push('- "PRESENT_PLAN" → Present the plan as a numbered list and ask whether to proceed.');
  }

  // CREATE_CHECKLIST
  const checklistTool = has(tools, 'TaskCreate', 'tracker-create-task', 'write-todos', 'todo', 'update_todo_list');
  if (checklistTool) {
    lines.push(`- "CREATE_CHECKLIST" → Use ${checklistTool} to register items and update status as each completes.`);
  } else {
    lines.push('- "CREATE_CHECKLIST" → Maintain a visible checklist and update status as items complete.');
  }

  // SPAWN_SUBAGENT
  const agentTool = has(tools, 'Agent', 'agent', 'CollabAgent', 'task', 'USE_SUBAGENTS', 'new_task');
  if (agentTool) {
    lines.push(`- "SPAWN_SUBAGENT" → Use the ${agentTool} tool to run the subagent in isolated context.`);
  } else {
    lines.push('- "SPAWN_SUBAGENT" → Focus on the subagent task, then return to the main workflow.');
  }

  lines.push('');
  lines.push(
    'When a step provides a "Rendered output" block, emit it verbatim with no preamble, commentary, or added markdown.',
  );

  return lines.join('\n');
}
