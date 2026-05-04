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
  stores: {
    env: type({ ready: 'boolean', missing: 'string[]' }),
    config: type({
      localesAdded: 'number',
      webhooksConfigured: 'number',
    }),
  },
})
  .step('check-env', {
    action: { run: checkEnv },
    save: ({ actionResult }) => ({
      step: {
        ready: actionResult.hasSpaceId && actionResult.hasToken,
        missing: [
          ...(!actionResult.hasSpaceId ? ['CONTENTFUL_SPACE_ID'] : []),
          ...(!actionResult.hasToken ? ['CONTENTFUL_ACCESS_TOKEN'] : []),
        ],
      },
      env: {
        ready: actionResult.hasSpaceId && actionResult.hasToken,
        missing: [
          ...(!actionResult.hasSpaceId ? ['CONTENTFUL_SPACE_ID'] : []),
          ...(!actionResult.hasToken ? ['CONTENTFUL_ACCESS_TOKEN'] : []),
        ],
      },
    }),
    next: [
      { to: 'configure', when: ({ actionResult }) => actionResult.hasSpaceId && actionResult.hasToken },
      { to: 'guide-env' },
    ],
  })

  .step('guide-env', {
    prompt: ({ store }) => {
      // env.missing is guaranteed — check-env always runs before guide-env (linear predecessor)
      const missing: readonly string[] = store.env.missing;
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
    prompt: ({ store }) => {
      // env.ready is guaranteed — check-env is on all paths to configure
      const ready: boolean = store.env.ready;
      return [
        act.askUser({
          type: 'structured',
          question: ready ? 'What would you like to configure?' : 'Environment configured. What next?',
          options: [
            { value: 'locales', label: 'Locales', description: 'Set up content localization' },
            { value: 'webhooks', label: 'Webhooks', description: 'Configure event notifications' },
            { value: 'done', label: 'Done', description: 'Finish setup' },
          ],
        }),
      ];
    },
    response: type({ choice: "'locales' | 'webhooks' | 'done'" }),
    next: [
      { to: 'setup-locales', when: ({ response }) => response.choice === 'locales' },
      { to: 'setup-webhooks', when: ({ response }) => response.choice === 'webhooks' },
      { to: 'summary' },
    ],
  })

  .step('setup-locales', {
    prompt: 'Help the user configure locales for their space. Ask which languages they need.',
    response: type({ localesAdded: 'number' }),
    save: ({ response }) => ({
      config: { localesAdded: response.localesAdded },
    }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('setup-webhooks', {
    prompt: 'Help the user set up webhooks. Ask for the endpoint URL and which events to subscribe to.',
    response: type({ webhooksConfigured: 'number' }),
    save: ({ response }) => ({
      config: { webhooksConfigured: response.webhooksConfigured },
    }),
    next: 'configure',
    maxVisits: 3,
    onMaxVisits: 'summary',
  })

  .step('summary', {
    prompt: ({ store }) => {
      // env is guaranteed (check-env is on all paths)
      const envReady: boolean = store.env.ready;
      // config is optional (setup-locales/setup-webhooks are branch targets)
      const locales = store.config?.localesAdded ?? 0;
      const webhooks = store.config?.webhooksConfigured ?? 0;
      return `Environment ${envReady ? 'ready' : 'needs setup'}. ${locales} locale(s), ${webhooks} webhook(s) configured.`;
    },
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })
  .build();
