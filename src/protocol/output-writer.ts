import type { CliResult } from '../types.js';
import type { SessionFile } from './session.js';

export interface OutputWriter {
  writeStart(result: CliResult): void;
  writeAdvance(result: CliResult): void;
  writeIntermediate(result: CliResult): void;
}

export function createOutputWriter(session: SessionFile | undefined): OutputWriter {
  if (session) {
    return {
      writeStart(result) {
        const line = session.appendResult(result);
        session.writeStartPointer(line);
      },
      writeAdvance(result) {
        const line = session.appendResult(result);
        session.writePointer(line);
      },
      writeIntermediate(result) {
        session.appendResult(result);
      },
    };
  }

  const writeStdout = (result: CliResult) => {
    process.stdout.write(JSON.stringify(result) + '\n');
  };

  return {
    writeStart: writeStdout,
    writeAdvance: writeStdout,
    writeIntermediate() {},
  };
}
