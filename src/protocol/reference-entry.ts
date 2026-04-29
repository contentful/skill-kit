import { dirname, resolve } from 'node:path';
import type { ReferenceDefinition } from '../types.js';
import { createReferenceLoader } from '../runtime/reference-loader.js';

function resolveSkillDir(): string {
  // In a compiled bun binary, process.execPath is the real binary on disk (e.g. .../bin/name-darwin-arm64)
  // process.argv[1] points inside bun's virtual filesystem (/$bunfs/...) which is useless for file I/O
  const binPath = process.execPath;
  // Binary lives in <skill-dir>/bin/<name>, so skill dir is two levels up
  return resolve(dirname(binPath), '..');
}

export async function referenceMain(def: ReferenceDefinition, refsBasePath?: string): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === 'mcp') {
    const refs = createReferenceLoader(refsBasePath ?? resolveSkillDir());
    const { mcpReferenceMain } = await import('./mcp-reference.js');
    await mcpReferenceMain(def, refs);
    return;
  }

  const command = args[0];

  if (command === '--help' || command === '-h') {
    printHelp(def);
    return;
  }

  const refs = createReferenceLoader(refsBasePath ?? resolveSkillDir());

  if (!command || command === 'topics') {
    for (const [name, topic] of Object.entries(def.topics)) {
      process.stdout.write(`${name}: ${topic.label}\n`);
    }
    return;
  }

  if (command === 'topic') {
    const topicName = args[1];
    if (!topicName) {
      process.stderr.write('error: topic name required. Run with "topics" to list.\n');
      process.exit(1);
    }

    const topic = def.topics[topicName];
    if (!topic) {
      process.stderr.write(`error: unknown topic "${topicName}". Run with "topics" to list.\n`);
      process.exit(1);
    }

    const content = topic.content({ refs });
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
    return;
  }

  process.stderr.write(`error: unknown command "${command}". Run with --help.\n`);
  process.exit(1);
}

function printHelp(def: ReferenceDefinition): void {
  const lines = [
    `${def.name} — reference skill`,
    '',
    'Commands:',
    '  topics              List all available topics',
    '  topic <name>        Load a specific topic',
    '  --help              Print this message',
    '',
    'Topics:',
    ...Object.entries(def.topics).map(([name, t]) => `  ${name.padEnd(20)} ${t.label}`),
  ];
  process.stderr.write(lines.join('\n') + '\n');
}
