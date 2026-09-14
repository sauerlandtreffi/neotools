import { identifyBytes, type Identification } from '../identify/identify.js';
import { parseJpeg } from '../parsers/jpeg.js';
import { parsePng } from '../parsers/png.js';
import { parseIsoBmff } from '../parsers/isobmff.js';
import { parseMatroska } from '../parsers/matroska.js';
import { parseMp3 } from '../parsers/mp3.js';
import { parseRiff } from '../parsers/riff.js';
import { parsePdfRaw } from '../parsers/pdf-raw.js';
import { inspectPdfHigh } from '../parsers/pdf-high.js';
import { parseOffice } from '../parsers/office.js';
import { listZipEntries } from '../parsers/zip.js';

export interface AutopsyNode {
  type: string;
  name: string;
  offset?: number;
  size?: number;
  attrs?: Record<string, unknown>;
  children?: AutopsyNode[];
}

export interface AutopsyReport {
  file: string;
  identify: Identification;
  format: string;
  tree: AutopsyNode;
  summary: Record<string, unknown>;
}

function boxesToNodes(
  boxes: Array<{ type: string; offset: number; size: number; attrs?: Record<string, unknown>; children?: unknown[] }>,
): AutopsyNode[] {
  return boxes.map((b) => ({
    type: 'box',
    name: b.type,
    offset: b.offset,
    size: b.size,
    attrs: b.attrs,
    children: b.children ? boxesToNodes(b.children as typeof boxes) : undefined,
  }));
}

