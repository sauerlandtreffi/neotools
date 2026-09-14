import { z } from 'zod';
import {
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
  type NeoFile,
  type VerificationReport,
} from '@neotools/engine';
import { detectFormat } from '../codec/detect.js';
import { decode } from '../codec/decode.js';
import { encode } from '../codec/encode.js';
import { embedJpegMeta, embedPngMeta, embedWebpMeta, stripJpegSegments } from '../codec/meta-embed.js';
import { MIME } from '@neotools/engine';
import { readImageMetadata } from '../meta/read.js';
import { buildExifTiff, buildXmp, formatOffset, shiftExifDate } from '../meta/exif-write.js';
import { jpegApp1Exif } from '../codec/meta-embed.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, outName, stem } from './common.js';

const options = z.object({
  mode: z.enum(['read', 'strip-all', 'strip-gps', 'strip-software', 'edit']).default('read'),
  copyright: z.string().optional(),
  artist: z.string().optional(),
  description: z.string().optional(),
  datetimeOriginal: z.string().optional(),
  timezoneHours: z.coerce.number().min(-14).max(14).default(0),
});

function wantedMissing(mode: string): string[] {
  if (mode === 'strip-all') return ['Software', 'gps', 'xmp', 'serial', 'thumbnail'];
  if (mode === 'strip-gps') return ['gps'];
  if (mode === 'strip-software') return ['Software', 'serial'];
  return [];
}

async function applyStrip(bytes: Uint8Array, name: string, mode: string): Promise<Uint8Array> {
  const format = detectFormat(bytes, name);
  if (format === 'jpeg') {
    const drop = new Set<string>();
    if (mode === 'strip-all') {
      drop.add('Exif');
      drop.add('XMP');
      drop.add('ICC');
      drop.add('IPTC');
    } else if (mode === 'strip-gps' || mode === 'strip-software') {
      drop.add('Exif');
    }
    return stripJpegSegments(bytes, drop);
  }
  const img = await decode({ bytes, name });
  if (format === 'png') return embedPngMeta(img.data, img.width, img.height, {});
  if (format === 'webp') return embedWebpMeta(await encode(img, 'webp', { quality: 90, keepMetadata: false }), { strip: true });
  if (!format || format === 'heic' || format === 'svg') {
    return encode(img, 'png', { keepMetadata: false, quality: 90 });
  }
  return encode(img, format, { keepMetadata: false, quality: 90 });
}

export const imageMetadata = defineTool({
  id: 'image-metadata',
  pack: 'image',
  category: 'images',
  title: { de: 'Metadaten lesen / editieren / entfernen', en: 'Read / edit / strip metadata' },
  description: {
    de: 'EXIF, IPTC, XMP, ICC, GPS (Dezimal + Karten-Link als Text). Strip-Presets und gezieltes Setzen inkl. Urlaubs-Zeitzone. Danach Verifikation.',
    en: 'EXIF, IPTC, XMP, ICC, GPS (decimal + map link as text). Strip presets and targeted edits including vacation timezone. Then verify.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: [MIME.json, 'image/jpeg', 'image/png'] },
  options,
  presets: [
    { id: 'read', title: { de: 'Lesen', en: 'Read' }, options: { mode: 'read' } },
    { id: 'strip-all', title: { de: 'Alles entfernen', en: 'Strip all' }, options: { mode: 'strip-all' } },
    { id: 'strip-gps', title: { de: 'Nur GPS', en: 'GPS only' }, options: { mode: 'strip-gps' } },
    { id: 'edit', title: { de: 'Editieren', en: 'Edit' }, options: { mode: 'edit' } },
  ],
  privacySensitive: true,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['exif', 'gps entfernen', 'metadaten'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: NeoFile[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const bytes = await file.bytes();
      const before = readImageMetadata(bytes, file.name);
      if (parsed.mode === 'read') {
        const json = neoFileFromBytes(
          `${stem(file.name)}-metadata.json`,
          new TextEncoder().encode(JSON.stringify(before, null, 2)),
          MIME.json,
        );
        outputs.push(json);
        reports.push({ file: file.name, before });
        return json;
      }
      if (parsed.mode === 'edit') {
        const dt = parsed.datetimeOriginal || (typeof before.exif.DateTime === 'string' ? before.exif.DateTime : undefined);
        const shifted = dt && parsed.timezoneHours ? shiftExifDate(dt, parsed.timezoneHours) : dt;
        const tiff = buildExifTiff({
          copyright: parsed.copyright,
          artist: parsed.artist,
          description: parsed.description,
          datetimeOriginal: shifted,
          datetime: shifted,
          offsetTimeOriginal: parsed.timezoneHours ? formatOffset(parsed.timezoneHours) : undefined,
        });
        const xmp = buildXmp({
          copyright: parsed.copyright,
          artist: parsed.artist,
          description: parsed.description,
          datetimeOriginal: shifted,
        });
        const format = detectFormat(bytes, file.name);
        let out = bytes;
        if (format === 'jpeg') out = embedJpegMeta(bytes, { exif: jpegApp1Exif(tiff), xmp });
        else if (format === 'png') {
          const img = await decode({ bytes, name: file.name });
          out = embedPngMeta(img.data, img.width, img.height, { exif: tiff, xmp });
        } else if (format === 'webp') {
          out = embedWebpMeta(bytes, { exif: tiff, xmp });
        }
        outputs.push(neoFileFromBytes(outName(file.name, format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png'), out, file.mime));
        reports.push({ file: file.name, before, after: readImageMetadata(out, file.name) });
        return out;
      }
      const out = await applyStrip(bytes, file.name, parsed.mode);
      outputs.push(neoFileFromBytes(file.name, out, file.mime));
      reports.push({ file: file.name, before, after: readImageMetadata(out, file.name) });
      return out;
    });
    const provenance = await createProvenance('image-metadata', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports, strip: wantedMissing(parsed.mode) }, provenance),
    };
  },
  async verify(_ctx, outputs, opts) {
    const parsed = options.parse(opts);
    const missing = wantedMissing(parsed.mode);
    if (parsed.mode === 'read' || parsed.mode === 'edit') {
      return { passed: true, checks: [{ id: 'skip-read', passed: true, detail: 'Kein Strip.' }] };
    }
    const checks: VerificationReport['checks'] = [];
    for (const file of outputs) {
      if (!file.mime.startsWith('image/')) continue;
      const meta = readImageMetadata(await file.bytes(), file.name);
      if (missing.includes('gps')) {
        checks.push({ id: `${file.name}:gps`, passed: !meta.gps, detail: meta.gps ? `GPS noch da ${meta.gps.lat},${meta.gps.lon}` : 'kein GPS' });
      }
      if (missing.includes('Software')) {
        checks.push({ id: `${file.name}:software`, passed: !meta.software, detail: meta.software ?? 'kein Software-Tag' });
      }
      if (missing.includes('serial')) {
        checks.push({ id: `${file.name}:serial`, passed: !meta.serial, detail: meta.serial ?? 'keine Seriennummer' });
      }
      if (missing.includes('xmp')) {
        checks.push({ id: `${file.name}:xmp`, passed: !meta.xmp, detail: meta.xmp ? 'XMP vorhanden' : 'kein XMP' });
      }
      if (missing.includes('thumbnail')) {
        checks.push({ id: `${file.name}:thumb`, passed: !meta.thumbnail, detail: meta.thumbnail ? 'Thumbnail vorhanden' : 'kein Thumbnail' });
      }
    }
    return { passed: checks.every((c) => c.passed), checks };
  },
});
