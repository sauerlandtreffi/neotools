import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME } from '@neotools/engine';
import { readImageMetadata } from '../meta/read.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  layout: z.enum(['ymd', 'camera']).default('ymd'),
});

export const imageSortByDate = defineTool({
  id: 'image-sort-by-date',
  pack: 'image',
  category: 'images',
  title: { de: 'Nach Datum sortieren', en: 'Sort by date' },
  description: {
    de: 'Ordner-Struktur-Vorschlag YYYY/MM/DD plus umbenannte Kopien. Ergänzt image-exif-batch Preset sort.',
    en: 'Folder layout suggestion YYYY/MM/DD plus renamed copies. Complements image-exif-batch sort preset.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1, directory: true },
  outputs: { mime: ['image/jpeg', 'image/png', MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['exif sort', 'folder by date'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const plan: Array<{ from: string; to: string; dt: string }> = [];
    const outputs = [];
    for (const file of files) {
      ctx.progress(0.4, file.name);
      const bytes = await file.bytes();
      const meta = readImageMetadata(bytes, file.name);
      const dt = String(meta.exif.DateTimeOriginal ?? meta.exif.DateTime ?? '0000:00:00 00:00:00');
      const m = dt.match(/^(\d{4}):(\d{2}):(\d{2})/);
      const y = m?.[1] ?? '0000';
      const mo = m?.[2] ?? '00';
      const d = m?.[3] ?? '00';
      const cam = String(meta.exif.Model ?? 'camera').replace(/[^\w\-]+/g, '_').slice(0, 24);
      const folder = parsed.layout === 'camera' ? `${cam}/${y}/${mo}` : `${y}/${mo}/${d}`;
      const to = `${folder}/${stem(file.name)}${ext(file.name)}`;
      plan.push({ from: file.name, to, dt });
      outputs.push(neoFileFromBytes(to, bytes, file.mime));
    }
    outputs.push(neoFileFromBytes('sort-plan.json', new TextEncoder().encode(JSON.stringify({ plan }, null, 2)), MIME.json));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ plan }, await createProvenance('image-sort-by-date', parsed, files)),
    };
  },
});

function ext(name: string): string {
  const d = name.lastIndexOf('.');
  return d >= 0 ? name.slice(d) : '';
}
