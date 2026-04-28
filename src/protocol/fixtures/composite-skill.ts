import { skill, z, action } from '../../index.js';
import { compositeMain } from '../../cli.js';

const scanAction = action({
  name: 'scan',
  input: z.object({ path: z.string() }),
  output: z.object({ found: z.string() }),
  run: async ({ input }) => ({ found: `scanned:${input.path}` }),
});

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose', stash: z.object({ scanResult: z.string() }) })
  .step('diagnose', {
    prompt: 'Diagnose the issue.',
    output: z.object({ issue: z.string() }),
    action: {
      run: scanAction,
      input: ({ output }) => ({ path: output.issue }),
      stash: ({ result }) => ({ scanResult: result.found }),
    },
    next: 'triage',
  })
  .step('triage', {
    prompt: 'Triage the findings.',
    output: z.object({ priority: z.string() }),
    next: 'report',
  })
  .step('report', {
    prompt: (ctx) => `Report: scanResult=${JSON.stringify(ctx.stash.scanResult)}`,
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })
  .build();

const setupSkill = skill({ name: 'setup', entry: 'configure' })
  .step('configure', {
    prompt: 'Configure the space.',
    output: z.object({ done: z.boolean() }),
    next: { terminal: true },
  })
  .build();

const composite = skill({
  name: 'helper',
  entry: 'classify',
  context: z.object({ query: z.string().default('') }),
  stash: z.object({ intent: z.string() }),
})
  .step('classify', {
    prompt: 'Classify intent.',
    output: z.object({ intent: z.string() }),
    stash: ({ output }) => ({ intent: output.intent }),
    next: ({ output }) => {
      if (output.intent === 'faq') return 'topic:basics';
      return `subskill:${output.intent}`;
    },
  })
  .topic('basics', { label: 'Basic FAQ', content: () => 'This is the basics FAQ content.' })
  .subskill('doctor', doctorSkill, {
    context: (_output, stash) => ({ from: (stash as Record<string, unknown>).intent }),
  })
  .subskill('setup', setupSkill)
  .build();

compositeMain(composite, process.env['SKILL_DIR']);
