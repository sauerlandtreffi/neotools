import { PDFDocument, PDFName } from 'pdf-lib';
import { inspectPdf } from '@neotools/tools-pdf';
import { openPdfjsDocument } from '../pdfjs.js';
import { ervRuleset } from './rules-data.js';

export type Light = 'green' | 'yellow' | 'red';

export interface RuleResult {
  id: string;
  source: string;
  severity: 'error' | 'warning' | 'hint';
  title: { de: string; en: string };
  light: Light;
  detail: { de: string; en: string };
}

export interface ErvReport {
  ruleset: { id: string; version: string; sources: typeof ervRuleset.sources };
  files: Array<{ name: string; size: number; results: RuleResult[] }>;
  overall: Light;
  autoFixPipeline: { steps: Array<{ toolId: string; options: unknown }> };
}

function lightOf(ok: boolean, severity: RuleResult['severity']): Light {
  if (ok) return 'green';
  if (severity === 'error') return 'red';
  if (severity === 'warning') return 'yellow';
  return 'yellow';
}

function worst(lights: Light[]): Light {
  if (lights.includes('red')) return 'red';
  if (lights.includes('yellow')) return 'yellow';
  return 'green';
}

function hasEncrypt(bytes: Uint8Array): boolean {
  const s = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1_000_000)));
  return /\/Encrypt[\s/]/.test(s);
}

async function hasTextLayer(bytes: Uint8Array): Promise<boolean> {
  try {
    const pdf = await openPdfjsDocument(bytes);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    await pdf.destroy();
    return content.items.some((it: unknown) => {
      const str = (it as { str?: string }).str;
      return typeof str === 'string' && str.trim().length > 0;
    });
  } catch {
    return false;
  }
}

function isA4(w: number, h: number): boolean {
  const a4w = 595.28;
  const a4h = 841.89;
  return (Math.abs(w - a4w) < 8 && Math.abs(h - a4h) < 8) || (Math.abs(w - a4h) < 8 && Math.abs(h - a4w) < 8);
}

export const AUTO_FIX_PIPELINE = {
  steps: [
    { toolId: 'pdf-sanitize', options: { removeAnnotations: false, flattenForms: true } },
    { toolId: 'pdf-forms', options: { mode: 'read', flatten: true } },
    { toolId: 'pdf-a', options: { mode: 'convert', profile: '2b', rasterizeFallback: false } },
    { toolId: 'pdf-split', options: { mode: 'each-page', maxSizeMb: 200 } },
  ],
};

