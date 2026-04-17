import type { Handshake } from '../types.js';

export function generatePreamble(handshake: Handshake): string {
  const lines = [
    'You are following a structured workflow driven by a skill CLI.',
    'Each step provides a prompt describing what to do and a JSON schema for the expected output.',
    'Follow the prompt instructions precisely and return output matching the schema.',
    '',
    'The prompt may use these verbs. Follow the mapping below:',
  ];

  if (handshake.toolsAvailable.includes('AskUserQuestion')) {
    lines.push(
      '- "ASK_STRUCTURED" → Use the AskUserQuestion tool with the exact options provided. Do not modify or add options.',
    );
  } else {
    lines.push(
      '- "ASK_STRUCTURED" → Present the listed options to the user as a numbered list. Accept only answers matching one of the options.',
    );
  }

  lines.push(
    '- "ASK_FREEFORM" → Ask the user conversationally in plain text. Do NOT use any structured question tool or present multiple-choice. Let the user answer in their own words.',
  );

  if (handshake.toolsAvailable.includes('EnterPlanMode')) {
    lines.push('- "PRESENT_PLAN" → Use EnterPlanMode/ExitPlanMode to present the plan.');
  } else {
    lines.push('- "PRESENT_PLAN" → Present the plan as a numbered list and ask whether to proceed.');
  }

  if (handshake.toolsAvailable.includes('TaskCreate')) {
    lines.push('- "CREATE_TASKS" → Use TaskCreate to register tasks and TaskUpdate to update them.');
  } else {
    lines.push('- "CREATE_TASKS" → Maintain a visible checklist and update status as items complete.');
  }

  if (handshake.toolsAvailable.includes('Agent')) {
    lines.push('- "SPAWN_SUBTASK" → Use the Agent tool to run the subtask in isolated context.');
  } else {
    lines.push('- "SPAWN_SUBTASK" → Focus on the subtask, then return to the main workflow.');
  }

  lines.push('');
  lines.push(
    'When a step provides a "Rendered output" block, emit it verbatim with no preamble, commentary, or added markdown.',
  );

  return lines.join('\n');
}
