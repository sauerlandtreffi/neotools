import { z } from 'zod';
import { defineTool, neoFileFromBytes, attachProvenance, createProvenance, mapFiles } from '@neotools/engine';
import { readImageMetadata } from '../meta/read.js';
import { shiftExifDate } from '../meta/exif-write.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, stem } from './common.js';

const options = z.object({
  preset: z.enum(['rename', 'tz', 'sort']).default('rename'),
  pattern: z.string().default('{YYYY}-{MM}-{DD}_{HH}{mm}{ss}_{camera}'),
  timezoneHours: z.coerce.number().min(-14).max(14).default(0),
});

function applyPattern(pattern: string, dt: string, camera: string): string {
  const m = dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  const YYYY = m?.[1] ?? '0000';
  const MM = m?.[2] ?? '00';
  const DD = m?.[3] ?? '00';
  const HH = m?.[4] ?? '00';
  const mm = m?.[5] ?? '00';
  const ss = m?.[6] ?? '00';
  const cam = (camera || 'camera').replace(/[^\w\-]+/g, '_').slice(0, 32);
  return pattern
    .replace(/\{YYYY\}/g, YYYY)
    .replace(/\{MM\}/g, MM)
    .replace(/\{DD\}/g, DD)
    .replace(/\{HH\}/g, HH)
    .replace(/\{mm\}/g, mm)
    .replace(/\{ss\}/g, ss)
    .replace(/\{camera\}/g, cam);
}

function extOf(name: string): string {
  const d = name.lastIndexOf('.');
  return d >= 0 ? name.slice(d) : '';
}

export const imageExifBatch = defineTool({
  id: 'image-exif-batch',
  pack: 'image',
  category: 'images',
  title: { de: 'EXIF-Stapel', en: 'EXIF batch' },
  description: {
    de: 'Umbenennen nach EXIF-Datum/Kamera, Zeitzone korrigieren, nach Datum/Kamera sortieren. Ausgabe = umbenannte Kopien.',
    en: 'Rename from EXIF date/camera, timezone shift, sort by date/camera. Output = renamed copies.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/jpeg', 'image/png'] },
  options,
  presets: [
    { id: 'rename', title: { de: 'Umbenennen', en: 'Rename' }, options: { preset: 'rename' } },
    { id: 'tz', title: { de: 'Zeitzone', en: 'Timezone' }, options: { preset: 'tz' } },
    { id: 'sort', title: { de: 'Sortieren', en: 'Sort' }, options: { preset: 'sort' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['exif umbenennen', 'zeitzone'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const used = new Map<string, number>();
    const rows: Array<{ file: string; name: string; dt: string; bytes: Uint8Array; mime: string }> = [];
    await mapFiles(files, async (file, i) => {
      ctx.progress(i / files.length, file.name);
      const bytes = await file.bytes();
      const meta = readImageMetadata(bytes, file.name);
      let dt = typeof meta.exif.DateTimeOriginal === 'string' ? meta.exif.DateTimeOriginal : typeof meta.exif.DateTime === 'string' ? meta.exif.DateTime : '';
      if (parsed.timezoneHours && dt) dt = shiftExifDate(dt, parsed.timezoneHours);
      const camera = String(meta.exif.Model ?? meta.exif.Make ?? 'camera');
      let name = parsed.preset === 'rename' || parsed.preset === 'sort' ? applyPattern(parsed.pattern, dt || '0000:00:00 00:00:00', camera) : stem(file.name);
      const ext = extOf(file.name) || '.jpg';
      const n = (used.get(name) ?? 0) + 1;
      used.set(name, n);
      if (n > 1) name = `${name}_${n}`;
      rows.push({ file: file.name, name: name + ext, dt, bytes, mime: file.mime });
    });
    if (parsed.preset === 'sort') {
      rows.sort((a, b) => a.dt.localeCompare(b.dt) || a.name.localeCompare(b.name));
    }
    const outputs = rows.map((r) => neoFileFromBytes(r.name, r.bytes, r.mime));
    const provenance = await createProvenance('image-exif-batch', parsed, files);
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ renamed: rows.map((r) => ({ from: r.file, to: r.name, dt: r.dt })) }, provenance),
    };
  },
});
