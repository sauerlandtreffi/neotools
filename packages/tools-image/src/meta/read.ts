import { parseJpeg, parsePng, parseTiff } from '@neotools/parsers';
import { extractJpegMeta, extractWebpMeta, readPngSidecar } from '../codec/meta-embed.js';
import { detectFormat } from '../codec/detect.js';
import { parseExistingExif } from './exif-write.js';

export interface ImageMetadataReport {
  format?: string;
  width?: number;
  height?: number;
  exif: Record<string, unknown>;
  iptc: boolean;
  xmp?: string;
  icc: boolean;
  gps?: { lat?: number; lon?: number; maps: string };
  software?: string;
  serial?: string;
  thumbnail: boolean;
  raw: Record<string, unknown>;
}

export function readImageMetadata(bytes: Uint8Array, name = ''): ImageMetadataReport {
  const format = detectFormat(bytes, name);
  const report: ImageMetadataReport = {
    format,
    exif: {},
    iptc: false,
    icc: false,
    thumbnail: false,
    raw: {},
  };
  if (format === 'jpeg') {
    const jpeg = parseJpeg(bytes);
    const side = extractJpegMeta(bytes);
    report.icc = Boolean(side.icc);
    report.iptc = Boolean(jpeg?.hasIptc);
    report.xmp = jpeg?.xmp;
    report.width = jpeg?.sof?.width;
    report.height = jpeg?.sof?.height;
    const t = jpeg?.exif;
    fillFromTiff(report, t);
    report.thumbnail = Boolean(t?.thumbnail);
    report.raw = { segments: jpeg?.segments.map((s) => s.note ?? s.name) };
  } else if (format === 'png' || format === 'apng') {
    const png = parsePng(bytes);
    const side = readPngSidecar(bytes);
    report.width = png?.width;
    report.height = png?.height;
    report.icc = Boolean(side.icc);
    report.xmp = png?.texts.find((t) => /xmp/i.test(t.key))?.value;
    fillFromTiff(report, parseExistingExif(side.exif));
    report.raw = { texts: png?.texts, chunks: png?.chunks.map((c) => c.type) };
  } else if (format === 'webp') {
    const side = extractWebpMeta(bytes);
    report.icc = Boolean(side.icc);
    report.xmp = side.xmp;
    fillFromTiff(report, parseExistingExif(side.exif));
  } else if (format === 'tiff') {
    const t = parseTiff(bytes);
    report.width = t?.imageWidth;
    report.height = t?.imageHeight;
    fillFromTiff(report, t);
  }
  return report;
}

function fillFromTiff(report: ImageMetadataReport, t?: ReturnType<typeof parseTiff>): void {
  if (!t) return;
  report.software = t.software;
  report.serial = t.serial;
  if (t.gps && (t.gps.lat !== undefined || t.gps.lon !== undefined)) {
    const lat = t.gps.lat;
    const lon = t.gps.lon;
    report.gps = {
      lat,
      lon,
      maps:
        lat !== undefined && lon !== undefined
          ? `https://maps.google.com/?q=${lat},${lon}`
          : '',
    };
  }
  report.thumbnail = Boolean(t.thumbnail);
  for (const ifd of t.ifds) {
    for (const tag of ifd.tags) {
      if (typeof tag.value === 'string' || typeof tag.value === 'number') report.exif[tag.name] = tag.value;
    }
  }
  if (t.datetime) report.exif.DateTime = t.datetime;
  if (t.make) report.exif.Make = t.make;
  if (t.model) report.exif.Model = t.model;
  if (t.software) report.exif.Software = t.software;
}
