import { skill, type, action } from '../../index.js';
import { compositeMain } from '../../cli.js';

const scanAction = action({
  name: 'scan',
  input: type({ path: 'string' }),
  output: type({ found: 'string' }),
  run: async ({ input }) => ({ found: `scanned:${input.path}` }),
});

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose' })
  .step('diagnose', {
    prompt: 'Diagnose the issue.',
    response: type({ issue: 'string' }),
    action: {
      run: scanAction,
      input: ({ response }) => ({ path: response.issue }),
    },
    next: 'triage',
  })
  .step('triage', {
    prompt: 'Triage the findings.',
    response: type({ priority: 'string' }),
    next: 'report',
  })
  .step('report', {
    prompt: (ctx) => {
      const record = ctx.store.history.find((r) => r.step === 'diagnose');
      return `Report: scanResult=${JSON.stringify((record?.actionResult as { found: string })?.found)}`;
    },
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })
  .build();

const setupSkill = skill({ name: 'setup', entry: 'configure' })
  .step('configure', {
    prompt: 'Configure the space.',
    response: type({ done: 'boolean' }),
    next: { terminal: true },
  })
  .build();

const composite = skill({
  name: 'helper',
  entry: 'classify',
  params: type({ query: 'string = ""' }),
})
  .step('classify', {
    prompt: 'Classify intent.',
    response: type({ intent: 'string' }),
    next: ({ response }) => {
      if (response.intent === 'faq') return 'topic:basics';
      return `subskill:${response.intent}`;
    },
  })
  .topic('basics', { label: 'Basic FAQ', content: () => 'This is the basics FAQ content.' })
  .subskill('doctor', doctorSkill, {
    params: (_output: unknown, store) => ({
      from: (store.maybe('classify') as { intent: string } | undefined)?.intent ?? '',
    }),
  })
  .subskill('setup', setupSkill)
  .build();

compositeMain(composite, process.env['SKILL_DIR']);
