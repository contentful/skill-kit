import { skill, z } from '../../index.js';
import { main } from '../../cli.js';

const s = skill({ name: 'simple', entry: 'greet' })
  .step('greet', {
    prompt: 'Say hello.',
    output: z.object({ message: z.string() }),
    next: { terminal: true },
  })
  .build();

main(s);
