import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntryAbs = resolve(sdkRoot, 'src', 'cli.ts');

export function generateBunWrapper(skillEntryAbsPath: string): string {
  return [
    `import skill from '${skillEntryAbsPath}';`,
    `import { main } from '${cliEntryAbs}';`,
    `main(skill);`,
    '',
  ].join('\n');
}
