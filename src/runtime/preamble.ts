import type { Handshake } from '../types.js';

export function generatePreamble(handshake: Handshake): string {
  const lines = [
    'You are following a structured workflow driven by a skill CLI.',
    'Each step provides a prompt describing what to do and a JSON schema for the expected output.',
    'Follow the prompt instructions precisely and return output matching the schema.',
  ];

  if (handshake.toolsAvailable.includes('AskUserQuestion')) {
    lines.push('When a step says "ask the user", use the AskUserQuestion tool with the exact options provided.');
  }

  if (handshake.toolsAvailable.includes('EnterPlanMode')) {
    lines.push('When a step presents a plan for approval, use EnterPlanMode/ExitPlanMode to present it.');
  }

  if (handshake.toolsAvailable.includes('TaskCreate')) {
    lines.push('When a step creates tracked tasks, use TaskCreate and TaskUpdate to manage them.');
  }

  if (handshake.toolsAvailable.includes('Agent')) {
    lines.push('When a step spawns a subtask, use the Agent tool to run it in isolated context.');
  }

  lines.push(
    'When a step provides a "Rendered output" block, emit it verbatim with no preamble, commentary, or added markdown.',
  );

  return lines.join('\n');
}
