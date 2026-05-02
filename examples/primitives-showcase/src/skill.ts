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

  stash: type({
    theme: 'string',
    framework: 'string',
    approved: 'boolean',
    researchSummary: 'string',
    savedPath: 'string',
  }),
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
    output: type({ theme: 'string', framework: 'string' }),
    updateStash: ({ stepOutput }) => ({ theme: stepOutput.theme, framework: stepOutput.framework }),
    next: 'research',
  })

  // --- subagent: delegated research ---
  .step('research', {
    prompt: ({ stash }) => [
      prompt`Research ${stash.theme} best practices for ${stash.framework} projects.`,
      act.subagent({
        prompt: `Find 3 key recommendations for ${stash.theme} in ${stash.framework}. Return a concise summary.`,
        output: type({ summary: 'string' }),
      }),
    ],
    output: type({ summary: 'string' }),
    updateStash: ({ stepOutput }) => ({ researchSummary: stepOutput.summary }),
    next: 'plan-report',
  })

  // --- plan: structured approval ---
  .step('plan-report', {
    prompt: ({ stash }) => [
      prompt`Based on the research, plan the report structure.`,
      act.plan({
        summary: `${stash.theme} report for ${stash.framework}`,
        steps: ['Executive summary', 'Key findings', 'Recommendations', 'Action items'],
      }),
    ],
    output: type({ approved: 'boolean', 'modifications?': 'string' }),
    next: ({ stepOutput }) => (stepOutput.approved ? 'write-report' : 'ask-changes'),
  })

  // --- askUser (open): free-form feedback ---
  .step('ask-changes', {
    prompt: [
      'The plan was not approved. Ask what changes are needed.',
      act.askUser({ type: 'open', question: 'What would you like to change about the report plan?' }),
    ],
    output: type({ feedback: 'string' }),
    next: 'plan-report',
    maxVisits: 3,
    onMaxVisits: 'write-report',
  })

  // --- checklist: tracked work items ---
  .step('write-report', {
    prompt: ({ stash, act, system }) => [
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
        Write the ${stash.theme} report for ${stash.framework}.
        Research summary: ${stash.researchSummary}
        Complete each checklist item as you write.
      `,
    ],
    output: type({ title: 'string', body: 'string' }),
    action: {
      run: saveReport,
      updateStash: ({ actionOutput }) => ({ savedPath: actionOutput.path }),
    },
    next: 'confirm-publish',
  })

  // --- confirm: yes/no gate ---
  .step('confirm-publish', {
    prompt: [
      'The report has been saved. Ask if the user wants to publish it.',
      act.confirm({ message: 'Publish the report?', destructive: false, defaultAnswer: 'yes' }),
    ],
    output: type({ publish: 'boolean' }),
    updateStash: ({ stepOutput }) => ({ approved: stepOutput.publish }),
    next: ({ stepOutput }) => (stepOutput.publish ? 'summary' : 'ask-changes'),
  })

  // --- view + terminal: pre-rendered card ---
  .step('summary', {
    prompt: ({ stash }) => [
      view([
        render.section(
          'Report Published',
          render.kv({
            Theme: stash.theme,
            Framework: stash.framework,
            'Saved to': stash.savedPath,
          }),
        ),
        render.checklist([
          { text: 'Research', done: true },
          { text: 'Plan approved', done: true },
          { text: 'Written', done: true },
          { text: 'Published', done: stash.approved },
        ]),
      ]),
      'Present the summary card verbatim.',
    ],
    output: type({ summary: 'string' }),
    next: terminal,
  })

  .build();
