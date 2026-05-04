import { skill, type, action, prompt, render, act, view } from '@contentful/skill-kit';

// --- Schemas ---

const ProfileSchema = type({
  name: 'string',
  role: 'string',
  specialty: 'string',
  hobbies: 'string[]',
  funFact: 'string',
});

// --- Action: write profile to disk ---

const writeProfile = action({
  name: 'write-profile',
  input: type({ profile: ProfileSchema }),
  output: type({ path: 'string' }),
  run: async ({ input }) => {
    const path = `/tmp/profile-${Date.now()}.json`;
    process.stderr.write(`[get-to-know-you] Would write profile to ${path}\n`);
    void input;
    return { path };
  },
});

// --- Skill ---

export default skill({
  name: 'get-to-know-you',
  version: '1.0.0',
  description:
    'A playful interview that gets to know the user and produces a profile trading card. ' +
    'Use when the user wants to introduce themselves or when you want to break the ice.',
  triggers: ['introduce myself', 'trading card', 'get to know me', 'ice breaker'],
  argumentHint: '[name]',
  entry: 'greet',
  system:
    "Keep it light and fun. Use casual language. Throw in the occasional joke or pun if it fits. You're a friendly interviewer, not a form.",

  params: type({
    greeting: 'string = "Hey there!"',
  }),

  finalOutput: type({
    card: 'string',
    profile: ProfileSchema,
  }),

  observers: {
    onTransition: ({ from, to }) => {
      process.stderr.write(`[get-to-know-you] ${from} → ${to}\n`);
    },
  },
})
  .step('greet', {
    prompt: ({ params }) => prompt`
      ${params.greeting} You're about to interview the user to build their developer trading card.
      Start by asking their name. Be warm and enthusiastic — first impressions matter!
    `,
    response: type({ name: 'string' }),
    next: 'ask-role',
  })

  .step('ask-role', {
    prompt: act.askUser({
      type: 'structured',
      question: "What's your primary role?",
      options: [
        { value: 'dev', label: 'Developer', description: 'I write code for a living' },
        { value: 'designer', label: 'Designer', description: 'I make things pretty and usable' },
        { value: 'manager', label: 'Manager', description: 'I herd cats professionally' },
        { value: 'other', label: 'Something else', description: 'I defy your categories' },
      ],
    }),
    response: type({ role: "'dev' | 'designer' | 'manager' | 'other'" }),
    next: [
      { to: 'ask-stack', when: ({ response }) => response.role === 'dev' },
      { to: 'ask-tools', when: ({ response }) => response.role === 'designer' },
      { to: 'ask-team-size', when: ({ response }) => response.role === 'manager' },
      { to: 'ask-specialty' },
    ],
  })

  .step('ask-stack', {
    prompt: ({ store }) => {
      const name = store.steps.greet.name;
      return [
        prompt`
          ${name} is a developer — nice!
          Ask what their go-to tech stack is. Get specific — "JavaScript" is boring,
          "TypeScript + Bun + Zod" is a personality.
        `,
        act.askUser({ type: 'open', question: "What's your go-to tech stack?" }),
      ];
    },
    response: type({ answer: 'string' }),
    next: 'ask-hobby',
  })

  .step('ask-tools', {
    prompt: [
      'A designer! Ask what tools they live in. Figma? Sketch? CSS-in-the-raw?',
      act.askUser({ type: 'open', question: 'What design tools do you live in?' }),
    ],
    response: type({ answer: 'string' }),
    next: 'ask-hobby',
  })

  .step('ask-team-size', {
    prompt: [
      'A manager! Ask about their team — how big, what they work on.',
      act.askUser({ type: 'open', question: 'Tell me about your team.' }),
    ],
    response: type({ answer: 'string' }),
    next: 'ask-hobby',
  })

  .step('ask-specialty', {
    prompt: [
      'Someone who defies categories — intriguing. Dare them to describe what they do in one sentence.',
      act.askUser({ type: 'open', question: 'Describe what you do in one sentence.' }),
    ],
    response: type({ answer: 'string' }),
    next: 'ask-hobby',
  })

  .step('ask-hobby', {
    prompt: ({ attempts }) => [
      attempts === 0
        ? 'Now for the important stuff. Ask about hobbies, side projects, or weird talents.'
        : 'Ask if they have another hobby they want on their card, or if they are done.',
      act.askUser({ type: 'open', question: 'What are your hobbies or side projects?' }),
    ],
    response: type({
      hobby: 'string',
      wantsMore: 'boolean',
    }),
    maxVisits: 2,
    onMaxVisits: 'confirm-profile',
    next: [{ to: 'ask-hobby', when: ({ response }) => response.wantsMore }, { to: 'confirm-profile' }],
  })

  .step('confirm-profile', {
    prompt: act.confirm({
      message: 'Got enough for a great trading card! Ready to see it, or want to add one more hobby?',
      defaultAnswer: 'yes',
    }),
    response: type({ approved: 'boolean' }),
    next: [{ to: 'profile-card', when: ({ response }) => response.approved }, { to: 'ask-hobby' }],
    maxVisits: 3,
    onMaxVisits: 'profile-card',
  })

  .step('profile-card', {
    prompt: ({ store, refs }) => {
      const name = store.steps.greet.name;
      const role = store.steps['ask-role'].role;

      const specialty =
        store.steps['ask-stack']?.answer ??
        store.steps['ask-tools']?.answer ??
        store.steps['ask-team-size']?.answer ??
        store.steps['ask-specialty']?.answer ??
        'Classified';

      const hobbies = store.steps.all('ask-hobby').map((v) => v.hobby);

      let funFact = '';
      try {
        const facts = refs.load('fun-facts.md');
        const lines = facts.split('\n').filter((l) => l.startsWith('- '));
        funFact = lines[Math.floor(Math.random() * lines.length)] ?? '';
        funFact = funFact.replace(/^- /, '');
      } catch {
        funFact = 'Fun facts are overrated anyway.';
      }

      const roleLabels: Record<string, string> = {
        dev: '💻 Developer',
        designer: '🎨 Designer',
        manager: '📋 Manager',
        other: '✨ Wildcard',
      };

      const stats = render.kv({
        Name: name,
        Role: roleLabels[role] ?? role,
        Specialty: specialty,
      });

      const hobbyList = render.checklist(hobbies.map((h) => ({ text: h, done: true })));

      const card = [
        render.section(`🃏 ${name}'s Trading Card`, stats),
        '',
        render.section('🎯 Hobbies & Interests', hobbyList || '(none listed)'),
        '',
        `> *${funFact}*`,
      ].join('\n');

      return [view(card), 'Present the rendered trading card verbatim.'];
    },
    response: type({
      card: 'string',
      profile: ProfileSchema,
    }),
    action: { run: writeProfile },
    next: { terminal: true },
  })

  .build();
