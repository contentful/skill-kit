import { skill, z, askUser } from '@contentful/skill-kit';

export default skill({
  name: 'doctor',
  version: '1.0.0',
  description: 'Diagnose and fix common Contentful issues.',
  entry: 'diagnose',
  context: z.object({ spaceId: z.string().default('') }),
  stash: z.object({ issues: z.array(z.string()) }),
})
  .step('diagnose', {
    prompt: ({ context }) =>
      `Check the Contentful space "${context.spaceId}" for common issues. ` +
      'Look for: missing locales, unpublished entries, broken references, rate limit issues.',
    output: z.object({
      issues: z.array(z.string()),
      healthy: z.boolean(),
    }),
    stash: ({ output }) => ({ issues: output.issues }),
    next: ({ output }) => (output.healthy ? 'report-clean' : 'suggest-fix'),
  })

  .step('suggest-fix', {
    prompt: ({ stash }) =>
      `Found issues: ${stash.issues.join(', ')}. Suggest fixes for each issue. ` +
      'Explain what each fix does and any risks.',
    output: z.object({
      fixes: z.array(z.object({ issue: z.string(), fix: z.string() })),
    }),
    next: 'confirm-fix',
  })

  .step('confirm-fix', {
    ask: askUser({
      type: 'structured',
      question: 'Apply the suggested fixes?',
      options: [
        { value: 'apply', label: 'Apply all', description: 'Apply all suggested fixes' },
        { value: 'skip', label: 'Skip', description: 'Show report without fixing' },
      ],
    }),
    output: z.object({ choice: z.enum(['apply', 'skip']) }),
    next: ({ output }) => (output.choice === 'apply' ? 'apply-fix' : 'report-issues'),
  })

  .step('apply-fix', {
    prompt: 'Apply the fixes and report results.',
    output: z.object({ applied: z.number(), failed: z.number() }),
    next: 'report-issues',
  })

  .step('report-issues', {
    prompt: ({ stash }) => `Summarize: found ${stash.issues.length} issue(s). Report the status of each.`,
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })

  .step('report-clean', {
    prompt: 'The space is healthy! Report a clean bill of health.',
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })
  .build();
