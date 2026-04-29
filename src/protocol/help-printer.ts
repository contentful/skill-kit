import type { SkillDefinition } from '../types.js';

export function printCompositeHelp(def: SkillDefinition): void {
  const subNames = def.subskills ? Object.keys(def.subskills) : [];
  const topicNames = def.topics ? Object.keys(def.topics) : [];

  const lines = [
    `${def.name} — composite skill`,
    '',
    'Usage:',
    `  ${def.name} --params '{"key":"value"}' [--host claude-code] [--session new]`,
    `  ${def.name} advance --session <id>`,
    `  ${def.name} advance --step <name> --output '{"..."}' --history '[...]'`,
  ];

  if (subNames.length > 0) {
    lines.push('');
    lines.push('Sub-skills (direct access):');
    for (const name of subNames) {
      const desc = def.subskills![name]!.definition.description;
      lines.push(`  ${name.padEnd(20)} ${desc}`);
    }
    lines.push('');
    lines.push(`  ${def.name} <subskill> --params '{"..."}' [--host claude-code]`);
    lines.push(`  ${def.name} <subskill> advance --step <name> --output '{"..."}' --history '[...]'`);
  }

  if (topicNames.length > 0) {
    lines.push('');
    lines.push('Reference topics:');
    for (const name of topicNames) {
      lines.push(`  ${name.padEnd(20)} ${def.topics![name]!.label}`);
    }
    lines.push('');
    lines.push(`  ${def.name} topics              List all topics`);
    lines.push(`  ${def.name} topic <name>         Load a topic`);
  }

  lines.push('');
  lines.push('Flags:');
  lines.push('  --params       JSON string. Validated against skill params schema. (start only)');
  lines.push('  --step         Step name (advance only). Sub-skill steps: <subskill>/<step>');
  lines.push('  --output       JSON string. Agent response for the step. (advance only)');
  lines.push('  --history      JSON array of {step, output, action?} objects. (advance only)');
  lines.push('  --host         Host identifier for prose generation. Default: generic.');
  lines.push('  --tools        Comma-separated list of available tools (merged with host registry).');
  lines.push('  --subagent     Indicates a subagent with a genuine tool subset (no registry merge).');
  lines.push('  --session      "new" to create a session (start), or session ID (advance).');
  lines.push('  --session-dir  Directory for session files. Default: OS temp directory.');
  lines.push('  --output-mode  "file" (default) or "flag". How agent passes step output.');
  lines.push('  --help         Print this message.');

  process.stderr.write(lines.join('\n') + '\n');
}
