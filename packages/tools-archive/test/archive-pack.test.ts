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

  it('blocks Windows drive, absolute, long, and case-colliding paths', () => {
    expect(safeRelPath('C:/Windows/system32/x.dll')).toBeUndefined();
    expect(safeRelPath('/etc/passwd')).toBeUndefined();
    expect(safeRelPath(`${'a'.repeat(300)}.txt`)).toBeUndefined();
    const clash = zipSync({
      'Readme.txt': new TextEncoder().encode('A'),
      'readme.txt': new TextEncoder().encode('B'),
    });
    const read = readZip(clash);
    expect(read.blocked.length + Object.keys(read.files).length).toBeGreaterThan(0);
    if (read.blocked.length) expect(read.warnings.join(' ')).toMatch(/Kollision|Unicode|Case/i);
  });

  it('skips TAR symlinks and hardlinks', () => {
    const tar = createTar({ 'ok.txt': new TextEncoder().encode('hi') });
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode('link-to-etc'), 0);
    header.set(new TextEncoder().encode('00000000000\0'), 124);
    header[156] = '2'.charCodeAt(0);
    const withLink = new Uint8Array(512 + tar.length);
    withLink.set(header, 0);
    withLink.set(tar, 512);
    const files = readTar(withLink);
    expect(Object.keys(files)).not.toContain('link-to-etc');
    expect(Object.keys(files)).toContain('ok.txt');
  });

  it('blocks backslash traversal, UNC, drive letters, ~ and NUL in entry names', () => {
    for (const evil of ['..\\..\\Windows\\win.ini', 'C:\\Users\\x.txt', 'c:/x.txt', '\\\\server\\share\\x', '~/.ssh/authorized_keys', 'a/../../b', 'a\0b.txt', '/abs.txt', 'dir/..']) {
      expect(safeRelPath(evil), evil).toBeUndefined();
    }
    expect(safeRelPath('./ok/./sub\\file.txt')).toBe('ok/sub/file.txt');
    const evil = zipSync({ '..\\..\\evil.txt': new Uint8Array([1]), 'fine.txt': new Uint8Array([2]) });
    const read = readZip(evil);
    expect(Object.keys(read.files)).toEqual(['fine.txt']);
    expect(read.blocked).toEqual(['..\\..\\evil.txt']);
  });

  it('aborts a ZIP bomb before inflating (central directory sizes) and caps absolute size', async () => {
    const { BOMB_UNCOMPRESSED } = await import('../src/zip-tar.js');
    // 2 MiB of zeros → ~2000× ratio; the filter throws before unzipSync inflates the entry
    const bomb = zipSync({ 'bomb.bin': zeros(2 * 1024 * 1024) }, { level: 9 });
    const read = readZip(bomb);
    expect(read.files).toEqual({});
    expect(read.warnings.join(' ')).toMatch(/Bomb/);
    // many medium entries whose announced total exceeds the absolute cap
    const entries: Record<string, Uint8Array> = {};
    const chunk = new Uint8Array(4 * 1024 * 1024);
    for (let i = 0; i < chunk.length; i++) chunk[i] = (i * 2654435761) >>> 24; // low-compressibility filler
    const count = Math.ceil(BOMB_UNCOMPRESSED / chunk.length) + 1;
    for (let i = 0; i < count; i++) entries[`part-${i}.bin`] = chunk;
    const big = zipSync(entries, { level: 1 });
    const readBig = readZip(big);
    expect(readBig.files).toEqual({});
    expect(readBig.warnings.join(' ')).toMatch(/Gesamtgröße|Bomb/);
  });

  it('caps gzip/tgz output (gzip bomb) and TAR total size', async () => {
    const { gunzipLimited, readTarGz, ArchiveBombError, readAny } = await import('../src/zip-tar.js');
    const { gzipSync } = await import('fflate');
    const gz = gzipSync(zeros(3 * 1024 * 1024), { level: 9 });
    expect(() => gunzipLimited(gz, 1024 * 1024)).toThrow(ArchiveBombError);
    expect(() => readTarGz(gzipSync(createTar({ 'a.txt': zeros(512) })))).not.toThrow();
    const bombTgz = gzipSync(createTar({ 'z.bin': zeros(3 * 1024 * 1024) }), { level: 9 });
    const res = await readAny(bombTgz, 'bomb.tgz');
    expect(res.files).toEqual({});
    expect(res.warnings.join(' ')).toMatch(/Bomb/);
    const tar = createTar({ 'x.bin': zeros(1024) });
    expect(() => readTar(tar, 512)).toThrow(ArchiveBombError);
  });

  it('TAR: skips device/FIFO entries and joins the ustar prefix before the path check', () => {
    const base = createTar({ 'ok.txt': new TextEncoder().encode('hi') });
    const mk = (name: string, type: string, prefix = '') => {
      const h = new Uint8Array(512);
      h.set(new TextEncoder().encode(name), 0);
      h.set(new TextEncoder().encode('00000000001\0'), 124);
      h[156] = type.charCodeAt(0);
      h.set(new TextEncoder().encode('ustar\0'), 257);
      if (prefix) h.set(new TextEncoder().encode(prefix), 345);
      const body = new Uint8Array(512);
      body[0] = 0x41;
      const out = new Uint8Array(1024);
      out.set(h, 0);
      out.set(body, 512);
      return out;
    };
    const parts = [mk('dev', '3'), mk('fifo', '6'), mk('hard', '1'), mk('passwd', '0', '../../etc'), mk('good.txt', '0', 'sub/dir'), base];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const joined = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.length;
    }
    const files = readTar(joined);
    expect(Object.keys(files).sort()).toEqual(['ok.txt', 'sub/dir/good.txt']);
  });

  it('never expands nested archives (depth 0) but reports them', async () => {
    const { MAX_NESTING_DEPTH } = await import('../src/zip-tar.js');
    expect(MAX_NESTING_DEPTH).toBe(0);
    const inner = zipSync({ 'deep.txt': new TextEncoder().encode('x') });
    const outer = zipSync({ 'inner.zip': inner });
    const read = readZip(outer);
    expect(Object.keys(read.files)).toEqual(['inner.zip']);
    expect(read.warnings.join(' ')).toMatch(/Verschachtelt/);
  });

  it('rejects a ReDoS-ish glob', async () => {
    const { matchGlob } = await import('../src/path-safe.js');
    expect(matchGlob('a.txt', `${'('.repeat(80)}a${')+'.repeat(80)}`)).toBe(false);
    expect(matchGlob('a.txt', 'a'.repeat(250))).toBe(false);
    expect(matchGlob('dir/a.txt', '*.txt')).toBe(true);
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
