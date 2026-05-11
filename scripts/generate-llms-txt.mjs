import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'docs-site', 'dist');
const BASE_URL = 'https://contentful.github.io/skill-kit/';
const GITHUB_URL = 'https://github.com/contentful/skill-kit/blob/main/';

const SOURCES = [
  { path: 'README.md', title: 'Overview', description: 'Project overview, quick start, and skill types' },
  {
    path: 'docs/api.md',
    title: 'API Reference',
    description:
      'Full API: workflow builder, step config, reference builder, modules, composites, primitives, testing, CLI',
  },
];

const PAGES = [
  {
    section: 'Getting Started',
    items: [
      { title: 'Overview', url: 'getting-started/', desc: 'Installation, first skill, build & run' },
      {
        title: 'Building & Distribution',
        url: 'getting-started/building/',
        desc: 'Build command, flags, output structure, modes',
      },
      { title: 'Testing Skills', url: 'getting-started/testing/', desc: 'Test harness, mockModel, execution traces' },
    ],
  },
  {
    section: 'Guides',
    items: [
      {
        title: 'Workflow Skills',
        url: 'guides/workflow-skills/',
        desc: 'State machines: steps, transitions, store, branching',
      },
      {
        title: 'Reference Skills',
        url: 'guides/reference-skills/',
        desc: 'Progressive disclosure: topics, lazy loading',
      },
      {
        title: 'Composite Skills',
        url: 'guides/composite-skills/',
        desc: 'Dispatchers combining sub-skills and topics',
      },
      {
        title: 'Primitives',
        url: 'guides/primitives/',
        desc: 'askUser, confirm, plan, checklist, subagent — host-portable XML tags',
      },
      { title: 'Modules', url: 'guides/modules/', desc: 'Reusable step sequences via register()' },
    ],
  },
  {
    section: 'Reference',
    items: [{ title: 'API Reference', url: 'api/', desc: 'Complete API documentation' }],
  },
  {
    section: 'Examples',
    items: [
      {
        title: 'get-to-know-you (Workflow)',
        url: 'examples/get-to-know-you/',
        desc: 'Interview skill demonstrating full workflow builder API',
      },
      {
        title: 'ts-patterns (Reference)',
        url: 'examples/ts-patterns/',
        desc: 'TypeScript patterns reference skill with progressive disclosure',
      },
      {
        title: 'contentful-help (Composite)',
        url: 'examples/contentful-help/',
        desc: 'Composite skill with sub-skill dispatch and FAQ topics',
      },
    ],
  },
];

function generateIndex() {
  const lines = [
    '# @contentful/skill-kit',
    '',
    '> TypeScript SDK for building agent skills with CLI-driven workflows. Workflow skills are typed state machines. Reference skills provide progressive disclosure. Composite skills combine both. All compile to self-contained packages agents invoke via Bash.',
    '',
    '## Instructions for LLM Agents',
    '',
    'If you are helping a developer build a skill with @contentful/skill-kit:',
    '- Start with the Overview for quick start patterns',
    '- Use the API Reference for exact function signatures and options',
    '- Check Examples for full working implementations of each skill type',
    `- For all documentation inlined in a single file: ${BASE_URL}llms-full.txt`,
    '',
    '## Quick Start',
    '',
    '```typescript',
    "import { skill, type, terminal } from '@contentful/skill-kit';",
    '',
    'export default skill({ name: "greet", entry: "ask" })',
    '  .step("ask", {',
    '    prompt: "Ask the user their name.",',
    '    response: type({ name: "string" }),',
    '    next: "farewell",',
    '  })',
    '  .step("farewell", {',
    '    prompt: (ctx) => `Say goodbye to ${ctx.response.name}.`,',
    '    response: type({ message: "string" }),',
    '    next: terminal,',
    '  })',
    '  .build();',
    '```',
    '',
  ];

  for (const section of PAGES) {
    lines.push(`## ${section.section}`, '');
    for (const item of section.items) {
      lines.push(`- [${item.title}](${BASE_URL}${item.url}): ${item.desc}`);
    }
    lines.push('');
  }

  lines.push('## Source Documents', '');
  for (const src of SOURCES) {
    lines.push(`- [${src.title}](${GITHUB_URL}${src.path}): ${src.description}`);
  }
  lines.push('');

  return lines.join('\n');
}

function stripHtmlBlocks(content) {
  return content.replace(/<p[^>]*>[\s\S]*?<\/p>\s*/g, '').replace(/^---\s*\n/, '');
}

async function generateFull() {
  const lines = [
    '# @contentful/skill-kit — Complete Documentation',
    '',
    '> TypeScript SDK for building agent skills with CLI-driven workflows.',
    '',
    '---',
    '',
  ];

  for (const src of SOURCES) {
    const raw = await readFile(path.join(ROOT, src.path), 'utf-8');
    const content = src.path === 'README.md' ? stripHtmlBlocks(raw) : raw;
    lines.push(`<!-- SOURCE: ${src.path} -->`, '', content.trim(), '', '---', '');
  }

  return lines.join('\n');
}

async function main() {
  const [index, full] = await Promise.all([generateIndex(), generateFull()]);

  await Promise.all([writeFile(path.join(DIST, 'llms.txt'), index), writeFile(path.join(DIST, 'llms-full.txt'), full)]);

  console.log(`llms.txt      ${(index.length / 1024).toFixed(1)} KB`);
  console.log(`llms-full.txt ${(full.length / 1024).toFixed(1)} KB`);
}

main();
