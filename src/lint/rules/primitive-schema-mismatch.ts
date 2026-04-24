import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

export function primitiveSchemaMatch(skill: SkillDefinition): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const [stepName, stepDef] of Object.entries(skill.steps)) {
    const { primitive } = stepDef.config;
    if (!primitive || primitive.kind !== 'askUser' || primitive.type !== 'structured') continue;

    const optionValues = primitive.options.map((o: { value: string }) => o.value);

    let schemaJson: Record<string, unknown> | null = null;
    try {
      schemaJson = stepDef.config.output.toJSONSchema() as Record<string, unknown>;
    } catch {
      continue;
    }

    const props = schemaJson?.['properties'] as Record<string, unknown> | undefined;
    if (!props) continue;

    for (const [_key, propSchema] of Object.entries(props)) {
      const schema = propSchema as Record<string, unknown>;
      if (schema['enum'] && Array.isArray(schema['enum'])) {
        const enumValues = schema['enum'] as string[];
        const missing = optionValues.filter((v) => !enumValues.includes(v));
        const extra = enumValues.filter((v) => !optionValues.includes(v));

        if (missing.length > 0) {
          diagnostics.push({
            rule: 'primitive-schema-mismatch',
            severity: 'error',
            message: `Step "${stepName}": askUser option values [${missing.join(', ')}] are not in the output enum.`,
            step: stepName,
          });
        }
        if (extra.length > 0) {
          diagnostics.push({
            rule: 'primitive-schema-mismatch',
            severity: 'warning',
            message: `Step "${stepName}": output enum has values [${extra.join(', ')}] not in askUser options.`,
            step: stepName,
          });
        }
      }
    }
  }

  return diagnostics;
}
