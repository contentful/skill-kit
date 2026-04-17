import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

export function orphanReferences(skill: SkillDefinition, rootDir: string): LintDiagnostic[] {
  const refsDir = join(rootDir, 'references');
  if (!existsSync(refsDir)) return [];

  const files = readdirSync(refsDir);
  if (files.length === 0) return [];

  const referenced = new Set<string>();

  for (const [_name, stepDef] of Object.entries(skill.steps)) {
    const { prompt: promptConfig } = stepDef.config;
    if (!promptConfig) continue;

    const source = typeof promptConfig === 'string' ? promptConfig : promptConfig.toString();
    for (const file of files) {
      if (source.includes(file)) {
        referenced.add(file);
      }
    }
  }

  const diagnostics: LintDiagnostic[] = [];
  for (const file of files) {
    if (!referenced.has(file)) {
      diagnostics.push({
        rule: 'orphan-references',
        severity: 'warning',
        message: `Reference file "${file}" is not referenced by any step. Remove it or add a reference.`,
        file: join('references', file),
      });
    }
  }

  return diagnostics;
}
