import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { buildGobdPackage, verifyGobdPackage } from '../gobd/pack.js';

const options = z.object({
  mode: z.enum(['pack', 'verify']).default('pack'),
  convertPdfa: z.boolean().default(false),
  title: z.string().default('GoBD-Paket'),
  organization: z.string().default('Organisation'),
});

export const dachGobd = defineTool({
  id: 'dach-gobd',
  pack: 'dach',
  category: 'dach',
  title: { de: 'GoBD-Archivpaket', en: 'GoBD archive package' },
  description: {
    de: 'Belege hashen, Manifest, Index-PDF, Verfahrensdoku, ZIP (/belege /manifest /doku). Prüfmodus gegen Manifest.',
    en: 'Hash records, manifest, index PDF, procedure doc, ZIP (/belege /manifest /doku). Verify against the manifest.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1, directory: true },
  outputs: { mime: [MIME.zip, MIME.json, MIME.md] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['gobd', 'archiv', 'sha-256'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (parsed.mode === 'verify') {
      const zip = files.find((f) => /\.zip$/i.test(f.name)) ?? files[0]!;
      const result = await verifyGobdPackage(await zip.bytes());
      return {
        outputs: [neoFileFromBytes('gobd-verify.json', new TextEncoder().encode(JSON.stringify(result, null, 2)), MIME.json)],
        warnings: result.issues,
        report: attachProvenance(result, await createProvenance('dach-gobd', parsed, files)),
      };
    }
    ctx.progress(0.2, 'hash');
    const packed = await buildGobdPackage(
      await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.bytes(), origin: f.name }))),
      { convertPdfa: parsed.convertPdfa, title: parsed.title, organization: parsed.organization },
      ctx.platform,
    );
    return {
      outputs: [
        neoFileFromBytes('gobd-paket.zip', packed.zip, MIME.zip),
        neoFileFromBytes('manifest.json', new TextEncoder().encode(JSON.stringify(packed.manifest, null, 2)), MIME.json),
      ],
      warnings: [],
      report: attachProvenance({ files: packed.manifest.length }, await createProvenance('dach-gobd', parsed, files)),
    };
  },
});
