import type { Handshake } from '../types.js';

const HOST_REGISTRY: Record<string, string[]> = {
  'claude-code': [
    'AskUserQuestion',
    'EnterPlanMode',
    'ExitPlanMode',
    'TaskCreate',
    'TaskUpdate',
    'TaskList',
    'TaskGet',
    'Agent',
    'Skill',
    'Read',
    'Edit',
    'Write',
    'Bash',
    'Glob',
    'Grep',
    'WebFetch',
    'WebSearch',
    'TodoWrite',
  ],
  codex: ['shell', 'apply_patch', 'update_plan', 'web_search', 'view_image', 'exec_command', 'write_stdin'],
  opencode: ['bash', 'read', 'write', 'edit', 'apply_patch', 'multiedit', 'glob', 'grep', 'todowrite', 'task'],
};

export function resolveHost(hostName?: string): Handshake {
  const name = hostName ?? 'generic';
  return {
    host: name,
    toolsAvailable: HOST_REGISTRY[name] ?? [],
  };
}
