import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { openPdfjsDocument } from '../pdfjs.js';

export interface UaFinding {
  id: string;
  passed: boolean;
  clause: string;
  wcag?: string;
  message: { de: string; en: string };
  severity: 'error' | 'warning' | 'info';
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function finding(id: string, passed: boolean, clause: string, de: string, en: string, wcag?: string, severity: UaFinding['severity'] = 'error'): UaFinding {
  return { id, passed, clause, wcag, message: { de, en }, severity: passed ? 'info' : severity };
}

export async function inspectPdfUa(bytes: Uint8Array): Promise<UaFinding[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const findings: UaFinding[] = [];
  const catalog = doc.catalog;
  const mark = catalog.lookupMaybe(PDFName.of('MarkInfo'), PDFDict);
  const marked = mark?.lookup(PDFName.of('Marked'));
  const isMarked = Boolean(marked && String(marked) === 'true');
  findings.push(finding('marked', isMarked, 'PDF/UA-1 7.1', 'MarkInfo/Marked fehlt oder ist nicht true.', 'MarkInfo/Marked missing or not true.', 'WCAG 1.3.1'));
  const struct = catalog.lookup(PDFName.of('StructTreeRoot'));
  findings.push(finding('struct', struct instanceof PDFDict, 'PDF/UA-1 7.1', 'Structure-Tree fehlt.', 'Structure tree missing.', 'WCAG 1.3.1'));
  const lang = catalog.lookup(PDFName.of('Lang'));
  const langOk = lang instanceof PDFString ? Boolean(lang.decodeText()) : lang instanceof PDFName;
  findings.push(finding('lang', Boolean(langOk), 'PDF/UA-1 7.2', 'Document Lang fehlt.', 'Document Lang missing.', 'WCAG 3.1.1'));
  const title = doc.getTitle() ?? '';
  findings.push(finding('title', Boolean(title.trim()), 'PDF/UA-1 7.1', 'Dokumenttitel fehlt.', 'Document title missing.', 'WCAG 2.4.2'));
  const vp = catalog.lookupMaybe(PDFName.of('ViewerPreferences'), PDFDict);
  const display = vp?.lookup(PDFName.of('DisplayDocTitle'));
  findings.push(finding('display-title', Boolean(display && String(display) === 'true'), 'PDF/UA-1 7.1', 'DisplayDocTitle nicht gesetzt.', 'DisplayDocTitle not set.', 'WCAG 2.4.2'));
  let tabsOk = true;
  for (const page of doc.getPages()) {
    const tabs = page.node.lookup(PDFName.of('Tabs'));
    if (!(tabs instanceof PDFName) || nameOf(tabs) !== 'S') tabsOk = false;
  }
  findings.push(finding('tabs', tabsOk, 'PDF/UA-1 7.1', 'Tab-Reihenfolge ist nicht /S (Structure).', 'Tab order is not /S (Structure).', 'WCAG 2.4.3'));

  const xmpRaw = catalog.lookup(PDFName.of('Metadata'));
  let xmp = '';
  try {
    const { PDFRawStream } = await import('pdf-lib');
    if (xmpRaw instanceof PDFRawStream) xmp = new TextDecoder().decode(xmpRaw.getContents());
  } catch {
    xmp = '';
  }
  findings.push(finding('pdfuaid', /pdfuaid:part>\s*1/i.test(xmp), 'PDF/UA-1 5', 'XMP pdfuaid:part=1 fehlt.', 'XMP pdfuaid:part=1 missing.'));

  const form = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (form) {
    const fields = form.lookup(PDFName.of('Fields'));
    let tu = true;
    if (fields instanceof PDFArray) {
      for (let i = 0; i < fields.size(); i++) {
        const f = fields.lookup(i);
        if (f instanceof PDFDict && !f.has(PDFName.of('TU'))) tu = false;
      }
    }
    findings.push(finding('form-tu', tu, 'PDF/UA-1 7.18', 'Formularfelder ohne TU (Tooltip).', 'Form fields without TU tooltip.', 'WCAG 3.3.2', 'warning'));
  }

  try {
    const pdf = await openPdfjsDocument(bytes);
    let scanned = 0;
    const sizes: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; height?: number }>;
      const text = items.map((it) => it.str ?? '').join('').replace(/\s/g, '');
      if (text.length < 8) scanned += 1;
      for (const it of items) if (it.height) sizes.push(it.height);
    }
    findings.push(
      finding(
        'scanned',
        scanned === 0,
        'PDF/UA-1 7.1 / BITV',
        `${scanned} Seite(n) ohne Textlayer — OCR empfohlen.`,
        `${scanned} page(s) without text — OCR recommended.`,
        'WCAG 1.4.5',
        'warning',
      ),
    );
    sizes.sort((a, b) => b - a);
    const headingJump = sizes.length > 3 && sizes[0]! > sizes[1]! * 2.5;
    findings.push(finding('headings', !headingJump, 'PDF/UA-1 7.4', 'Überschriften-Hierarchie unsicher (Schriftgrößen).', 'Heading hierarchy uncertain (font sizes).', 'WCAG 1.3.1', 'warning'));
    await pdf.destroy();
  } catch {
    findings.push(finding('textlayer', false, 'PDF/UA-1 7.1', 'Textlayer konnte nicht gelesen werden.', 'Could not read text layer.', 'WCAG 1.3.1', 'warning'));
  }

  findings.push(finding('alt-figure', false, 'PDF/UA-1 7.3', 'Alt-Text für Figure-Tags nicht automatisch nachweisbar (best-effort).', 'Alt text on Figure tags not auto-proven (best-effort).', 'WCAG 1.1.1', 'warning'));
  findings.push(finding('table-th', false, 'PDF/UA-1 7.5', 'Tabellen-TH nicht geprüft (kein vollständiger Tag-Walk).', 'Table TH not checked (no full tag walk).', 'WCAG 1.3.1', 'warning'));
  findings.push(finding('reading-order', false, 'PDF/UA-1 7.1', 'Lesereihenfolge Struktur vs. Content nur heuristisch.', 'Reading order structure vs content is heuristic only.', 'WCAG 1.3.2', 'warning'));
  findings.push(finding('contrast', false, 'BITV / WCAG 1.4.3', 'Kontrast nur light: Content-Stream-Farben nicht eindeutig.', 'Contrast is light-only: content-stream colors not unambiguous.', 'WCAG 1.4.3', 'info'));
  findings.push(finding('link-alt', false, 'PDF/UA-1 7.18', 'Link-Alt nicht automatisch geprüft.', 'Link alt not auto-checked.', 'WCAG 2.4.4', 'warning'));
  return findings;
}
