import { skill, z, action, act } from '@contentful/skill-kit';

const checkEnv = action({
  name: 'check-env',
  input: z.object({}),
  output: z.object({
    hasSpaceId: z.boolean(),
    hasToken: z.boolean(),
    spaceId: z.string().optional(),
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
  stash: z.object({ hasSpaceId: z.boolean(), hasToken: z.boolean() }),
})
  .step('check-env', {
    prompt: 'Acknowledge the environment check results and proceed.',
    output: z.object({ acknowledged: z.boolean() }),
    action: {
      run: checkEnv,
      updateStash: ({ actionOutput }) => ({
        hasSpaceId: actionOutput.hasSpaceId,
        hasToken: actionOutput.hasToken,
      }),
    },
    next: ({ actionOutput }) => (actionOutput.hasSpaceId && actionOutput.hasToken ? 'configure' : 'guide-env'),
  })

  .step('guide-env', {
    prompt: ({ stash }) => {
      const missing: string[] = [];
      if (!stash.hasSpaceId) missing.push('CONTENTFUL_SPACE_ID');
      if (!stash.hasToken) missing.push('CONTENTFUL_ACCESS_TOKEN');
      return (
        `The following environment variables are missing: ${missing.join(', ')}.\n\n` +
        'Guide the user to set them up. Explain where to find these values in the Contentful web app ' +
        '(Settings > API keys).'
      );
    },
    output: z.object({ guided: z.boolean() }),
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
    output: z.object({ choice: z.enum(['locales', 'webhooks', 'done']) }),
    next: ({ stepOutput }) => {
      if (stepOutput.choice === 'done') return 'summary';
      return `setup-${stepOutput.choice}`;
    },
  })

  .step('setup-locales', {
    prompt: 'Help the user configure locales for their space. Ask which languages they need.',
    output: z.object({ localesAdded: z.number() }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('setup-webhooks', {
    prompt: 'Help the user set up webhooks. Ask for the endpoint URL and which events to subscribe to.',
    output: z.object({ webhooksConfigured: z.number() }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('summary', {
    prompt: 'Summarize everything that was configured. List next steps.',
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })
  .build();
