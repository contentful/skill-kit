import { skill, type, action, prompt, render, act, view, terminal } from '@contentful/skill-kit';

// --- Action: save report to disk ---

const saveReport = action({
  name: 'save-report',
  input: type({ title: 'string', body: 'string' }),
  output: type({ path: 'string', bytes: 'number' }),
  run: async ({ input }) => {
    const path = `/tmp/report-${Date.now()}.md`;
    const bytes = Buffer.byteLength(`# ${input.title}\n\n${input.body}`);
    process.stderr.write(`[primitives-showcase] Would write ${bytes}B to ${path}\n`);
    return { path, bytes };
  },
});

// --- Skill: exercises every primitive + view + terminal + action ---

export default skill({
  name: 'primitives-showcase',
  version: '1.0.0',
  description: 'Exercises every SDK primitive in a single skill. Used as a reference and integration test.',
  argumentHint: '[theme]',
  entry: 'gather-preferences',
})
  // --- survey: batched multi-question ---
  .step('gather-preferences', {
    prompt: act.survey([
      {
        question: 'What theme should the report cover?',
        header: 'Theme',
        options: [
          { value: 'performance', label: 'Performance', description: 'Runtime speed and bundle size' },
          { value: 'security', label: 'Security', description: 'Vulnerabilities and best practices' },
          { value: 'accessibility', label: 'A11y', description: 'WCAG compliance and screen readers' },
        ],
      },
      {
        question: 'Which framework?',
        header: 'Framework',
        options: [
          { value: 'react', label: 'React' },
          { value: 'vue', label: 'Vue' },
          { value: 'svelte', label: 'Svelte' },
        ],
      },
    ]),
    response: type({ theme: 'string', framework: 'string' }),
    next: 'research',
  })

  // --- subagent: delegated research ---
  .step('research', {
    prompt: ({ store }) => {
      const theme = store.steps['gather-preferences']?.theme ?? '';
      const framework = store.steps['gather-preferences']?.framework ?? '';
      return [
        prompt`Research ${theme} best practices for ${framework} projects.`,
        act.subagent({
          prompt: `Find 3 key recommendations for ${theme} in ${framework}. Return a concise summary.`,
          output: type({ summary: 'string' }),
        }),
      ];
    },
    response: type({ summary: 'string' }),
    next: 'plan-report',
  })

  // --- plan: structured approval ---
  .step('plan-report', {
    prompt: ({ store }) => {
      const theme = store.steps['gather-preferences']?.theme ?? '';
      const framework = store.steps['gather-preferences']?.framework ?? '';
      return [
        prompt`Based on the research, plan the report structure.`,
        act.plan({
          summary: `${theme} report for ${framework}`,
          steps: ['Executive summary', 'Key findings', 'Recommendations', 'Action items'],
        }),
      ];
    },
    response: type({ approved: 'boolean', 'modifications?': 'string' }),
    next: [{ to: 'write-report', when: ({ response }) => response.approved }, { to: 'ask-changes' }],
  })

  // --- askUser (open): free-form feedback ---
  .step('ask-changes', {
    prompt: [
      'The plan was not approved. Ask what changes are needed.',
      act.askUser({ type: 'open', question: 'What would you like to change about the report plan?' }),
    ],
    response: type({ feedback: 'string' }),
    next: 'plan-report',
    maxVisits: 3,
    onMaxVisits: 'write-report',
  })

  // --- checklist: tracked work items ---
  .step('write-report', {
    prompt: ({ store, act, system }) => {
      const theme = store.steps['gather-preferences']?.theme ?? '';
      const framework = store.steps['gather-preferences']?.framework ?? '';
      const researchSummary = store.steps.research?.summary ?? '';
      return [
        system`Write concisely. Each section should be 2-3 sentences.`,
        act.checklist({
          create: [
            { title: 'Executive summary', status: 'pending' },
            { title: 'Key findings', status: 'pending' },
            { title: 'Recommendations', status: 'pending' },
            { title: 'Action items', status: 'pending' },
          ],
        }),
        prompt`
          Write the ${theme} report for ${framework}.
          Research summary: ${researchSummary}
          Complete each checklist item as you write.
        `,
      ];
    },
    response: type({ title: 'string', body: 'string' }),
    action: { run: saveReport },
    save: ({ response, actionResult }) => ({
      step: {
        title: response.title,
        path: actionResult.path,
        bytes: actionResult.bytes,
      },
    }),
    next: 'confirm-publish',
  })

  // --- confirm: yes/no gate ---
  .step('confirm-publish', {
    prompt: [
      'The report has been saved. Ask if the user wants to publish it.',
      act.confirm({ message: 'Publish the report?', destructive: false, defaultAnswer: 'yes' }),
    ],
    response: type({ publish: 'boolean' }),
    next: [{ to: 'summary', when: ({ response }) => response.publish }, { to: 'ask-changes' }],
  })

  // --- view + terminal: pre-rendered card ---
  .step('summary', {
    prompt: ({ store }) => {
      const theme = store.steps['gather-preferences']?.theme ?? '';
      const framework = store.steps['gather-preferences']?.framework ?? '';
      const savedPath = store.steps['write-report']?.path ?? '';
      const published = store.steps['confirm-publish']?.publish ?? false;
      return [
        view([
          render.section(
            'Report Published',
            render.kv({
              Theme: theme,
              Framework: framework,
              'Saved to': savedPath,
            }),
          ),
          render.checklist([
            { text: 'Research', done: true },
            { text: 'Plan approved', done: true },
            { text: 'Written', done: true },
            { text: 'Published', done: published },
          ]),
        ]),
        'Present the summary card verbatim.',
      ];
    },
    response: type({ summary: 'string' }),
    next: terminal,
  })

  .build();
