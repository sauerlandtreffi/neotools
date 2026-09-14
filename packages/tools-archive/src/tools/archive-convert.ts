import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { createTarGz, createZip, readAny } from '../zip-tar.js';

const options = z.object({
  target: z.enum(['zip', 'tgz']).default('zip'),
});

export const archiveConvert = defineTool({
  id: 'archive-convert',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Archiv konvertieren', en: 'Convert archive' },
  description: {
    de: 'ZIP ↔ TAR.GZ (nativ). 7z nur wenn libarchive/7z-wasm dynamisch geladen werden kann.',
    en: 'ZIP ↔ TAR.GZ (native). 7z only if libarchive/7z-wasm can be loaded dynamically.',
  },
  inputs: { accept: ['*/*'], multiple: false, min: 1 },
  outputs: { mime: [MIME.zip, 'application/gzip'] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['zip to tar', 'archiv konvertieren'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const { files: inner, warnings } = await readAny(await file.bytes(), file.name);
    if (!Object.keys(inner).length) {
      return { outputs: [], warnings: warnings.length ? warnings : ['Nichts zu konvertieren (7z/RAR ohne libarchive).'], report: {} };
    }
    ctx.progress(0.6, parsed.target);
    const bytes = parsed.target === 'zip' ? createZip(inner) : createTarGz(inner);
    const name = parsed.target === 'zip' ? 'converted.zip' : 'converted.tar.gz';
    const mime = parsed.target === 'zip' ? MIME.zip : 'application/gzip';
    return {
      outputs: [neoFileFromBytes(name, bytes, mime)],
      warnings,
      report: attachProvenance({ target: parsed.target, files: Object.keys(inner).length }, await createProvenance('archive-convert', parsed, files)),
    };
  },
});
