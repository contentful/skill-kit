import { skill, z } from '../../index.js';
import { main } from '../../cli.js';

const s = skill({ name: 'multi-step', entry: 'greet' })
  .step('greet', {
    prompt: 'Say hello.',
    output: z.object({ message: z.string() }),
    next: 'ask',
  })
  .step('ask', {
    prompt: 'Ask a question.',
    output: z.object({ answer: z.string() }),
    next: { terminal: true },
  })
  .build();

main(s);
