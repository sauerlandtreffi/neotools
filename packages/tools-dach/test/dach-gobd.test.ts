import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createToolContext, MIME, neoFileFromBytes } from '@neotools/engine';
import { buildGobdPackage, verifyGobdPackage } from '../src/gobd/pack.js';
import { dachGobd } from '../src/tools/dach-gobd.js';

describe('GoBD package', () => {
  it('pack verifies green; tampered file is red', async () => {
    const ctx = createToolContext();
    const packed = await buildGobdPackage(
      [{ name: 'beleg.txt', bytes: new TextEncoder().encode('ok'), origin: 'upload' }],
      { convertPdfa: false, title: 'Test', organization: 'Muster' },
      ctx.platform,
    );
    const ok = await verifyGobdPackage(packed.zip);
    expect(ok.ok).toBe(true);

    const files = unzipSync(packed.zip);
    expect(files['belege/beleg.txt']).toBeTruthy();
    expect(files['manifest/manifest.json']).toBeTruthy();
    expect(strFromU8(files['doku/verfahrensdokumentation.md']!)).toContain('Verfahrensdokumentation');
    expect(files['index.pdf']?.[0]).toBe(0x25);

    files['belege/beleg.txt'] = new TextEncoder().encode('tampered');
    const { zipSync } = await import('fflate');
    const bad = zipSync(files);
    const red = await verifyGobdPackage(bad);
    expect(red.ok).toBe(false);
    expect(red.issues.join(' ')).toMatch(/Hash|abweichend/i);
  });

  it('tool pack + verify modes', async () => {
    const ctx = createToolContext();
    const pack = await dachGobd.run(ctx, [neoFileFromBytes('a.txt', new TextEncoder().encode('x'), MIME.txt)], {
      mode: 'pack',
      convertPdfa: false,
      title: 'P',
      organization: 'O',
    });
    const zip = pack.outputs.find((o) => o.name.endsWith('.zip'))!;
    const verify = await dachGobd.run(ctx, [zip], { mode: 'verify', convertPdfa: false, title: 'P', organization: 'O' });
    const body = JSON.parse(new TextDecoder().decode(await verify.outputs[0]!.bytes())) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