export async function autopsyBytes(bytes: Uint8Array, name: string, mime?: string): Promise<AutopsyReport> {
  const identify = identifyBytes(bytes, name, mime);
  const id = identify.primary?.id ?? 'unknown';
  const root: AutopsyNode = { type: 'file', name, size: bytes.length, attrs: { format: id } };
  const summary: Record<string, unknown> = { format: id, size: bytes.length };

  if (id === 'jpeg') {
    const jpeg = parseJpeg(bytes);
    if (jpeg) {
      root.children = jpeg.segments.map((s) => ({
        type: 'segment',
        name: s.name,
        offset: s.offset,
        size: s.length,
        attrs: s.note ? { note: s.note } : undefined,
      }));
      summary.progressive = jpeg.progressive;
      summary.scans = jpeg.scans;
      summary.quantizationTables = jpeg.quantizationTables;
      summary.exif = Boolean(jpeg.exif);
      summary.xmp = jpeg.hasXmp;
      summary.icc = jpeg.hasIcc;
      summary.iptc = jpeg.hasIptc;
      summary.photoshop = jpeg.hasPhotoshop;
      summary.bytesAfterEoi = jpeg.bytesAfterEoi;
      summary.sof = jpeg.sof;
      if (jpeg.exif) {
        summary.exifTags = {
          software: jpeg.exif.software,
          make: jpeg.exif.make,
          model: jpeg.exif.model,
          gps: jpeg.exif.gps,
          thumbnail: Boolean(jpeg.exif.thumbnail),
        };
      }
    }
  } else if (id === 'png') {
    const png = parsePng(bytes);
    if (png) {
      root.children = png.chunks.map((c) => ({
        type: 'chunk',
        name: c.type,
        offset: c.offset,
        size: c.length,
        attrs: c.text ? { text: c.text } : undefined,
      }));
      summary.width = png.width;
      summary.height = png.height;
      summary.texts = png.texts;
      summary.hasExif = png.hasExif;
      summary.bytesAfterIend = png.bytesAfterIend;
    }
  } else if (id === 'pdf') {
    const raw = parsePdfRaw(bytes);
    const high = await inspectPdfHigh(bytes);
    root.children = [];
    if (raw) {
      root.children.push({
        type: 'pdf-raw',
        name: 'raw',
        attrs: {
          version: raw.version,
          eofCount: raw.eofOffsets.length,
          incrementalUpdates: raw.incrementalUpdates,
          encrypted: raw.encrypted,
          objects: raw.objects.length,
        },
        children: raw.objects.slice(0, 80).map((o) => ({
          type: 'obj',
          name: o.id,
          offset: o.offset,
          size: o.length,
          attrs: { stream: o.hasStream, filters: o.filters },
        })),
      });
      summary.raw = {
        version: raw.version,
        eofOffsets: raw.eofOffsets,
        incrementalUpdates: raw.incrementalUpdates,
        bytesAfterLastEof: raw.bytesAfterLastEof,
        encrypted: raw.encrypted,
        linearized: raw.linearized,
        objectCount: raw.objects.length,
        catalogHints: raw.catalogHints,
      };
    }
    if (high) {
      root.children.push({
        type: 'catalog',
        name: 'catalog',
        attrs: {
          pages: high.pageCount,
          keys: high.catalogKeys,
          js: high.hasJavaScript,
          embedded: high.hasEmbeddedFiles,
          ocg: high.hasOcg,
          encrypt: high.hasEncrypt,
        },
        children: [
          { type: 'fonts', name: 'fonts', attrs: { list: high.fonts } },
          { type: 'xobjects', name: 'xobjects', attrs: { list: high.xobjects } },
          { type: 'info', name: 'info', attrs: high.info },
        ],
      });
      summary.high = {
        pageCount: high.pageCount,
        info: high.info,
        fonts: high.fonts,
        xobjects: high.xobjects,
        hasJavaScript: high.hasJavaScript,
        hasEmbeddedFiles: high.hasEmbeddedFiles,
        hasOpenAction: high.hasOpenAction,
        hasOcg: high.hasOcg,
        annotationCount: high.annotationCount,
        producer: high.producer,
        creator: high.creator,
      };
    }
  } else if (
    id === 'zip' ||
    id === 'docx' ||
    id === 'xlsx' ||
    id === 'pptx' ||
    id === 'odt' ||
    id === 'ods' ||
    id === 'odp' ||
    id === 'epub' ||
    id === 'jar' ||
    id === 'apk' ||
    id === 'ooxml'
  ) {
    const office = parseOffice(bytes);
    const zip = listZipEntries(bytes);
    root.children = zip.entries.map((e) => ({
      type: 'entry',
      name: e.name,
      offset: e.localOffset,
      size: e.uncompressedSize,
      attrs: { method: e.method, compressed: e.compressedSize, crc: e.crc },
    }));
    summary.zip = {
      entries: zip.entries.length,
      comment: zip.comment,
      bytesAfterEocd: zip.bytesAfterEocd,
      zip64: zip.zip64,
    };
    if (office && office.kind !== 'zip') {
      summary.office = {
        kind: office.kind,
        core: office.core,
        app: office.app,
        comments: office.comments,
        trackChanges: office.trackChanges,
        macros: office.macros,
        ole: office.ole,
        externalLinks: office.externalLinks,
      };
    }
  } else if (['mp4', 'mov', 'm4a', 'm4b', 'm4v', '3gp', '3g2', 'heic', 'heif', 'avif', 'iso-bmff', 'cr3'].includes(id)) {
    const iso = parseIsoBmff(bytes);
    if (iso) {
      root.children = boxesToNodes(iso.boxes);
      summary.brands = iso.brands;
      summary.tracks = iso.tracks;
      summary.duration = iso.duration;
      summary.timescale = iso.timescale;
      summary.metadata = iso.metadata;
    }
  } else if (id === 'matroska' || id === 'webm') {
    const mkv = parseMatroska(bytes);
    if (mkv) {
      const toNode = (n: (typeof mkv.nodes)[number]): AutopsyNode => ({
        type: 'ebml',
        name: n.name,
        offset: n.offset,
        size: n.size,
        attrs: n.value !== undefined ? { value: n.value } : undefined,
        children: n.children?.map(toNode),
      });
      root.children = mkv.nodes.map(toNode);
      summary.docType = mkv.docType;
    }
  } else if (id === 'mp3') {
    const mp3 = parseMp3(bytes);
    if (mp3) {
      root.children = [];
      if (mp3.id3) {
        root.children.push({
          type: 'id3',
          name: `ID3v${mp3.id3.version}`,
          size: mp3.id3.size,
          children: mp3.id3.frames.map((f) => ({
            type: 'frame',
            name: f.id,
            offset: f.offset,
            size: f.size,
            attrs: f.preview ? { preview: f.preview } : undefined,
          })),
        });
      }
      if (mp3.mpeg) root.children.push({ type: 'mpeg', name: 'frame', attrs: mp3.mpeg });
      if (mp3.xing) root.children.push({ type: 'xing', name: 'Xing/LAME', attrs: mp3.xing });
      summary.mp3 = mp3;
    }
  } else if (id === 'wav' || id === 'avi' || id === 'webp') {
    const riff = parseRiff(bytes);
    if (riff) {
      root.children = riff.chunks.map((c) => ({ type: 'chunk', name: c.id, offset: c.offset, size: c.size }));
      summary.form = riff.form;
      summary.wav = riff.wav;
    }
  }

  return { file: name, identify, format: id, tree: root, summary };
}

export function autopsyMarkdown(reports: AutopsyReport[], locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# File-Autopsy\n' : '# File autopsy\n'];
  for (const r of reports) {
    lines.push(`## ${r.file}\n`);
    lines.push(`- **Format:** ${r.format}`);
    lines.push(`- **Size:** ${r.identify.size}`);
    const prim = r.identify.primary;
    if (prim) lines.push(`- **MIME:** ${prim.mime}`);
    lines.push(locale === 'de' ? `\n### Zusammenfassung\n` : `\n### Summary\n`);
    lines.push('```json');
    lines.push(JSON.stringify(r.summary, null, 2));
    lines.push('```\n');
    lines.push(locale === 'de' ? `### Baum (Auszug)\n` : `### Tree (excerpt)\n`);
    const walk = (n: AutopsyNode, depth: number) => {
      if (depth > 3) return;
      const pad = '  '.repeat(depth);
      lines.push(`${pad}- ${n.type}:${n.name}${n.size !== undefined ? ` (${n.size})` : ''}`);
      for (const c of n.children ?? []) walk(c, depth + 1);
    };
    walk(r.tree, 0);
    lines.push('');
  }
  return lines.join('\n');
}
