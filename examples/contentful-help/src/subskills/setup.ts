import { skill, type, action, act } from '@contentful/skill-kit';

const checkEnv = action({
  name: 'check-env',
  input: type({}),
  output: type({
    hasSpaceId: 'boolean',
    hasToken: 'boolean',
    'spaceId?': 'string',
  }),
  run: async () => ({
    hasSpaceId: !!process.env['CONTENTFUL_SPACE_ID'],
    hasToken: !!process.env['CONTENTFUL_ACCESS_TOKEN'],
    spaceId: process.env['CONTENTFUL_SPACE_ID'] || undefined,
  }),
});

export default skill({
  name: 'setup',
  version: '1.0.0',
  description: 'Guided Contentful space setup and configuration.',
  entry: 'check-env',
})
  .step('check-env', {
    prompt: 'Acknowledge the environment check results and proceed.',
    response: type({ acknowledged: 'boolean' }),
    action: { run: checkEnv },
    next: ({ actionResult }) => (actionResult.hasSpaceId && actionResult.hasToken ? 'configure' : 'guide-env'),
  })

  .step('guide-env', {
    prompt: ({ store }) => {
      const checkRecord = store.history.find((r) => r.step === 'check-env');
      const actionResult = checkRecord?.actionResult as { hasSpaceId: boolean; hasToken: boolean } | undefined;
      const missing: string[] = [];
      if (!actionResult?.hasSpaceId) missing.push('CONTENTFUL_SPACE_ID');
      if (!actionResult?.hasToken) missing.push('CONTENTFUL_ACCESS_TOKEN');
      return (
        `The following environment variables are missing: ${missing.join(', ')}.\n\n` +
        'Guide the user to set them up. Explain where to find these values in the Contentful web app ' +
        '(Settings > API keys).'
      );
    },
    response: type({ guided: 'boolean' }),
    next: 'configure',
  })

  .step('configure', {
    prompt: act.askUser({
      type: 'structured',
      question: 'What would you like to configure?',
      options: [
        { value: 'locales', label: 'Locales', description: 'Set up content localization' },
        { value: 'webhooks', label: 'Webhooks', description: 'Configure event notifications' },
        { value: 'done', label: 'Done', description: 'Finish setup' },
      ],
    }),
    response: type({ choice: "'locales' | 'webhooks' | 'done'" }),
    next: ({ response }) => {
      if (response.choice === 'done') return 'summary';
      return `setup-${response.choice}`;
    },
  })

  .step('setup-locales', {
    prompt: 'Help the user configure locales for their space. Ask which languages they need.',
    response: type({ localesAdded: 'number' }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('setup-webhooks', {
    prompt: 'Help the user set up webhooks. Ask for the endpoint URL and which events to subscribe to.',
    response: type({ webhooksConfigured: 'number' }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('summary', {
    prompt: 'Summarize everything that was configured. List next steps.',
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })
  .build();
