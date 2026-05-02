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

// --- Reusable open question step ---

const openQuestionStep = step({
  response: type({ answer: 'string' }),
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

  stash: type({
    name: 'string',
    variant: 'string',
    renderer: 'string',
    researchSummary: 'string',
    readme: 'string',
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
    updateStash: ({ response }) => ({ variant: response.variant }),
    next: 'name-game',
  })

  // --- Name the game (askUser open) ---
  .step('name-game', {
    prompt: act.askUser({ type: 'open', question: 'What should we call your game?' }),
    response: type({ name: 'string' }),
    updateStash: ({ response }) => ({ name: response.name }),
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
    updateStash: ({ response }) => ({ renderer: response.renderer }),
    next: 'design-review',
  })

  // --- Design review (confirm) ---
  .step('design-review', {
    prompt: ({ stash }) => [
      act.confirm({
        message: 'Design choices are locked in. Ready to start planning the build?',
        defaultAnswer: 'yes',
      }),
      prompt`Summarize the design so far: a ${stash.variant} Tetris game called "${stash.name}" using ${stash.renderer} rendering.`,
    ],
    response: type({ approved: 'boolean' }),
    next: ({ response }) => (response.approved ? 'research-renderer' : 'choose-variant'),
  })

  // --- Research renderer (subagent) ---
  .step('research-renderer', {
    prompt: ({ stash, refs }) => [
      act.subagent({
        prompt:
          'Research best practices for the chosen rendering approach. Cover performance tips, animation patterns, and common pitfalls. Return a concise summary.',
        output: type({ summary: 'string' }),
      }),
      prompt`
        We're building a Tetris game with ${stash.renderer} rendering.
        Reference material:
        ${refs.load('tetris-patterns.md')}
      `,
    ],
    response: type({ summary: 'string' }),
    updateStash: ({ response }) => ({ researchSummary: response.summary }),
    next: 'implementation-plan',
  })

  // --- Implementation plan (act.plan — dynamic from stash) ---
  .step('implementation-plan', {
    prompt: ({ stash, act }) => [
      act.plan({
        summary: `Build "${stash.name}" — a ${stash.variant} Tetris game with ${stash.renderer} rendering`,
        steps: [
          'Set up the game board data structure (10×20 grid)',
          'Implement the piece system with all 7 tetrominoes',
          'Add keyboard controls (move, rotate, drop)',
          'Build the scoring and level system',
          `Create the ${stash.renderer} renderer and game loop`,
          'Add theme and visual polish',
        ],
      }),
      prompt`Research notes: ${stash.researchSummary}`,
    ],
    response: type({ approved: 'boolean', 'modifications?': 'string' }),
    next: ({ response }) => (response.approved ? 'build' : 'revise-plan'),
  })

  // --- Revise plan (askUser open, loops back) ---
  .extend('revise-plan', openQuestionStep, {
    prompt: act.askUser({ type: 'open', question: 'What should we change about the plan?' }),
    next: 'implementation-plan',
  })

  // --- Build (checklist + work in one step via array composition) ---
  .step('build', {
    prompt: ({ stash, act, system }) => [
      system`Be methodical — complete each checklist item before moving to the next.`,

      act.checklist({
        create: [
          { title: 'Board data structure', status: 'pending' },
          { title: 'Piece system (7 tetrominoes)', status: 'pending' },
          { title: 'Keyboard controls', status: 'pending' },
          { title: 'Scoring and levels', status: 'pending' },
          { title: `${stash.renderer} renderer and game loop`, status: 'pending' },
          { title: 'Visual polish', status: 'pending' },
        ],
      }),

      prompt`
        Build the ${stash.variant} Tetris game "${stash.name}" using ${stash.renderer} rendering.
        Create the game files. Update each checklist item as you complete it.
        Research notes: ${stash.researchSummary}
      `,
    ],
    response: type({ filesCreated: 'string[]', summary: 'string' }),
    next: 'generate-readme',
  })

  // --- Generate README (subagent) ---
  .step('generate-readme', {
    prompt: ({ stash }) => [
      act.subagent({
        prompt:
          'Write a README.md for the game. Include: project title, description, controls, how to run, and credits. Return the markdown as a string.',
        output: type({ readme: 'string' }),
      }),
      prompt`
        The game "${stash.name}" is a ${stash.variant}-style Tetris using ${stash.renderer} rendering.
      `,
    ],
    response: type({ readme: 'string' }),
    updateStash: ({ response }) => ({ readme: response.readme }),
    next: 'final-review',
  })

  // --- Final review (confirm) ---
  .step('final-review', {
    prompt: act.confirm({
      message: 'The game is built! Want to add any finishing touches?',
      defaultAnswer: 'no',
    }),
    response: type({ approved: 'boolean' }),
    next: ({ response }) => (response.approved ? 'polish' : 'summary'),
  })

  // --- Polish loop (askUser open, maxVisits) ---
  .extend('polish', openQuestionStep, {
    prompt: act.askUser({ type: 'open', question: 'What would you like to polish or change?' }),
    next: 'final-review',
    maxVisits: 2,
    onMaxVisits: 'summary',
  })

  // --- Summary card (terminal) ---
  .step('summary', {
    prompt: ({ stash }) => [
      view(
        render.section(
          'Game Jam Complete!',
          [
            render.kv({
              Game: stash.name,
              Variant: stash.variant,
              Renderer: stash.renderer,
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
    ],
    response: type({ summary: 'string' }),
    action: {
      run: saveGameConfig,
      input: ({ stash }) => ({
        config: {
          name: stash.name,
          variant: stash.variant,
          renderer: stash.renderer,
        },
      }),
    },
    next: { terminal: true },
  })

  .build();
