import { skill, z, askUser } from '@contentful/skill-kit';

export default skill({
  name: 'setup',
  version: '1.0.0',
  description: 'Guided Contentful space setup and configuration.',
  entry: 'check-env',
  stash: z.object({ hasToken: z.boolean() }),
})
  .step('check-env', {
    prompt: 'Check if Contentful environment variables are set (CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN).',
    output: z.object({ hasSpaceId: z.boolean(), hasToken: z.boolean() }),
    stash: ({ output }) => ({ hasToken: output.hasToken }),
    next: ({ output }) => (output.hasSpaceId && output.hasToken ? 'configure' : 'guide-env'),
  })

  .step('guide-env', {
    prompt: ({ stash }) => {
      const missing: string[] = [];
      if (!stash.hasToken) missing.push('CONTENTFUL_ACCESS_TOKEN');
      return `Guide the user to set up: ${missing.join(', ')}. Explain where to find these values in the Contentful web app.`;
    },
    output: z.object({ guided: z.boolean() }),
    next: 'configure',
  })

  .step('configure', {
    ask: askUser({
      type: 'structured',
      question: 'What would you like to configure?',
      options: [
        { value: 'locales', label: 'Locales', description: 'Set up content localization' },
        { value: 'webhooks', label: 'Webhooks', description: 'Configure event notifications' },
        { value: 'done', label: 'Done', description: 'Finish setup' },
      ],
    }),
    output: z.object({ choice: z.enum(['locales', 'webhooks', 'done']) }),
    next: ({ output }) => {
      if (output.choice === 'done') return 'summary';
      return `setup-${output.choice}`;
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
