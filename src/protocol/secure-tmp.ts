import { mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECURE_DIR_NAME = 'skill-kit-sessions';

export function getSecureSessionDir(): string {
  const dir = join(tmpdir(), SECURE_DIR_NAME);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const stat = statSync(dir);
  if (stat.uid !== process.getuid!()) {
    throw new Error(`Refusing to use ${dir}: owned by uid ${stat.uid}, expected ${process.getuid!()}`);
  }
  if ((stat.mode & 0o777) !== 0o700) {
    throw new Error(`Refusing to use ${dir}: permissions are ${(stat.mode & 0o777).toString(8)}, expected 700`);
  }

  return dir;
}
