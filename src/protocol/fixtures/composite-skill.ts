import { skill, type, action } from '../../index.js';
import { compositeMain } from '../../cli.js';

const scanAction = action({
  name: 'scan',
  input: type({ path: 'string' }),
  output: type({ found: 'string' }),
  run: async ({ input }) => ({ found: `scanned:${input.path}` }),
});

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose', stash: type({ scanResult: 'string' }) })
  .step('diagnose', {
    prompt: 'Diagnose the issue.',
    response: type({ issue: 'string' }),
    action: {
      run: scanAction,
      input: ({ response }) => ({ path: response.issue }),
      updateStash: ({ actionResult }) => ({ scanResult: actionResult.found }),
    },
    next: 'triage',
  })
  .step('triage', {
    prompt: 'Triage the findings.',
    response: type({ priority: 'string' }),
    next: 'report',
  })
  .step('report', {
    prompt: (ctx) => `Report: scanResult=${JSON.stringify(ctx.stash.scanResult)}`,
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
  stash: type({ intent: 'string' }),
})
  .step('classify', {
    prompt: 'Classify intent.',
    response: type({ intent: 'string' }),
    updateStash: ({ response }) => ({ intent: response.intent }),
    next: ({ response }) => {
      if (response.intent === 'faq') return 'topic:basics';
      return `subskill:${response.intent}`;
    },
  })
  .topic('basics', { label: 'Basic FAQ', content: () => 'This is the basics FAQ content.' })
  .subskill('doctor', doctorSkill, {
    params: (_output: unknown, stash: unknown) => ({ from: (stash as Record<string, unknown>).intent }),
  })
  .subskill('setup', setupSkill)
  .build();

compositeMain(composite, process.env['SKILL_DIR']);
