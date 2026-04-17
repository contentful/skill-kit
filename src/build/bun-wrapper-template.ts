export function generateBunWrapper(skillEntryAbsPath: string): string {
  return [
    `import skill from '${skillEntryAbsPath}';`,
    `import { main } from '@contentful/skill-kit/cli';`,
    `main(skill);`,
    '',
  ].join('\n');
}
