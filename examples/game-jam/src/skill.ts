import { skill, step, type, action, prompt, render, act, view } from '@contentful/skill-kit';

// --- Schemas ---

const GameConfigSchema = type({
  name: 'string',
  variant: "'classic' | 'modern' | 'puzzle'",
  renderer: "'canvas' | 'dom' | 'webgl'",
});

// --- Action: save game config ---

const saveGameConfig = action({
  name: 'save-game-config',
  input: type({ config: GameConfigSchema }),
  output: type({ path: 'string' }),
  run: async ({ input }) => {
    const path = `/tmp/game-config-${Date.now()}.json`;
    process.stderr.write(`[game-jam] Would save config to ${path}\n`);
    void input;
    return { path };
  },
});

// --- Reusable approval gate ---

const approvalGate = step({
  prompt: act.confirm({ message: 'Continue?', defaultAnswer: 'yes' }),
  response: type({ approved: 'boolean' }),
  next: '__parent__',
});

// --- Skill ---

export default skill({
  name: 'game-jam',
  version: '1.0.0',
  description:
    'A guided game creation skill that walks you through designing, planning, and building a browser-based Tetris game. ' +
    'Demonstrates all SDK primitives: askUser, confirm, plan, checklist, and subagent.',
  triggers: ['game jam', 'build a game', 'tetris', 'game tutorial'],
  argumentHint: '[game-type]',
  compatibility: 'Requires a modern browser for the game preview',
  entry: 'choose-variant',
  system:
    "You're a friendly game development mentor guiding someone through building their first Tetris game. Be encouraging and practical.",

  params: type({
    difficulty: "'beginner' | 'intermediate' | 'advanced' = 'intermediate'",
  }),
})
  // --- Choose variant (askUser structured) ---
  .step('choose-variant', {
    prompt: act.askUser({
      type: 'structured',
      question: 'What style of Tetris do you want to build?',
      options: [
        { value: 'classic', label: 'Classic', description: 'Traditional Tetris with standard rules and scoring' },
        { value: 'modern', label: 'Modern', description: 'Tetris with hold piece, ghost piece, and T-spins' },
        { value: 'puzzle', label: 'Puzzle', description: 'Pre-set board puzzles to clear in fewest moves' },
      ],
    }),
    response: type({ variant: "'classic' | 'modern' | 'puzzle'" }),
    next: 'name-game',
  })

  // --- Name the game (askUser open) ---
  .step('name-game', {
    prompt: act.askUser({ type: 'open', question: 'What should we call your game?' }),
    response: type({ name: 'string' }),
    next: 'choose-renderer',
  })

  // --- Choose renderer (askUser structured) ---
  .step('choose-renderer', {
    prompt: act.askUser({
      type: 'structured',
      question: 'Which rendering approach do you want to use?',
      options: [
        { value: 'canvas', label: 'Canvas 2D', description: 'Best performance, draw colored rectangles' },
        { value: 'dom', label: 'DOM/CSS Grid', description: 'Easy to style, uses HTML elements' },
        { value: 'webgl', label: 'WebGL', description: 'Enables 3D effects and shaders, most complex' },
      ],
    }),
    response: type({ renderer: "'canvas' | 'dom' | 'webgl'" }),
    next: 'design-review',
  })

  // --- Design review (confirm) ---
  .step('design-review', {
    prompt: ({ store }) => {
      const variant = store.steps['choose-variant'].variant;
      const name = store.steps['name-game'].name;
      const renderer = store.steps['choose-renderer'].renderer;
      return [
        act.confirm({
          message: 'Design choices are locked in. Ready to start planning the build?',
          defaultAnswer: 'yes',
        }),
        prompt`Summarize the design so far: a ${variant} Tetris game called "${name}" using ${renderer} rendering.`,
      ];
    },
    response: type({ approved: 'boolean' }),
    next: [{ to: 'research-renderer', when: ({ response }) => response.approved }, { to: 'choose-variant' }],
  })

  // --- Research renderer (subagent) ---
  .step('research-renderer', {
    prompt: ({ store, refs }) => {
      const renderer = store.steps['choose-renderer'].renderer;
      return [
        act.subagent({
          prompt:
            'Research best practices for the chosen rendering approach. Cover performance tips, animation patterns, and common pitfalls. Return a concise summary.',
          output: type({ summary: 'string' }),
        }),
        prompt`
          We're building a Tetris game with ${renderer} rendering.
          Reference material:
          ${refs.load('tetris-patterns.md')}
        `,
      ];
    },
    response: type({ summary: 'string' }),
    next: 'implementation-plan',
  })

  // --- Implementation plan (act.plan — dynamic from store) ---
  .step('implementation-plan', {
    prompt: ({ store, act }) => {
      const name = store.steps['name-game'].name;
      const variant = store.steps['choose-variant'].variant;
      const renderer = store.steps['choose-renderer'].renderer;
      const researchSummary = store.steps['research-renderer']?.summary ?? '';
      return [
        act.plan({
          summary: `Build "${name}" — a ${variant} Tetris game with ${renderer} rendering`,
          steps: [
            'Set up the game board data structure (10×20 grid)',
            'Implement the piece system with all 7 tetrominoes',
            'Add keyboard controls (move, rotate, drop)',
            'Build the scoring and level system',
            `Create the ${renderer} renderer and game loop`,
            'Add theme and visual polish',
          ],
        }),
        prompt`Research notes: ${researchSummary}`,
      ];
    },
    response: type({ approved: 'boolean', 'modifications?': 'string' }),
    next: [{ to: 'build', when: ({ response }) => response.approved }, { to: 'revise-plan' }],
  })

  // --- Revise plan (askUser open, loops back) ---
  .step('revise-plan', {
    prompt: act.askUser({ type: 'open', question: 'What should we change about the plan?' }),
    response: type({ answer: 'string' }),
    next: 'implementation-plan',
  })

  // --- Build (checklist + work in one step via array composition) ---
  .step('build', {
    prompt: ({ store, act, system }) => {
      const variant = store.steps['choose-variant'].variant;
      const name = store.steps['name-game'].name;
      const renderer = store.steps['choose-renderer'].renderer;
      const researchSummary = store.steps['research-renderer']?.summary ?? '';
      return [
        system`Be methodical — complete each checklist item before moving to the next.`,

        act.checklist({
          create: [
            { title: 'Board data structure', status: 'pending' },
            { title: 'Piece system (7 tetrominoes)', status: 'pending' },
            { title: 'Keyboard controls', status: 'pending' },
            { title: 'Scoring and levels', status: 'pending' },
            { title: `${renderer} renderer and game loop`, status: 'pending' },
            { title: 'Visual polish', status: 'pending' },
          ],
        }),

        prompt`
          Build the ${variant} Tetris game "${name}" using ${renderer} rendering.
          Create the game files. Update each checklist item as you complete it.
          Research notes: ${researchSummary}
        `,
      ];
    },
    response: type({ filesCreated: 'string[]', summary: 'string' }),
    next: 'generate-readme',
  })

  // --- Generate README (subagent) ---
  .step('generate-readme', {
    prompt: ({ store }) => {
      const name = store.steps['name-game'].name;
      const variant = store.steps['choose-variant'].variant;
      const renderer = store.steps['choose-renderer'].renderer;
      return [
        act.subagent({
          prompt:
            'Write a README.md for the game. Include: project title, description, controls, how to run, and credits. Return the markdown as a string.',
          output: type({ readme: 'string' }),
        }),
        prompt`
          The game "${name}" is a ${variant}-style Tetris using ${renderer} rendering.
        `,
      ];
    },
    response: type({ readme: 'string' }),
    next: 'final-review',
  })

  // --- Final review (reusable approval gate with custom message + routing) ---
  .extend('final-review', approvalGate, {
    prompt: act.confirm({
      message: 'The game is built! Want to add any finishing touches?',
      defaultAnswer: 'no',
    }),
    next: [{ to: 'polish', when: ({ response }) => response.approved }, { to: 'summary' }],
  })

  // --- Polish loop (askUser open, maxVisits) ---
  .step('polish', {
    prompt: act.askUser({ type: 'open', question: 'What would you like to polish or change?' }),
    response: type({ answer: 'string' }),
    next: 'final-review',
    maxVisits: 2,
    onMaxVisits: 'summary',
  })

  // --- Summary card (terminal) ---
  .step('summary', {
    prompt: ({ store }) => {
      const name = store.steps['name-game'].name;
      const variant = store.steps['choose-variant'].variant;
      const renderer = store.steps['choose-renderer'].renderer;
      return [
        view(
          render.section(
            'Game Jam Complete!',
            [
              render.kv({
                Game: name,
                Variant: variant,
                Renderer: renderer,
              }),
              '',
              render.checklist([
                { text: 'Board data structure', done: true },
                { text: 'Piece system', done: true },
                { text: 'Keyboard controls', done: true },
                { text: 'Scoring and levels', done: true },
                { text: 'Renderer and game loop', done: true },
                { text: 'README', done: true },
              ]),
            ].join('\n'),
          ),
        ),
        'Present the rendered summary card verbatim.',
      ];
    },
    response: type({ summary: 'string' }),
    action: {
      run: saveGameConfig,
      input: ({ store }) => ({
        config: {
          name: store.steps['name-game']?.name ?? '',
          variant: store.steps['choose-variant']?.variant ?? 'classic',
          renderer: store.steps['choose-renderer']?.renderer ?? 'canvas',
        },
      }),
    },
    next: { terminal: true },
  })

  .build();
