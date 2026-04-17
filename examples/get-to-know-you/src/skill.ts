import { skill, step, z, action, fragment, prompt, render, askUser } from '../../../src/index.js';

// --- Fragments ---

const playfulTone = fragment(
  'playful-tone',
  `Keep it light and fun. Use casual language. Throw in the occasional
   joke or pun if it fits. You're a friendly interviewer, not a form.`,
);

// --- Schemas ---

const ProfileSchema = z.object({
  name: z.string(),
  role: z.string(),
  specialty: z.string(),
  hobbies: z.array(z.string()),
  funFact: z.string(),
});

const ContextSchema = z.object({
  greeting: z.string().default('Hey there!'),
});

const StashSchema = z.object({
  name: z.string(),
  role: z.string(),
  latestHobby: z.string(),
});

type Context = z.infer<typeof ContextSchema>;
type Stash = z.infer<typeof StashSchema>;

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

const answerOutput = z.object({ answer: z.string() });

const openQuestion = step<typeof answerOutput, Context, Stash>({
  prompt: '__override_me__',
  output: answerOutput,
  next: '__parent__',
});

// --- Skill ---

export default skill({
  name: 'get-to-know-you',
  version: '1.0.0',
  description:
    'A playful interview that gets to know the user and produces a profile trading card. ' +
    'Use when the user wants to introduce themselves or when you want to break the ice.',
  entry: 'greet',

  context: ContextSchema,
  stash: StashSchema,

  finalOutput: z.object({
    card: z.string(),
    profile: ProfileSchema,
  }),

  observers: {
    onTransition: ({ from, to }) => {
      process.stderr.write(`[get-to-know-you] ${from} → ${to}\n`);
    },
  },

  steps: {
    greet: step({
      prompt: ({ context }: { context: Context }) =>
        prompt`
          ${playfulTone}

          ${context.greeting} You're about to interview the user
          to build their developer trading card. Start by asking their name. Be warm and
          enthusiastic — first impressions matter!
        `,
      output: z.object({ name: z.string() }),
      stash: ({ output }) => ({ name: output.name }),
      next: 'ask-role',
      maxVisits: 1,
      onMaxVisits: 'ask-role',
    }),

    'ask-role': step({
      ask: askUser({
        question: "What's your primary role?",
        options: [
          { value: 'dev', label: 'Developer', description: 'I write code for a living' },
          { value: 'designer', label: 'Designer', description: 'I make things pretty and usable' },
          { value: 'manager', label: 'Manager', description: 'I herd cats professionally' },
          { value: 'other', label: 'Something else', description: "I defy your categories" },
        ],
      }),
      output: z.object({ role: z.enum(['dev', 'designer', 'manager', 'other']) }),
      stash: ({ output }) => ({ role: output.role }),
      next: ({ output }) => {
        switch (output.role) {
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
      maxVisits: 1,
      onMaxVisits: 'ask-hobby',
    }),

    'ask-stack': openQuestion.extend({
      prompt: ({ stash }: { stash: Stash }) =>
        prompt`
          ${playfulTone}

          ${stash.name} is a developer — nice!
          Ask what their go-to tech stack is. Languages, frameworks, the works.
          Get specific — "JavaScript" is boring, "TypeScript + Bun + Zod" is a personality.
        `,
      next: 'ask-hobby',
      maxVisits: 1,
      onMaxVisits: 'ask-hobby',
    }),

    'ask-tools': openQuestion.extend({
      prompt: () =>
        prompt`
          ${playfulTone}

          A designer! Ask what tools they live in. Figma? Sketch? CSS-in-the-raw?
          Bonus points if you can get them to admit to a guilty-pleasure tool.
        `,
      next: 'ask-hobby',
      maxVisits: 1,
      onMaxVisits: 'ask-hobby',
    }),

    'ask-team-size': openQuestion.extend({
      prompt: () =>
        prompt`
          ${playfulTone}

          A manager! Ask about their team — how big, what they work on, and
          what's the weirdest thing that's happened in a standup.
        `,
      next: 'ask-hobby',
      maxVisits: 1,
      onMaxVisits: 'ask-hobby',
    }),

    'ask-specialty': openQuestion.extend({
      prompt: () =>
        prompt`
          ${playfulTone}

          Someone who defies categories — intriguing. Ask them to describe
          what they do in exactly one sentence. Dare them to make it interesting.
        `,
      next: 'ask-hobby',
      maxVisits: 1,
      onMaxVisits: 'ask-hobby',
    }),

    'ask-hobby': step({
      prompt: ({ attempts }) =>
        prompt`
          ${playfulTone}

          ${attempts === 0 ? "Now for the important stuff. Ask about hobbies, side projects, or weird talents. The stuff that doesn't go on a résumé." : "Nice! Ask if they have another hobby or interest they want on their card. (Or they can say they're done.)"}
        `,
      output: z.object({
        hobby: z.string(),
        wantsMore: z.boolean(),
      }),
      stash: ({ output }) => ({ latestHobby: output.hobby }),
      maxVisits: 2,
      onMaxVisits: 'confirm-profile',
      next: ({ output }) => (output.wantsMore ? 'ask-hobby' : 'confirm-profile'),
    }),

    'confirm-profile': step({
      confirm: {
        kind: 'confirm',
        message: "Got enough for a great trading card! Ready to see it, or want to add one more hobby?",
        destructive: false,
        defaultAnswer: 'yes',
      },
      output: z.object({ approved: z.boolean() }),
      next: ({ output }) => (output.approved ? 'profile-card' : 'ask-hobby'),
      maxVisits: 3,
      onMaxVisits: 'profile-card',
    }),

    'profile-card': step({
      prompt: ({ rendered }) =>
        prompt`
          Output the following profile card to the user exactly as shown,
          with no preamble or trailing commentary:

          ${rendered ?? ''}
        `,
      output: z.object({
        card: z.string(),
        profile: ProfileSchema,
      }),
      render: ({ history, refs, stash }: { history: readonly { step: string; output: unknown }[]; refs: { load(f: string): string }; stash: Stash }) => {
        const name = stash.name ?? 'Mystery Person';
        const role = stash.role ?? 'Enigma';

        const specialtyStep = history.find(
          (s) =>
            s.step === 'ask-stack' ||
            s.step === 'ask-tools' ||
            s.step === 'ask-team-size' ||
            s.step === 'ask-specialty',
        );
        const specialty = (specialtyStep?.output as { answer: string })?.answer ?? 'Classified';

        const hobbies = history
          .filter((s) => s.step === 'ask-hobby')
          .map((s) => (s.output as { hobby: string }).hobby);

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

        return card;
      },
      action: writeProfile,
      next: { terminal: true },
    }),
  },
});
