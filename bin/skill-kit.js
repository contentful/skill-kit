#!/usr/bin/env node

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'build') {
  const { buildSkill } = await import('../src/build/index.js');

  const flags = {};
  let entry = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--out') {
      flags.outDir = args[++i];
    } else if (arg === '--targets') {
      flags.targets = args[++i]?.split(',');
    } else if (arg === '--single') {
      flags.single = true;
    } else if (!arg.startsWith('-')) {
      entry = arg;
    }
  }

  if (!entry) {
    process.stderr.write('Usage: skill-kit build <entry.ts> -o <outdir>\n');
    process.exit(1);
  }

  if (!flags.outDir) {
    process.stderr.write('error: -o <outdir> is required\n');
    process.exit(1);
  }

  try {
    await buildSkill({ entry, outDir: flags.outDir, targets: flags.targets, single: flags.single });
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
} else if (command === 'run') {
  const skillPath = args[1];
  if (!skillPath) {
    process.stderr.write('Usage: skill-kit run <skill.ts> start|advance [flags]\n');
    process.exit(1);
  }

  const absPath = resolve(skillPath);
  if (!existsSync(absPath)) {
    process.stderr.write(`error: skill file not found: ${absPath}\n`);
    process.exit(1);
  }

  const mod = await import(absPath);
  const skill = mod.default;
  if (!skill || skill.kind !== 'skill') {
    process.stderr.write(`error: ${absPath} does not export a default skill\n`);
    process.exit(1);
  }

  const { main } = await import('../src/protocol/cli-entry.js');
  // Shift argv so the skill sees: [node, skill, subcommand, ...flags]
  process.argv = [process.argv[0], absPath, ...args.slice(2)];
  await main(skill);
} else if (command === 'check') {
  const skillPath = args[1];
  if (!skillPath) {
    process.stderr.write('Usage: skill-kit check <skill.ts>\n');
    process.exit(1);
  }

  const absPath = resolve(skillPath);
  const mod = await import(absPath);
  const skill = mod.default;

  const { dirname } = await import('node:path');
  const { checkSkill } = await import('../src/lint/index.js');
  const diagnostics = checkSkill(skill, dirname(absPath));

  for (const d of diagnostics) {
    const prefix = d.severity === 'error' ? '✗' : '⚠';
    const location = d.step ? ` [${d.step}]` : d.file ? ` [${d.file}]` : '';
    process.stderr.write(`${prefix} ${d.rule}${location}: ${d.message}\n`);
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    process.stderr.write(`\n${errors.length} error(s) found.\n`);
    process.exit(1);
  } else if (diagnostics.length > 0) {
    process.stderr.write(`\n${diagnostics.length} warning(s).\n`);
  } else {
    process.stderr.write('✓ No issues found.\n');
  }
} else {
  process.stderr.write(
    [
      'skill-kit — CLI for @contentful/skill-kit',
      '',
      'Commands:',
      '  build <entry.ts> -o <dir>   Build a distributable skill directory',
      '  run <skill.ts> <subcommand> Run a skill in dev mode',
      '  check <skill.ts>            Lint a skill definition',
      '',
      'Run any command with --help for details.',
      '',
    ].join('\n'),
  );
}
