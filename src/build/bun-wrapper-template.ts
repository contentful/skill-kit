import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntryAbs = resolve(sdkRoot, 'src', 'cli.ts');

export function generateBunWrapper(entryAbsPath: string, kind: 'skill' | 'reference'): string {
  const mainFn = kind === 'reference' ? 'referenceMain' : 'main';
  return [
    `import def from '${entryAbsPath}';`,
    `import { ${mainFn} } from '${cliEntryAbs}';`,
    `${mainFn}(def);`,
    '',
  ].join('\n');
}
