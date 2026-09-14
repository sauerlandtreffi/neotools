import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getModel } from '../src/models/catalog.js';
import { findLocalOnnx } from '../src/models/paths.js';

const platform = {
  id: 'node' as const,
  capabilities: { canvas: false, opfs: false, workers: true, qpdf: false, ocr: false, webgpu: false, onnx: true },
};

const u2 = getModel('u2netp');
const hasModel = Boolean(
  u2 &&
    [
      join(process.cwd(), 'packages/tools-image-ai/.models', u2.localName),
      join(process.cwd(), '.models', u2.localName),
      join(homedir(), '.cache/neotools/models', u2.localName),
      join(process.cwd(), 'apps/web/public/assets/models', u2.localName),
    ].some((p) => existsSync(p)),
);

describe.skipIf(!hasModel)('onnx models (local only)', () => {
  it('loads u2netp bytes when present', async () => {
    const u2 = getModel('u2netp')!;
    const bytes = await findLocalOnnx(u2, platform);
    expect(bytes?.byteLength).toBeGreaterThan(1000);
  });
});
