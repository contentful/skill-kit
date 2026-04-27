import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTools, renderPrimitive, preambleRows } from './registry.js';
import type { Handshake } from '../types.js';
import { checklist } from './checklist.js';
import { confirm } from './confirm.js';

test('resolveTools: explicit tools are authoritative — no registry merge', () => {
  const handshake: Handshake = {
    host: 'claude-code',
    toolsAvailable: ['ask_followup_question'],
  };
  const resolved = resolveTools(handshake);
  // Explicit tool matched for ask-user
  assert.equal(resolved['ask-user'], 'ask_followup_question');
  // No match for plan in the explicit list — undefined, not registry fallback
  assert.equal(resolved['plan'], undefined);
});

test('resolveTools: registry fallback per-primitive when no explicit tools', () => {
  const handshake: Handshake = {
    host: 'claude-code',
    toolsAvailable: [],
  };
  const resolved = resolveTools(handshake);
  assert.equal(resolved['ask-user'], 'AskUserQuestion');
  assert.equal(resolved['plan'], 'EnterPlanMode');
  assert.equal(resolved['checklist'], 'TaskCreate');
  assert.equal(resolved['subagent'], 'Agent');
});

test('resolveTools: unknown host with no tools gets all undefined', () => {
  const handshake: Handshake = {
    host: 'unknown-agent',
    toolsAvailable: [],
  };
  const resolved = resolveTools(handshake);
  assert.equal(resolved['ask-user'], undefined);
  assert.equal(resolved['plan'], undefined);
  assert.equal(resolved['checklist'], undefined);
  assert.equal(resolved['subagent'], undefined);
});

test('resolveTools: partial explicit tools — unmatched primitives get undefined', () => {
  const handshake: Handshake = {
    host: 'cline',
    toolsAvailable: ['AskUserQuestion', 'Agent'],
  };
  const resolved = resolveTools(handshake);
  // Explicit matches
  assert.equal(resolved['ask-user'], 'AskUserQuestion');
  assert.equal(resolved['subagent'], 'Agent');
  // No match in explicit list — undefined, not registry fallback
  assert.equal(resolved['plan'], undefined);
  assert.equal(resolved['checklist'], undefined);
});

test('resolveTools: explicit tool not in any primitive is ignored', () => {
  const handshake: Handshake = {
    host: 'generic',
    toolsAvailable: ['SomeUnknownTool'],
  };
  const resolved = resolveTools(handshake);
  assert.equal(resolved['ask-user'], undefined);
});

test('renderPrimitive: checklist produces XML', () => {
  const config = checklist({
    create: [
      { title: 'Fix CI', status: 'pending' },
      { title: 'Deploy', status: 'done' },
    ],
  });
  const xml = renderPrimitive(config);
  assert.ok(xml.includes('<checklist>'));
  assert.ok(xml.includes('<item status="pending">Fix CI</item>'));
  assert.ok(xml.includes('<item status="done">Deploy</item>'));
  assert.ok(xml.includes('</checklist>'));
});

test('renderPrimitive: confirm produces XML with attributes', () => {
  const config = confirm({ message: 'Delete files?', destructive: true, defaultAnswer: 'no' });
  const xml = renderPrimitive(config);
  assert.ok(xml.includes('<confirm'));
  assert.ok(xml.includes('default="no"'));
  assert.ok(xml.includes('destructive="true"'));
  assert.ok(xml.includes('Delete files?'));
  assert.ok(xml.includes('</confirm>'));
});

test('preambleRows: includes all tags with tool names for Claude Code', () => {
  const resolved = resolveTools({ host: 'claude-code', toolsAvailable: [] });
  const rows = preambleRows(resolved);

  const tags = rows.map((r) => r.tag);
  assert.ok(tags.some((t) => t.includes('<system>')));
  assert.ok(tags.some((t) => t.includes('<prompt>')));
  assert.ok(tags.some((t) => t.includes('<ask-user>')));
  assert.ok(tags.some((t) => t.includes('<confirm>')));
  assert.ok(tags.some((t) => t.includes('<plan>')));
  assert.ok(tags.some((t) => t.includes('<checklist>')));
  assert.ok(tags.some((t) => t.includes('<subagent>')));
  assert.ok(tags.some((t) => t.includes('<rendered>')));

  const askRow = rows.find((r) => r.tag.includes('<ask-user>'));
  assert.equal(askRow?.tool, 'AskUserQuestion');
});

test('preambleRows: generic host shows dashes', () => {
  const resolved = resolveTools({ host: 'generic', toolsAvailable: [] });
  const rows = preambleRows(resolved);

  const askRow = rows.find((r) => r.tag.includes('<ask-user>'));
  assert.equal(askRow?.tool, '—');
  assert.ok(askRow?.instruction.includes('numbered list'));
});
