import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { getSecureSessionDir } from './secure-tmp.js';

test('getSecureSessionDir creates directory with 0700 permissions', () => {
  const dir = getSecureSessionDir();
  const stat = statSync(dir);
  assert.equal(stat.mode & 0o777, 0o700);
});

test('getSecureSessionDir returns same path on repeated calls', () => {
  const dir1 = getSecureSessionDir();
  const dir2 = getSecureSessionDir();
  assert.equal(dir1, dir2);
});

test('getSecureSessionDir is owned by current user', () => {
  const dir = getSecureSessionDir();
  const stat = statSync(dir);
  assert.equal(stat.uid, process.getuid!());
});
