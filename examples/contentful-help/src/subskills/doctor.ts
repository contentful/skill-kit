import { skill, type, act } from '@contentful/skill-kit';

export default skill({
  name: 'doctor',
  version: '1.0.0',
  description: 'Diagnose and fix common Contentful issues.',
  entry: 'diagnose',
  params: type({ spaceId: 'string = ""' }),
})
  .step('diagnose', {
    prompt: ({ params }) =>
      `Check the Contentful space "${params.spaceId}" for common issues. ` +
      'Look for: missing locales, unpublished entries, broken references, rate limit issues.',
    response: type({
      issues: 'string[]',
      healthy: 'boolean',
    }),
    next: ({ response }) => (response.healthy ? 'report-clean' : 'suggest-fix'),
  })

  .step('suggest-fix', {
    prompt: ({ store }) => {
      const issues = store.maybe('diagnose')?.issues ?? [];
      return (
        `Found issues: ${issues.join(', ')}. Suggest fixes for each issue. ` +
        'Explain what each fix does and any risks.'
      );
    },
    response: type({
      fixes: type({ issue: 'string', fix: 'string' }).array(),
    }),
    next: 'confirm-fix',
  })

  .step('confirm-fix', {
    prompt: act.askUser({
      type: 'structured',
      question: 'Apply the suggested fixes?',
      options: [
        { value: 'apply', label: 'Apply all', description: 'Apply all suggested fixes' },
        { value: 'skip', label: 'Skip', description: 'Show report without fixing' },
      ],
    }),
    response: type({ choice: "'apply' | 'skip'" }),
    next: ({ response }) => (response.choice === 'apply' ? 'apply-fix' : 'report-issues'),
  })

  .step('apply-fix', {
    prompt: 'Apply the fixes and report results.',
    response: type({ applied: 'number', failed: 'number' }),
    next: 'report-issues',
  })

  .step('report-issues', {
    prompt: ({ store }) => {
      const issues = store.maybe('diagnose')?.issues ?? [];
      return `Summarize: found ${issues.length} issue(s). Report the status of each.`;
    },
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })

  .step('report-clean', {
    prompt: 'The space is healthy! Report a clean bill of health.',
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })
  .build();
