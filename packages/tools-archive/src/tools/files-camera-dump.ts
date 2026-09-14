import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes, mimeFromName } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { datedName, sidecarGroups } from '../camera.js';
import { gatherFiles } from '../walk.js';
import { readAny } from '../zip-tar.js';

const options = z.object({
  mode: z.enum(['flatten', 'sidecar']).default('flatten'),
  rootPath: z.string().default(''),
});

export const filesCameraDump = defineTool({
  id: 'files-camera-dump',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Kamera-Dump entfalten', en: 'Flatten camera dump' },
  description: {
    de: 'DCIM-Verschachtelung aufheben, datierte Namen aus EXIF, Sidecar-Paare JPG+RAW+XMP zusammenhalten.',
    en: 'Flatten DCIM trees, date names from EXIF, keep JPG+RAW+XMP sidecar groups together.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1, directory: true },
  outputs: { mime: ['*/*', MIME.json] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['dcim', 'sidecar', 'exif'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    let all = await gatherFiles(files, parsed.rootPath);
    if (all.length === 1 && /\.(zip|tar|tgz|tar\.gz)$/i.test(all[0]!.name)) {
      const inner = await readAny(await all[0]!.bytes(), all[0]!.name);
      all = Object.entries(inner.files).map(([n, b]) => neoFileFromBytes(n, b, mimeFromName(n)));
    }
    const outputs = [];
    const groups = sidecarGroups(all.map((f) => f.name));
    if (parsed.mode === 'sidecar') {
      for (const g of groups) {
        for (const name of g) {
          const f = all.find((x) => x.name === name);
          if (!f) continue;
          const bytes = await f.bytes();
          outputs.push(neoFileFromBytes(datedName(name, bytes), bytes, f.mime));
        }
      }
    } else {
      for (const f of all) {
        ctx.progress(0.5, f.name);
        const bytes = await f.bytes();
        outputs.push(neoFileFromBytes(datedName(f.name, bytes), bytes, f.mime));
      }
    }
    outputs.push(neoFileFromBytes('sidecars.json', new TextEncoder().encode(JSON.stringify({ groups }, null, 2)), MIME.json));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ files: all.length, groups: groups.length }, await createProvenance('files-camera-dump', parsed, files)),
    };
  },
});