export async function checkErvFiles(
  files: Array<{ name: string; size: number; bytes: Uint8Array }>,
): Promise<ErvReport> {
  const lim = ervRuleset.limits;
  const nameRe = new RegExp(lim.filenamePattern);
  const rows: ErvReport['files'] = [];
  const messageBytes = files.reduce((a, f) => a + f.size, 0);

  for (const file of files) {
    const results: RuleResult[] = [];
    const base = file.name.split(/[/\\]/).pop() ?? file.name;
    const fnOk = nameRe.test(base) && base.length <= lim.maxFilenameChars && !/\s/.test(base);
    results.push({
      id: 'filename',
      source: 'ERVB',
      severity: 'error',
      title: { de: 'Dateiname', en: 'File name' },
      light: lightOf(fnOk, 'error'),
      detail: {
        de: fnOk ? 'OK (a-zA-Z0-9_.-, max. 90).' : `Ungültig: ${base}`,
        en: fnOk ? 'OK (a-zA-Z0-9_.-, max 90).' : `Invalid: ${base}`,
      },
    });
    results.push({
      id: 'filesize',
      source: 'ERVB',
      severity: 'error',
      title: { de: 'Dateigröße', en: 'File size' },
      light: lightOf(file.size <= lim.maxFileBytes, 'error'),
      detail: {
        de: `${file.size} B (Grenze ${lim.maxFileBytes} B / 200 MB).`,
        en: `${file.size} B (limit ${lim.maxFileBytes} B / 200 MB).`,
      },
    });
    results.push({
      id: 'file-count',
      source: 'ERVB',
      severity: 'error',
      title: { de: 'Dateianzahl', en: 'File count' },
      light: lightOf(files.length <= lim.maxFiles, 'error'),
      detail: { de: `${files.length} / ${lim.maxFiles}`, en: `${files.length} / ${lim.maxFiles}` },
    });
    results.push({
      id: 'message-size',
      source: 'ERVB',
      severity: 'warning',
      title: { de: 'Nachrichtengröße', en: 'Message size' },
      light: lightOf(messageBytes <= lim.maxMessageBytes, 'warning'),
      detail: { de: `${messageBytes} B / 1000 MB`, en: `${messageBytes} B / 1000 MB` },
    });

    const enc = hasEncrypt(file.bytes);
    results.push({
      id: 'no-encrypt',
      source: 'ERVV-§2',
      severity: 'error',
      title: { de: 'Keine Verschlüsselung', en: 'No encryption' },
      light: lightOf(!enc, 'error'),
      detail: { de: enc ? ' /Encrypt gefunden' : 'OK', en: enc ? '/Encrypt found' : 'OK' },
    });

    let inspect;
    let doc: PDFDocument | undefined;
    try {
      doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true, updateMetadata: false });
      inspect = inspectPdf(doc);
    } catch {
      inspect = undefined;
    }
    results.push({
      id: 'no-js',
      source: 'ERVV-§2',
      severity: 'error',
      title: { de: 'Kein JavaScript', en: 'No JavaScript' },
      light: lightOf(!inspect?.hasJavaScript, 'error'),
      detail: { de: inspect?.hasJavaScript ? 'JavaScript vorhanden' : 'OK', en: inspect?.hasJavaScript ? 'JavaScript present' : 'OK' },
    });
    results.push({
      id: 'no-forms',
      source: 'ERVV-§5',
      severity: 'error',
      title: { de: 'Keine Formularfelder', en: 'No form fields' },
      light: lightOf(!inspect?.hasAcroForm, 'error'),
      detail: { de: inspect?.hasAcroForm ? 'AcroForm vorhanden' : 'OK', en: inspect?.hasAcroForm ? 'AcroForm present' : 'OK' },
    });
    const xmp = Boolean(doc?.catalog?.has(PDFName.of('Metadata')));
    results.push({
      id: 'pdfa-recommended',
      source: 'ERVV-§2',
      severity: 'warning',
      title: { de: 'PDF/A empfohlen', en: 'PDF/A recommended' },
      light: lightOf(xmp, 'warning'),
      detail: {
        de: xmp ? 'XMP vorhanden (kein vollständiger PDF/A-Beweis).' : 'Kein XMP/pdfaid — PDF/A empfohlen.',
        en: xmp ? 'XMP present (not a full PDF/A proof).' : 'No XMP/pdfaid — PDF/A recommended.',
      },
    });
    results.push({
      id: 'printable',
      source: 'ERVV-§2',
      severity: 'warning',
      title: { de: 'Druckbar', en: 'Printable' },
      light: lightOf(!enc, 'warning'),
      detail: { de: enc ? 'Verschlüsselt — Druck unklar.' : 'Keine Drucksperre erkannt.', en: enc ? 'Encrypted — print unclear.' : 'No print lock detected.' },
    });
    const text = await hasTextLayer(file.bytes);
    results.push({
      id: 'text-layer',
      source: 'ERVV-§5',
      severity: 'warning',
      title: { de: 'Text durchsuchbar', en: 'Searchable text' },
      light: lightOf(text, 'warning'),
      detail: {
        de: text ? 'Textlayer vorhanden.' : 'Kein Text — OCR empfohlen (pdf-ocr).',
        en: text ? 'Text layer present.' : 'No text — OCR recommended (pdf-ocr).',
      },
    });
    results.push({
      id: 'no-embedded',
      source: 'ERVV-§5',
      severity: 'error',
      title: { de: 'Keine eingebetteten Dateien', en: 'No embedded files' },
      light: lightOf(!inspect?.hasEmbeddedFiles, 'error'),
      detail: { de: inspect?.hasEmbeddedFiles ? 'Anhänge gefunden' : 'OK', en: inspect?.hasEmbeddedFiles ? 'Attachments found' : 'OK' },
    });
    results.push({
      id: 'fonts-embedded',
      source: 'ERVV-§5',
      severity: 'warning',
      title: { de: 'Schriften eingebettet', en: 'Fonts embedded' },
      light: 'yellow',
      detail: {
        de: 'Nur Hinweis: volle Font-Prüfung über pdf-a.',
        en: 'Hint only: full font check via pdf-a.',
      },
    });
    let a4 = true;
    try {
      if (doc?.catalog) {
        a4 = doc.getPages().every((p) => {
          const s = p.getSize();
          return isA4(s.width, s.height);
        });
      }
    } catch {
      a4 = true;
    }
    results.push({
      id: 'page-a4',
      source: 'ERVB',
      severity: 'hint',
      title: { de: 'A4 empfohlen', en: 'A4 recommended' },
      light: lightOf(a4, 'hint'),
      detail: { de: a4 ? 'A4' : 'Abweichendes Format', en: a4 ? 'A4' : 'Non-A4' },
    });
    rows.push({ name: file.name, size: file.size, results });
  }

  return {
    ruleset: { id: ervRuleset.id, version: ervRuleset.version, sources: ervRuleset.sources },
    files: rows,
    overall: worst(rows.flatMap((r) => r.results.map((x) => x.light))),
    autoFixPipeline: AUTO_FIX_PIPELINE,
  };
}
