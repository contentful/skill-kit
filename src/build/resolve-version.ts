import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ResolvedVersion {
  version: string;
  source: string;
}

export function resolveVersionFromAncestor(startDir: string): ResolvedVersion | undefined {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const raw = JSON.parse(readFileSync(candidate, 'utf-8'));
        if (typeof raw.version === 'string' && raw.version) {
          return { version: raw.version, source: candidate };
        }
      } catch {
        // malformed JSON — skip and keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
