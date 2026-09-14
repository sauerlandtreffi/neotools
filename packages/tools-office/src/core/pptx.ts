import type { ZipMap } from '../util/zip.js';
import { findZip, unzipBytes, zipText } from '../util/zip.js';
import { asArray, attr, parseXml, textOf } from '../util/xml.js';
import { renderDocToPdf, type PdfRenderResult } from './pdf-render.js';
import type { Doc } from './model.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadFace } from './fonts.js';

export interface SlideShape {
  kind: 'text' | 'rect' | 'line' | 'image' | 'placeholder';
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: boolean;
}

export interface SlideModel {
  index: number;
  title: string;
  shapes: SlideShape[];
  notes: string;
}

const EMU = 914400;

function emuToPt(v: number, slideW: number, pageW: number): number {
  return (v / EMU) * 72 * (pageW / ((slideW / EMU) * 72 || 1));
}

function rec(node: unknown): Record<string, unknown> | undefined {
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined;
}

function collectText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const r = rec(node);
  if (!r) return '';
  if (r.t != null) return textOf(r.t);
  let out = '';
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('@_')) continue;
    if (k === 't') out += textOf(v);
    else out += collectText(v);
  }
  return out;
}

function parseOffExt(node: unknown): { x: number; y: number; w: number; h: number } {
  const json = JSON.stringify(node ?? {});
  const x = Number(/"x":"(-?\d+)"/.exec(json)?.[1] ?? /"@_x":"(-?\d+)"/.exec(json)?.[1] ?? 0);
  const y = Number(/"y":"(-?\d+)"/.exec(json)?.[1] ?? /"@_y":"(-?\d+)"/.exec(json)?.[1] ?? 0);
  const cx = Number(/"cx":"(-?\d+)"/.exec(json)?.[1] ?? /"@_cx":"(-?\d+)"/.exec(json)?.[1] ?? 0);
  const cy = Number(/"cy":"(-?\d+)"/.exec(json)?.[1] ?? /"@_cy":"(-?\d+)"/.exec(json)?.[1] ?? 0);
  return { x, y, w: cx, h: cy };
}

function parseSlideXml(xml: string, rels: Map<string, string>, zip: ZipMap): SlideShape[] {
  const root = rec(parseXml(xml));
  const sld = rec(root?.sld) ?? root;
  const tree = rec(sld?.cSld);
  const spTree = rec(tree?.spTree);
  const shapes: SlideShape[] = [];
  const walk = (node: unknown, kindHint?: SlideShape['kind']) => {
    const r = rec(node);
    if (!r) return;
    if (r.sp) {
      for (const sp of asArray(r.sp)) {
        const nv = rec(rec(sp)?.nvSpPr);
        const nvPr = rec(rec(nv)?.nvPr);
        const ph = rec(nvPr?.ph);
        const type = attr(ph, 'type') ?? '';
        const off = parseOffExt(sp);
        const text = collectText(rec(sp)?.txBody).trim();
        shapes.push({
          kind: 'text',
          text,
          title: type === 'ctrTitle' || type === 'title',
          ...off,
        });
      }
    }
    if (r.pic) {
      for (const pic of asArray(r.pic)) {
        const off = parseOffExt(pic);
        const json = JSON.stringify(pic);
        const embed = /"embed":"([^"]+)"/.exec(json)?.[1];
        const target = embed ? rels.get(embed) : undefined;
        let bytes: Uint8Array | undefined;
        if (target) {
          const path = target.startsWith('../') ? `ppt/${target.replace(/^\.\.\//, '')}` : `ppt/slides/${target}`;
          bytes = zip[path] ?? zip[target];
        }
        shapes.push({ kind: bytes ? 'image' : 'placeholder', ...off });
        if (bytes) (shapes[shapes.length - 1] as SlideShape & { bytes?: Uint8Array }).bytes = bytes;
      }
    }
    if (r.cxnSp || r.cxnSp === '') {
      for (const ln of asArray(r.cxnSp ?? [])) {
        shapes.push({ kind: 'line', ...parseOffExt(ln) });
      }
    }
    if (kindHint) void kindHint;
    for (const [k, v] of Object.entries(r)) {
      if (k === 'sp' || k === 'pic' || k.startsWith('@_')) continue;
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(spTree);
  return shapes;
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const root = rec(parseXml(xml));
  const rels = rec(root?.Relationships) ?? root;
  for (const rel of asArray(rels?.Relationship)) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (id && target) map.set(id, target);
  }
  return map;
}

