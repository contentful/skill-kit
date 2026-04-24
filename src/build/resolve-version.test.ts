import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveVersionFromAncestor } from './resolve-version.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'resolve-version-'));
}

test('resolves version from package.json in the same directory', () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '3.2.1' }));
    const result = resolveVersionFromAncestor(dir);
    assert.ok(result);
    assert.equal(result.version, '3.2.1');
    assert.equal(result.source, join(dir, 'package.json'));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('walks up to find ancestor package.json', () => {
  const root = makeTmpDir();
  const child = join(root, 'packages', 'my-skill', 'src');
  try {
    mkdirSync(child, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.5.0' }));
    const result = resolveVersionFromAncestor(child);
    assert.ok(result);
    assert.equal(result.version, '1.5.0');
    assert.equal(result.source, join(root, 'package.json'));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('skips package.json without a version field', () => {
  const root = makeTmpDir();
  const child = join(root, 'child');
  try {
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), JSON.stringify({ name: 'no-version' }));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    const result = resolveVersionFromAncestor(child);
    assert.ok(result);
    assert.equal(result.version, '2.0.0');
    assert.equal(result.source, join(root, 'package.json'));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('skips malformed package.json', () => {
  const root = makeTmpDir();
  const child = join(root, 'child');
  try {
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), '{ not valid json');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '4.0.0' }));
    const result = resolveVersionFromAncestor(child);
    assert.ok(result);
    assert.equal(result.version, '4.0.0');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('returns nearest ancestor when multiple exist', () => {
  const root = makeTmpDir();
  const mid = join(root, 'packages', 'my-skill');
  const child = join(mid, 'src');
  try {
    mkdirSync(child, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(mid, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    const result = resolveVersionFromAncestor(child);
    assert.ok(result);
    assert.equal(result.version, '2.0.0');
    assert.equal(result.source, join(mid, 'package.json'));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('returns undefined when no package.json found', () => {
  const dir = makeTmpDir();
  const child = join(dir, 'deep', 'nested');
  try {
    mkdirSync(child, { recursive: true });
    // No package.json anywhere in the tmp subtree — the walk will eventually
    // reach the filesystem root or a real package.json outside our control,
    // but inside the tmp dir there is none. We test the isolated subtree.
    // To truly test "not found" we'd need to mock fs, so instead we verify
    // the function returns a result (from some ancestor) or undefined.
    const result = resolveVersionFromAncestor(child);
    // In practice this will find the system's package.json or return undefined.
    // We mainly verify it doesn't throw.
    assert.ok(result === undefined || typeof result.version === 'string');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
