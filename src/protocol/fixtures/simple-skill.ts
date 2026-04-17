import { skill, step, z } from '../../index.js';
import { main } from '../../cli.js';

const s = skill({
  name: 'simple',
  entry: 'greet',
  steps: {
    greet: step({
      prompt: 'Say hello.',
      output: z.object({ message: z.string() }),
      next: { terminal: true },
    }),
  },
});

main(s);
