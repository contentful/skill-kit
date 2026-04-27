import test from 'node:test';
import assert from 'node:assert/strict';
import { survey, surveyPrimitive } from './survey.js';

test('survey creates frozen SurveyConfig', () => {
  const config = survey({
    questions: [
      {
        question: 'Style?',
        header: 'Style',
        options: [
          { value: 'classic', label: 'Classic' },
          { value: 'modern', label: 'Modern' },
        ],
      },
    ],
  });
  assert.equal(config.kind, 'survey');
  assert.equal(config.questions.length, 1);
  assert.equal(config.questions[0]!.header, 'Style');
  assert.ok(Object.isFrozen(config));
});

test('survey throws if no questions', () => {
  assert.throws(() => survey({ questions: [] }), /at least 1 question/);
});

test('survey throws if header exceeds 12 chars', () => {
  assert.throws(
    () =>
      survey({
        questions: [
          {
            question: 'Pick',
            header: 'Way Too Long Header',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
          },
        ],
      }),
    /header must be ≤12 characters/,
  );
});

test('survey throws if fewer than 2 options', () => {
  assert.throws(
    () =>
      survey({
        questions: [{ question: 'Pick', options: [{ value: 'a', label: 'A' }] }],
      }),
    /must have 2–4 options/,
  );
});

test('survey throws if more than 4 options', () => {
  assert.throws(
    () =>
      survey({
        questions: [
          {
            question: 'Pick',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
              { value: 'c', label: 'C' },
              { value: 'd', label: 'D' },
              { value: 'e', label: 'E' },
            ],
          },
        ],
      }),
    /must have 2–4 options/,
  );
});

test('survey render produces valid XML', () => {
  const config = survey({
    questions: [
      {
        question: 'Style?',
        header: 'Style',
        options: [
          { value: 'classic', label: 'Classic', description: 'Traditional' },
          { value: 'modern', label: 'Modern', description: 'New school' },
        ],
      },
      {
        question: 'Engine?',
        options: [
          { value: 'canvas', label: 'Canvas' },
          { value: 'dom', label: 'DOM' },
        ],
      },
    ],
  });
  const xml = surveyPrimitive.render(config);
  assert.ok(xml.includes('<survey>'));
  assert.ok(xml.includes('</survey>'));
  assert.ok(xml.includes('header="Style"'));
  assert.ok(xml.includes('text="Style?"'));
  assert.ok(xml.includes('text="Engine?"'));
  assert.ok(xml.includes('value="classic"'));
  assert.ok(xml.includes('value="dom"'));
});

test('survey render includes preview as child element', () => {
  const config = survey({
    questions: [
      {
        question: 'Layout?',
        options: [
          { value: 'grid', label: 'Grid', preview: '+-+-+\n|A|B|\n+-+-+' },
          { value: 'list', label: 'List' },
        ],
      },
    ],
  });
  const xml = surveyPrimitive.render(config);
  assert.ok(xml.includes('<preview>+-+-+\n|A|B|\n+-+-+</preview>'));
  assert.ok(!xml.includes('preview='));
});

test('survey render includes multi-select attribute', () => {
  const config = survey({
    questions: [
      {
        question: 'Features?',
        multiSelect: true,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    ],
  });
  const xml = surveyPrimitive.render(config);
  assert.ok(xml.includes('multi-select="true"'));
});

test('survey render splits >4 questions into multiple blocks', () => {
  const questions = Array.from({ length: 6 }, (_, i) => ({
    question: `Q${i + 1}?`,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  }));
  const config = survey({ questions });
  const xml = surveyPrimitive.render(config);
  const surveyBlocks = xml.split('<survey>').length - 1;
  assert.equal(surveyBlocks, 2);
  assert.ok(xml.includes('text="Q1?"'));
  assert.ok(xml.includes('text="Q5?"'));
  assert.ok(xml.includes('text="Q6?"'));
});

test('survey preamble tier 1: batch-capable tool', () => {
  const row = surveyPrimitive.preambleRow('AskUserQuestion');
  assert.equal(row.tool, 'AskUserQuestion');
  assert.ok(row.instruction.includes('Batch all'));
});

test('survey preamble tier 2: single-question tool', () => {
  const row = surveyPrimitive.preambleRow('ask_followup_question');
  assert.equal(row.tool, 'ask_followup_question');
  assert.ok(row.instruction.includes('sequentially'));
});

test('survey preamble tier 3: no tool', () => {
  const row = surveyPrimitive.preambleRow(undefined);
  assert.equal(row.tool, '—');
  assert.ok(row.instruction.includes('numbered-choice'));
});
