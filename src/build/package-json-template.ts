import { readFileSync, existsSync } from 'node:fs';
import type { PackageConfig } from '../types.js';

export interface PackageJsonOptions {
  name: string;
  packageConfig?: PackageConfig;
  existingPath?: string;
}

export function generatePackageJson(version: string, opts: PackageJsonOptions): string {
  let existing: Record<string, unknown> = {};
  if (opts.existingPath && existsSync(opts.existingPath)) {
    try {
      existing = JSON.parse(readFileSync(opts.existingPath, 'utf-8'));
    } catch {
      // malformed existing file — start fresh
    }
  }

  const { name: pkgName, ...restConfig } = opts.packageConfig ?? {};

  const result: Record<string, unknown> = {
    ...existing,
    ...restConfig,
    name: pkgName ?? opts.name,
    version,
  };

  return JSON.stringify(result, null, 2);
}
