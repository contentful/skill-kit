import type { Handshake, AskUserConfig, ConfirmConfig, PlanConfig, TasksConfig, SubtaskConfig } from '../../types.js';
import * as defaults from './default.js';

export interface ProseGenerator {
  askUser(config: AskUserConfig): string;
  confirm(config: ConfirmConfig): string;
  plan(config: PlanConfig): string;
  tasks(config: TasksConfig): string;
  subtask(config: SubtaskConfig): string;
}

const defaultGenerator: ProseGenerator = {
  askUser: defaults.askUserProse,
  confirm: defaults.confirmProse,
  plan: defaults.planProse,
  tasks: defaults.tasksProse,
  subtask: defaults.subtaskProse,
};

// Per-host overrides — spread defaultGenerator and replace only what differs.
// Example: 'claude-code': { ...defaultGenerator, askUser: claudeCodeAskUser }
const generators: Record<string, ProseGenerator> = {
  'claude-code': defaultGenerator,
  codex: defaultGenerator,
  opencode: defaultGenerator,
  generic: defaultGenerator,
};

export function resolveProseGenerator(handshake: Handshake): ProseGenerator {
  if (handshake.toolsAvailable.includes('AskUserQuestion')) {
    return generators['claude-code']!;
  }
  if (handshake.toolsAvailable.includes('apply_patch') && handshake.toolsAvailable.includes('update_plan')) {
    return generators['codex']!;
  }
  if (handshake.toolsAvailable.includes('multiedit')) {
    return generators['opencode']!;
  }
  return generators[handshake.host] ?? generators['generic']!;
}
