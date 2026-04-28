import { skill, step, z, action, prompt, render, act, view } from '@contentful/skill-kit';

// --- Schemas ---

const ProfileSchema = z.object({
  name: z.string(),
  role: z.string(),
  specialty: z.string(),
  hobbies: z.array(z.string()),
  funFact: z.string(),
});

// --- Action: write profile to disk ---

const writeProfile = action({
  name: 'write-profile',
  input: z.object({ profile: ProfileSchema }),
  output: z.object({ path: z.string() }),
  run: async ({ input }) => {
    const path = `/tmp/profile-${Date.now()}.json`;
    process.stderr.write(`[get-to-know-you] Would write profile to ${path}\n`);
    void input;
    return { path };
  },
});

// --- Reusable open-ended question step ---

const openQuestionStep = step({
  output: z.object({ answer: z.string() }),
  next: '__parent__',
});

// --- Skill ---

export default skill({
  name: 'get-to-know-you',
  version: '1.0.0',
  description:
    'A playful interview that gets to know the user and produces a profile trading card. ' +
    'Use when the user wants to introduce themselves or when you want to break the ice.',
  triggers: ['introduce myself', 'trading card', 'get to know me', 'ice breaker'],
  entry: 'greet',
  system:
    "Keep it light and fun. Use casual language. Throw in the occasional joke or pun if it fits. You're a friendly interviewer, not a form.",

  params: z.object({
    greeting: z.string().default('Hey there!'),
  }),

  stash: z.object({
    name: z.string(),
    role: z.string(),
    latestHobby: z.string(),
  }),

  finalOutput: z.object({
    card: z.string(),
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
    output: z.object({ name: z.string() }),
    updateStash: ({ stepOutput }) => ({ name: stepOutput.name }),
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
    output: z.object({ role: z.enum(['dev', 'designer', 'manager', 'other']) }),
    updateStash: ({ stepOutput }) => ({ role: stepOutput.role }),
    next: ({ stepOutput }) => {
      switch (stepOutput.role) {
        case 'dev':
          return 'ask-stack';
        case 'designer':
          return 'ask-tools';
        case 'manager':
          return 'ask-team-size';
        default:
          return 'ask-specialty';
      }
    },
  })

  .extend('ask-stack', openQuestionStep, {
    prompt: ({ stash }) => [
      prompt`
        ${stash.name} is a developer — nice!
        Ask what their go-to tech stack is. Get specific — "JavaScript" is boring,
        "TypeScript + Bun + Zod" is a personality.
      `,
      act.askUser({ type: 'open', question: "What's your go-to tech stack?" }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-tools', openQuestionStep, {
    prompt: [
      'A designer! Ask what tools they live in. Figma? Sketch? CSS-in-the-raw?',
      act.askUser({ type: 'open', question: 'What design tools do you live in?' }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-team-size', openQuestionStep, {
    prompt: [
      'A manager! Ask about their team — how big, what they work on.',
      act.askUser({ type: 'open', question: 'Tell me about your team.' }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-specialty', openQuestionStep, {
    prompt: [
      'Someone who defies categories — intriguing. Dare them to describe what they do in one sentence.',
      act.askUser({ type: 'open', question: 'Describe what you do in one sentence.' }),
    ],
    next: 'ask-hobby',
  })

  .step('ask-hobby', {
    prompt: ({ attempts }) => [
      attempts === 0
        ? 'Now for the important stuff. Ask about hobbies, side projects, or weird talents.'
        : 'Ask if they have another hobby they want on their card, or if they are done.',
      act.askUser({ type: 'open', question: 'What are your hobbies or side projects?' }),
    ],
    output: z.object({
      hobby: z.string(),
      wantsMore: z.boolean(),
    }),
    updateStash: ({ stepOutput }) => ({ latestHobby: stepOutput.hobby }),
    maxVisits: 2,
    onMaxVisits: 'confirm-profile',
    next: ({ stepOutput }) => (stepOutput.wantsMore ? 'ask-hobby' : 'confirm-profile'),
  })

  .step('confirm-profile', {
    prompt: act.confirm({
      message: 'Got enough for a great trading card! Ready to see it, or want to add one more hobby?',
      defaultAnswer: 'yes',
    }),
    output: z.object({ approved: z.boolean() }),
    next: ({ stepOutput }) => (stepOutput.approved ? 'profile-card' : 'ask-hobby'),
    maxVisits: 3,
    onMaxVisits: 'profile-card',
  })

  .step('profile-card', {
    prompt: ({ history, getStep, refs, stash }) => {
      const name = stash.name ?? 'Mystery Person';
      const role = stash.role ?? 'Enigma';

      const specialty =
        getStep('ask-stack')?.stepOutput.answer ??
        getStep('ask-tools')?.stepOutput.answer ??
        getStep('ask-team-size')?.stepOutput.answer ??
        getStep('ask-specialty')?.stepOutput.answer ??
        'Classified';

      const hobbies = history
        .filter((s) => s.step === 'ask-hobby')
        .map((s) => (s.stepOutput as { hobby: string }).hobby);

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
    output: z.object({
      card: z.string(),
      profile: ProfileSchema,
    }),
    action: { run: writeProfile },
    next: { terminal: true },
  })

  .build();
