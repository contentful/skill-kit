import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from '../skill.js';
import { act } from '../act.js';
import { checkSkill } from './index.js';

test('no-host-tool-names flags direct tool reference', () => {
  const s = skill({ name: 'bad', entry: 'a' })
    .step('a', {
      prompt: 'Use the AskUserQuestion tool to ask the user.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const diags = checkSkill(s, '.');
  const match = diags.find((d) => d.rule === 'no-host-tool-names');
  assert.ok(match);
  assert.equal(match.severity, 'error');
});

test('no-host-tool-names does not flag guarded reference', () => {
  const s = skill({ name: 'guarded', entry: 'a' })
    .step('a', {
      prompt: ({ host }) => {
        if (host.toolsAvailable.includes('AskUserQuestion')) {
          return 'Use AskUserQuestion';
        }
        return 'Ask the user';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const diags = checkSkill(s, '.');
  const match = diags.find((d) => d.rule === 'no-host-tool-names');
  assert.equal(match, undefined);
});

test('primitive-schema-mismatch flags mismatched askUser options', () => {
  const s = skill({ name: 'mismatch', entry: 'a' })
    .step('a', {
      act: act.askUser({
        type: 'structured',
        question: 'Pick one',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ],
      }),
      output: z.object({ choice: z.enum(['a', 'b']) }),
      next: { terminal: true },
    })
    .build();

  const diags = checkSkill(s, '.');
  const errors = diags.filter((d) => d.rule === 'primitive-schema-mismatch' && d.severity === 'error');
  assert.ok(errors.length > 0);
});

test('cycle-guard warns on unguarded cycle', () => {
  const s = skill({ name: 'cycle', entry: 'a' })
    .step('a', { prompt: 'A', output: z.object({}), next: 'b' })
    .step('b', { prompt: 'B', output: z.object({}), next: 'a' })
    .build();

  const diags = checkSkill(s, '.');
  const matches = diags.filter((d) => d.rule === 'cycle-guard');
  assert.ok(matches.length > 0);
  assert.equal(matches[0]!.severity, 'warning');
  assert.ok(matches[0]!.message.includes('implicit limit'));
});

test('clean skill produces no errors', () => {
  const s = skill({ name: 'clean', entry: 'a' })
    .step('a', {
      prompt: 'Do something useful.',
      output: z.object({ done: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  const diags = checkSkill(s, '.');
  const errors = diags.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0);
});
