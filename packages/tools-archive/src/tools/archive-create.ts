import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { createTar, createTarGz, createZip } from '../zip-tar.js';
import { gatherFiles } from '../walk.js';

const options = z.object({
  format: z.enum(['zip', 'tar', 'tgz']).default('zip'),
  level: z.coerce.number().int().min(0).max(9).default(6),
  password: z.string().default(''),
  outputName: z.string().default('archive'),
  rootPath: z.string().default(''),
});

export const archiveCreate = defineTool({
  id: 'archive-create',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Archiv erstellen', en: 'Create archive' },
  description: {
    de: 'ZIP / TAR / TAR.GZ erstellen (fflate). 7z-Schreiben nur mit optionalem 7z-wasm (LGPL, dynamisch). ZIP-AES-Passwort via zip.js.',
    en: 'Create ZIP / TAR / TAR.GZ (fflate). 7z write needs optional 7z-wasm (LGPL, dynamic). ZIP-AES password via zip.js.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 0, directory: true },
  outputs: { mime: [MIME.zip, 'application/x-tar', 'application/gzip'] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['zip', 'tar', 'archiv'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const all = await gatherFiles(files, parsed.rootPath);
    if (!all.length) return { outputs: [], warnings: ['Keine Dateien.'], report: {} };
    const map: Record<string, Uint8Array> = {};
    for (const f of all) map[f.name] = await f.bytes();
    ctx.progress(0.5, parsed.format);
    let bytes: Uint8Array;
    let name = parsed.outputName;
    let mime: string = MIME.zip;
    if (parsed.format === 'zip') {
      if (parsed.password) {
        const zip = await import('@zip.js/zip.js');
        const blobWriter = new zip.BlobWriter('application/zip');
        const writer = new zip.ZipWriter(blobWriter, { password: parsed.password, encryptionStrength: 3 });
        for (const [n, data] of Object.entries(map)) {
          await writer.add(n, new zip.Uint8ArrayReader(data));
        }
        await writer.close();
        bytes = new Uint8Array(await (await blobWriter.getData()).arrayBuffer());
      } else bytes = createZip(map, parsed.level);
      if (!name.endsWith('.zip')) name += '.zip';
    } else if (parsed.format === 'tar') {
      bytes = createTar(map);
      mime = 'application/x-tar';
      if (!name.endsWith('.tar')) name += '.tar';
    } else {
      bytes = createTarGz(map, parsed.level);
      mime = 'application/gzip';
      if (!/\.t(ar\.)?gz$/i.test(name)) name += '.tar.gz';
    }
    return {
      outputs: [neoFileFromBytes(name, bytes, mime)],
      warnings: parsed.format === 'zip' && parsed.password ? ['ZIP mit AES-Passwort (zip.js).'] : [],
      report: attachProvenance({ files: all.length, format: parsed.format }, await createProvenance('archive-create', parsed, files)),
    };
  },
});
