import { skill, type } from '../../index.js';
import { main } from '../../cli.js';

const s = skill({ name: 'simple', entry: 'greet' })
  .step('greet', {
    prompt: 'Say hello.',
    output: type({ message: 'string' }),
    next: { terminal: true },
  })
  .build();

main(s);
