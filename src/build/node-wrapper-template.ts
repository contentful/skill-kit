import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntryAbs = resolve(sdkRoot, 'src', 'cli.ts');

export function generateNodeWrapper(entryAbsPath: string, kind: 'skill' | 'reference'): string {
  if (kind === 'reference') {
    return [
      `import def from '${entryAbsPath}';`,
      `import { referenceMain } from '${cliEntryAbs}';`,
      `referenceMain(def, process.env.SKILL_DIR);`,
      '',
    ].join('\n');
  }
  return [`import def from '${entryAbsPath}';`, `import { main } from '${cliEntryAbs}';`, `main(def);`, ''].join('\n');
}
