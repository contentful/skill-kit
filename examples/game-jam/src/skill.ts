import { skill, step, z, action, fragment, prompt, render, act } from '@contentful/skill-kit';

// --- Fragments ---

const gameMasterTone = fragment(
  'game-master-tone',
  `You're a friendly game development mentor guiding someone through
   building their first Tetris game. Be encouraging and practical.`,
);

// --- Schemas ---

const GameConfigSchema = z.object({
  name: z.string(),
  variant: z.enum(['classic', 'modern', 'puzzle']),
  renderer: z.enum(['canvas', 'dom', 'webgl']),
});

// --- Action: save game config ---

const saveGameConfig = action({
  name: 'save-game-config',
  input: z.object({ config: GameConfigSchema }),
  output: z.object({ path: z.string() }),
  run: async ({ input }) => {
    const path = `/tmp/game-config-${Date.now()}.json`;
    process.stderr.write(`[game-jam] Would save config to ${path}\n`);
    void input;
    return { path };
  },
});

// --- Reusable open question step ---

const openQuestionStep = step({
  output: z.object({ answer: z.string() }),
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
  entry: 'welcome',

  context: z.object({
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  }),

  stash: z.object({
    name: z.string(),
    variant: z.string(),
    renderer: z.string(),
    researchSummary: z.string(),
    themeCss: z.string(),
  }),
})
  // --- Step 1: Welcome ---
  .step('welcome', {
    prompt: ({ context }) =>
      prompt`${gameMasterTone} Welcome the user to the game jam! They're at ${context.difficulty} level. Ask them what kind of Tetris game they want to build.`,
    output: z.object({ excited: z.boolean() }),
    next: 'choose-variant',
  })

  // --- Step 2: Choose variant (askUser structured) ---
  .step('choose-variant', {
    act: act.askUser({
      type: 'structured',
      question: 'What style of Tetris do you want to build?',
      options: [
        { value: 'classic', label: 'Classic', description: 'Traditional Tetris with standard rules and scoring' },
        { value: 'modern', label: 'Modern', description: 'Tetris with hold piece, ghost piece, and T-spins' },
        { value: 'puzzle', label: 'Puzzle', description: 'Pre-set board puzzles to clear in fewest moves' },
      ],
    }),
    output: z.object({ variant: z.enum(['classic', 'modern', 'puzzle']) }),
    stash: ({ output }) => ({ variant: output.variant }),
    next: 'name-game',
  })

  // --- Step 3: Name the game (askUser open) ---
  .step('name-game', {
    act: act.askUser({ type: 'open', question: 'What should we call your game?' }),
    prompt: prompt`${gameMasterTone} The user picked the variant already. Now get a creative name for their game.`,
    output: z.object({ name: z.string() }),
    stash: ({ output }) => ({ name: output.name }),
    next: 'choose-renderer',
  })

  // --- Step 4: Choose renderer (askUser structured) ---
  .step('choose-renderer', {
    act: act.askUser({
      type: 'structured',
      question: 'Which rendering approach do you want to use?',
      options: [
        { value: 'canvas', label: 'Canvas 2D', description: 'Best performance, draw colored rectangles' },
        { value: 'dom', label: 'DOM/CSS Grid', description: 'Easy to style, uses HTML elements' },
        { value: 'webgl', label: 'WebGL', description: 'Enables 3D effects and shaders, most complex' },
      ],
    }),
    output: z.object({ renderer: z.enum(['canvas', 'dom', 'webgl']) }),
    stash: ({ output }) => ({ renderer: output.renderer }),
    next: 'design-review',
  })

  // --- Step 5: Design review (confirm) ---
  .step('design-review', {
    act: act.confirm({
      message: 'Design choices are locked in. Ready to start planning the build?',
      destructive: false,
      defaultAnswer: 'yes',
    }),
    prompt: ({ stash }) =>
      prompt`${gameMasterTone} Summarize the design: a ${stash.variant} Tetris game called "${stash.name}" using ${stash.renderer} rendering. Ask if they're ready to proceed.`,
    output: z.object({ approved: z.boolean() }),
    next: ({ output }) => (output.approved ? 'research-renderer' : 'choose-variant'),
  })

  // --- Step 6: Research renderer (subagent) ---
  .step('research-renderer', {
    act: act.subagent({
      prompt:
        'Research best practices for the chosen rendering approach for a Tetris game. Cover performance tips, animation patterns, and common pitfalls. Return a concise summary.',
      output: z.object({ summary: z.string() }),
    }),
    prompt: ({ stash, refs }) =>
      prompt`${gameMasterTone} Research best practices for building a Tetris game with ${stash.renderer} rendering.

Reference material:
${refs.load('tetris-patterns.md')}

Return a focused summary of key implementation tips.`,
    output: z.object({ summary: z.string() }),
    stash: ({ output }) => ({ researchSummary: output.summary }),
    next: 'implementation-plan',
  })

  // --- Step 7: Implementation plan (act.plan — dynamic from stash) ---
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
      prompt`${gameMasterTone} Present the implementation plan. The research found: ${stash.researchSummary}`,
    ],
    output: z.object({ approved: z.boolean(), modifications: z.string().optional() }),
    next: ({ output }) => (output.approved ? 'build' : 'revise-plan'),
  })

  // --- Step 7b: Revise plan (askUser open, loops back) ---
  .extend('revise-plan', openQuestionStep, {
    act: act.askUser({ type: 'open', question: 'What should we change about the plan?' }),
    prompt: prompt`${gameMasterTone} The user wants to revise the plan. Ask what they'd like to change.`,
    next: 'implementation-plan',
  })

  // --- Step 8: Build (checklist + work in one step via array composition) ---
  .step('build', {
    prompt: ({ stash, act, system }) => [
      system`You are a game development mentor. Be methodical — complete each checklist item before moving to the next.`,

      act.checklist({
        create: [
          { title: 'Board data structure', status: 'pending' },
          { title: 'Piece system (7 tetrominoes)', status: 'pending' },
          { title: 'Keyboard controls', status: 'pending' },
          { title: 'Scoring and levels', status: 'pending' },
          { title: `${stash.renderer} renderer and game loop`, status: 'pending' },
          { title: 'Theme and polish', status: 'pending' },
        ],
      }),

      prompt`Build the ${stash.variant} Tetris game "${stash.name}" using ${stash.renderer} rendering.

Create the game files. Update each checklist item as you complete it.
Use the research: ${stash.researchSummary}`,
    ],
    output: z.object({ filesCreated: z.array(z.string()), summary: z.string() }),
    next: 'generate-theme',
  })

  // --- Step 10: Generate theme (subagent) ---
  .step('generate-theme', {
    act: act.subagent({
      prompt:
        'Generate a CSS theme for the game. Include color scheme, fonts, and animations. Return the CSS as a string.',
      output: z.object({ css: z.string() }),
    }),
    prompt: ({ stash }) =>
      prompt`${gameMasterTone} Generate a CSS theme for a ${stash.variant}-style Tetris game called "${stash.name}". Make it visually distinctive.`,
    output: z.object({ css: z.string() }),
    stash: ({ output }) => ({ themeCss: output.css }),
    next: 'final-review',
  })

  // --- Step 11: Final review (confirm) ---
  .step('final-review', {
    act: act.confirm({
      message: 'The game is built! Want to add any finishing touches?',
      destructive: false,
      defaultAnswer: 'no',
    }),
    output: z.object({ approved: z.boolean() }),
    next: ({ output }) => (output.approved ? 'polish' : 'summary'),
  })

  // --- Step 11b: Polish loop (askUser open, maxVisits) ---
  .extend('polish', openQuestionStep, {
    act: act.askUser({ type: 'open', question: 'What would you like to polish or change?' }),
    prompt: prompt`${gameMasterTone} The user wants to polish the game. Ask what they'd like to improve.`,
    next: 'final-review',
    maxVisits: 2,
    onMaxVisits: 'summary',
  })

  // --- Step 12: Summary card (terminal) ---
  .step('summary', {
    prompt: () => prompt`${gameMasterTone} Present the final game summary card.`,
    render: ({ stash }) =>
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
            { text: 'Theme and polish', done: true },
          ]),
        ].join('\n'),
      ),
    output: z.object({ summary: z.string() }),
    action: saveGameConfig,
    actionInput: ({ stash }) => ({
      config: {
        name: stash.name,
        variant: stash.variant,
        renderer: stash.renderer,
      },
    }),
    next: { terminal: true },
  })

  .build();
