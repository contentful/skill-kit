import type { Handshake, AskUserConfig, ConfirmConfig, PlanConfig, TasksConfig, SubtaskConfig } from '../../types.js';
import * as claudeCode from './claude-code.js';
import * as codex from './codex.js';
import * as opencode from './opencode.js';
import * as generic from './generic.js';

export interface ProseGenerator {
  askUser(config: AskUserConfig): string;
  confirm(config: ConfirmConfig): string;
  plan(config: PlanConfig): string;
  tasks(config: TasksConfig): string;
  subtask(config: SubtaskConfig): string;
}

function wrap(mod: typeof claudeCode): ProseGenerator {
  return {
    askUser: mod.askUserProse,
    confirm: mod.confirmProse,
    plan: mod.planProse,
    tasks: mod.tasksProse,
    subtask: mod.subtaskProse,
  };
}

const generators: Record<string, ProseGenerator> = {
  'claude-code': wrap(claudeCode),
  codex: wrap(codex),
  opencode: wrap(opencode),
  generic: wrap(generic),
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
