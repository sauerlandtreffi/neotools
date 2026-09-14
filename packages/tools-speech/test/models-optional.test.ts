import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getModel } from '../src/models/catalog.js';

const tiny = getModel('whisper-tiny');
const has = Boolean(
  tiny &&
    [
      join(process.cwd(), 'packages/tools-speech/.models', tiny.localName, 'config.json'),
      join(process.cwd(), '.models', tiny.localName, 'config.json'),
      join(homedir(), '.cache/neotools/models', tiny.localName, 'config.json'),
    ].some((p) => existsSync(p)),
);

describe.skipIf(!has)('whisper model (local only)', () => {
  it('finds whisper-tiny config when fetched', () => {
    expect(tiny?.license).toBe('MIT');
    expect(has).toBe(true);
  });
});
