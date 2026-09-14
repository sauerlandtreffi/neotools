import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes, mimeFromName } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { readAny } from '../zip-tar.js';
import { matchGlob } from '../path-safe.js';

const options = z.object({
  password: z.string().default(''),
  glob: z.string().default('**'),
});

export const archiveExtract = defineTool({
  id: 'archive-extract',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Archiv entpacken', en: 'Extract archive' },
  description: {
    de: 'ZIP/TAR/GZ entpacken. Zip-Slip (../) wird blockiert. Andere Formate: libarchive.js dynamisch.',
    en: 'Extract ZIP/TAR/GZ. Zip-Slip (../) is blocked. Other formats: libarchive.js dynamically.',
  },
  inputs: { accept: [MIME.zip, 'application/x-tar', 'application/gzip', 'application/x-7z-compressed', '*/*'], multiple: false, min: 1 },
  outputs: { mime: ['*/*'] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['unzip', 'entpacken'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    ctx.progress(0.3, file.name);
    const { files: inner, warnings, blocked } = await readAny(await file.bytes(), file.name, parsed.password || undefined);
    const outputs = [];
    for (const [name, data] of Object.entries(inner)) {
      if (!matchGlob(name, parsed.glob)) continue;
      outputs.push(neoFileFromBytes(name.replace(/\//g, '__'), data, mimeFromName(name)));
    }
    return {
      outputs,
      warnings: [...warnings, ...blocked.map((b) => `blockiert (Zip-Slip): ${b}`)],
      report: attachProvenance({ extracted: outputs.length, blocked }, await createProvenance('archive-extract', parsed, files)),
    };
  },
});
