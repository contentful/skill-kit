import type { SkillDefinition, ActSegment, PromptPiece } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

function extractActSegments(prompt: unknown): ActSegment[] {
  if (!prompt) return [];
  if (Array.isArray(prompt)) {
    return prompt.filter(
      (p): p is ActSegment => typeof p === 'object' && p !== null && 'kind' in p && p.kind === 'act',
    );
  }
  if (
    typeof prompt === 'object' &&
    prompt !== null &&
    'kind' in prompt &&
    (prompt as PromptPiece & { kind: string }).kind === 'act'
  ) {
    return [prompt as ActSegment];
  }
  return [];
}

export function primitiveSchemaMatch(skill: SkillDefinition): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const [stepName, stepDef] of Object.entries(skill.steps)) {
    const acts = extractActSegments(stepDef.config.prompt);
    const askAct = acts.find((a) => a.primitive.kind === 'askUser' && a.primitive.type === 'structured');
    if (!askAct || askAct.primitive.kind !== 'askUser' || askAct.primitive.type !== 'structured') continue;

    const optionValues = askAct.primitive.options.map((o: { value: string }) => o.value);

    if (!stepDef.config.output) continue;

    let schemaJson: Record<string, unknown> | null = null;
    try {
      schemaJson = stepDef.config.output.toJsonSchema() as Record<string, unknown>;
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
