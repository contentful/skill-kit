import { skill, type } from '../../index.js';
import { main } from '../../cli.js';

const s = skill({ name: 'multi-step', entry: 'greet' })
  .step('greet', {
    prompt: 'Say hello.',
    output: type({ message: 'string' }),
    next: 'ask',
  })
  .step('ask', {
    prompt: 'Ask a question.',
    output: type({ answer: 'string' }),
    next: { terminal: true },
  })
  .build();

main(s);