export function readPptx(bytes: Uint8Array): SlideModel[] {
  const zip = unzipBytes(bytes);
  const pres = zipText('ppt/presentation.xml', zip);
  const presRels = parseRels(zipText('ppt/_rels/presentation.xml.rels', zip));
  const root = rec(parseXml(pres));
  const sldIdLst = rec(rec(rec(root?.presentation)?.sldIdLst));
  const ids = asArray(sldIdLst?.sldId ?? rec(root?.presentation)?.sldIdLst);
  const slideTargets: string[] = [];
  for (const id of asArray(ids)) {
    const rid = attr(id, 'id') ?? attr(id, 'r:id');
    if (rid && presRels.get(rid)) slideTargets.push(presRels.get(rid)!);
  }
  if (!slideTargets.length) {
    for (const { name } of findZip(zip, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
      slideTargets.push(name.replace(/^ppt\//, ''));
    }
    slideTargets.sort();
  }
  const slides: SlideModel[] = [];
  slideTargets.forEach((target, index) => {
    const path = target.startsWith('ppt/') ? target : `ppt/${target.replace(/^\//, '')}`;
    const xml = zipText(path, zip);
    const relPath = path.replace(/slides\/([^/]+)$/, 'slides/_rels/$1.rels');
    const rels = parseRels(zipText(relPath, zip));
    const shapes = parseSlideXml(xml, rels, zip);
    const title = shapes.find((s) => s.title && s.text)?.text ?? shapes.find((s) => s.text)?.text ?? `Folie ${index + 1}`;
    const notesName = path.replace(/slides\/slide(\d+)\.xml$/, 'notesSlides/notesSlide$1.xml');
    const notes = collectText(parseXml(zipText(notesName, zip))).trim();
    slides.push({ index, title, shapes, notes });
  });
  return slides;
}

export function slidesToMarkdown(slides: SlideModel[]): string {
  return slides
    .map((s) => {
      const body = s.shapes.filter((sh) => sh.text && !sh.title).map((sh) => `- ${sh.text}`).join('\n');
      const notes = s.notes ? `\n\n> Notizen: ${s.notes}` : '';
      return `# ${s.title}\n\n${body}${notes}`;
    })
    .join('\n\n---\n\n') + '\n';
}

export function slidesToDoc(slides: SlideModel[]): Doc {
  return {
    title: slides[0]?.title,
    blocks: slides.flatMap((s) => [
      { type: 'heading' as const, level: 1 as const, runs: [{ text: s.title, bold: true }] },
      ...s.shapes.filter((sh) => sh.text && !sh.title).map((sh) => ({ type: 'paragraph' as const, runs: [{ text: sh.text ?? '' }] })),
      ...(s.notes ? [{ type: 'paragraph' as const, runs: [{ text: `Notizen: ${s.notes}`, italic: true }] }] : []),
      { type: 'page-break' as const },
    ]),
  };
}

const SLIDE_W = 960;
const SLIDE_H = 540;

export async function slidesToPdf(slides: SlideModel[]): Promise<PdfRenderResult> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const face = await loadFace('sans', 'regular');
  const font = face ? await pdf.embedFont(face.bytes, { subset: true }) : await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const warnings: string[] = [];
  for (const slide of slides) {
    const page = pdf.addPage([SLIDE_W, SLIDE_H]);
    page.drawRectangle({ x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, color: rgb(1, 1, 1) });
    for (const sh of slide.shapes) {
      const x = (sh.x / EMU) * 72 * (SLIDE_W / 720);
      const yTop = (sh.y / EMU) * 72 * (SLIDE_H / 405);
      const w = Math.max(8, (sh.w / EMU) * 72 * (SLIDE_W / 720));
      const h = Math.max(8, (sh.h / EMU) * 72 * (SLIDE_H / 405));
      const y = SLIDE_H - yTop - h;
      if (sh.kind === 'rect') {
        page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
      } else if (sh.kind === 'line') {
        page.drawLine({ start: { x, y: y + h }, end: { x: x + w, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
      } else if (sh.kind === 'placeholder') {
        page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.8, color: rgb(0.96, 0.96, 0.96) });
      } else if (sh.kind === 'image' && 'bytes' in sh && sh.bytes instanceof Uint8Array) {
        try {
          const img = sh.bytes[0] === 0x89 ? await pdf.embedPng(sh.bytes) : await pdf.embedJpg(sh.bytes);
          page.drawImage(img, { x, y, width: w, height: h });
        } catch {
          warnings.push('PPTX-Bild nicht eingebettet.');
        }
      }
      if (sh.text) {
        const size = sh.title ? 22 : 14;
        const used = sh.title ? bold : font;
        const lines = sh.text.split(/\n/);
        let ty = y + h - size - 4;
        for (const line of lines) {
          try {
            page.drawText(line, { x: x + 4, y: ty, size, font: used, color: rgb(0.1, 0.1, 0.12), maxWidth: w - 8 });
          } catch {
            warnings.push('PPTX-Textzeichen fehlen in der Schrift.');
          }
          ty -= size * 1.3;
        }
      }
    }
  }
  if (!slides.length) pdf.addPage([SLIDE_W, SLIDE_H]);
  const bytes = await pdf.save({ updateFieldAppearances: false });
  return { bytes, pageCount: pdf.getPageCount(), warnings };
}

export async function slidesToFallbackPdf(slides: SlideModel[]): Promise<PdfRenderResult> {
  return renderDocToPdf(slidesToDoc(slides), { page: 'a4', landscape: true });
}

void emuToPt;
