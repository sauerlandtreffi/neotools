import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { createToolContext, MIME, neoFileFromBytes } from '@neotools/engine';
import { createTar, createZip, readTar, readZip, safeRelPath } from '../src/index.js';
import { inspectZip } from '../src/zip-tar.js';
import { sidecarGroups } from '../src/camera.js';
import { filesCompareFolders } from '../src/tools/files-compare-folders.js';
import { archiveCreate } from '../src/tools/archive-create.js';
import { archiveExtract } from '../src/tools/archive-extract.js';

function zeros(n: number): Uint8Array {
  return new Uint8Array(n);
}

describe('archive pack', () => {
  it('ZIP and TAR roundtrip', () => {
    const files = { 'dir/a.txt': new TextEncoder().encode('hello'), 'b.txt': new TextEncoder().encode('world') };
    const zip = createZip(files);
    const z = readZip(zip);
    expect(new TextDecoder().decode(z.files['dir/a.txt']!)).toBe('hello');
    expect(z.blocked).toEqual([]);

    const tar = createTar(files);
    const t = readTar(tar);
    expect(new TextDecoder().decode(t['b.txt']!)).toBe('world');
  });

  it('blocks Zip-Slip paths', () => {
    expect(safeRelPath('../etc/passwd')).toBeUndefined();
    expect(() => createZip({ '../../evil.txt': new Uint8Array([1]) })).toThrow(/Zip-Slip|unsicher/);
    const evil = zipSync({ '../../etc/passwd': new Uint8Array([1]) });
    const read = readZip(evil);
    expect(read.blocked.some((n) => n.includes('..'))).toBe(true);
    expect(Object.keys(read.files)).not.toContain('../../etc/passwd');
  });

  it('warns on zip-bomb ratio', () => {
    const payload = { 'zeros.bin': zeros(200_000) };
    const zip = createZip(payload, 9);
    const info = inspectZip(zip);
    expect(info.warnings.join(' ') + info.entries.flatMap((e) => e.suspicious).join(' ')).toMatch(/bomb|Kompression|Ratio/i);
    const read = readZip(zip);
    expect(read.warnings.join(' ')).toMatch(/Bomb|Ratio/i);
  });

  it('groups JPG+RAW+XMP sidecars', () => {
    const groups = sidecarGroups(['DCIM/100/IMG_001.jpg', 'DCIM/100/IMG_001.cr2', 'DCIM/100/IMG_001.xmp', 'other.txt']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.arrayContaining(['DCIM/100/IMG_001.jpg', 'DCIM/100/IMG_001.cr2', 'DCIM/100/IMG_001.xmp']));
  });

  it('compares two ZIPs by hash', async () => {
    const left = createZip({ 'a.txt': new TextEncoder().encode('same'), 'only-left.txt': new TextEncoder().encode('L') });
    const right = createZip({ 'a.txt': new TextEncoder().encode('DIFF'), 'only-right.txt': new TextEncoder().encode('R') });
    const result = await filesCompareFolders.run(createToolContext(), [
      neoFileFromBytes('left.zip', left, MIME.zip),
      neoFileFromBytes('right.zip', right, MIME.zip),
    ], { leftRoot: '', rightRoot: '' });
    const json = JSON.parse(new TextDecoder().decode(await result.outputs[0]!.bytes())) as {
      onlyLeft: string[];
      onlyRight: string[];
      different: string[];
    };
    expect(json.onlyLeft).toContain('only-left.txt');
    expect(json.onlyRight).toContain('only-right.txt');
    expect(json.different).toContain('a.txt');
  });

  it('create + extract tools', async () => {
    const ctx = createToolContext();
    const created = await archiveCreate.run(
      ctx,
      [neoFileFromBytes('note.txt', new TextEncoder().encode('hi'), MIME.txt)],
      { format: 'zip', level: 6, password: '', outputName: 'out', rootPath: '' },
    );
    const zip = created.outputs[0]!;
    const extracted = await archiveExtract.run(ctx, [zip], { password: '', glob: '**' });
    expect(extracted.outputs.some((o) => o.name.includes('note'))).toBe(true);
  });
});
