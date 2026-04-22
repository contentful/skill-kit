import { skill, z } from '../../index.js';
import { compositeMain } from '../../cli.js';

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose' })
  .step('diagnose', {
    prompt: 'Diagnose the issue.',
    output: z.object({ issue: z.string() }),
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
