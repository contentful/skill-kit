import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ReferenceLoader } from '../types.js';

export function createReferenceLoader(basePath: string): ReferenceLoader {
  const refsDir = resolve(basePath, 'references');
  const cache = new Map<string, string>();

  return {
    load(filename: string): string {
      const cached = cache.get(filename);
      if (cached !== undefined) return cached;

      const filePath = join(refsDir, filename);
      const content = readFileSync(filePath, 'utf-8');
      cache.set(filename, content);
      return content;
    },

    asset(path: string): string {
      return resolve(basePath, path);
    },
  };
}
