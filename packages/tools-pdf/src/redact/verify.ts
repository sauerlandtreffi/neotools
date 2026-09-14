import type { NeoFile, ToolContext, VerificationCheck, VerificationReport } from '@neotools/engine';
import { MIME } from '@neotools/engine';
import { PDFDocument } from 'pdf-lib';
import { findPatternMatches, normalizeWs, type PatternMatch } from './patterns.js';
import { extractAllText, extractPageMaps } from './text-map.js';
import { collectMetaStrings, collectStructPlaintext, isTechnicalPdfMeta } from './metadata.js';
import { sampleBoxMeans } from './raster.js';
import { findNeedlesInPdfBytes } from './byte-scan.js';
import { pagesMissingToUnicode } from './fonts.js';
import { hasIncrementalEof } from '../pdf-io.js';
import type { RedactHit, RedactMode, RedactPatternId } from './types.js';

export interface VerifyRedactOptions {
  mode?: RedactMode;
  patterns: RedactPatternId[];
  customRegex?: string[];
  strings?: string[];
  hits?: RedactHit[];
  fillColor?: string;
}

function leftoverInText(text: string, needles: string[], patterns: RedactPatternId[], custom: string[]): PatternMatch[] {
  const compact = normalizeWs(text);
  const extras: PatternMatch[] = [];
  for (const n of needles) {
    const c = normalizeWs(n);
    if (c.length >= 3 && compact.includes(c)) {
      extras.push({ pattern: 'custom', text: n, start: 0, end: n.length });
    }
  }
  extras.push(...findPatternMatches(text, patterns, custom));
  return extras;
}

async function pixelSample(data: Uint8Array, allHits: RedactHit[]): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  // Metadata/annotation hits carry page 0 and a zero-size box — nothing to sample visually.
  const hits = allHits.filter((h) => h.page >= 1 && h.w > 0 && h.h > 0);
  if (!hits.length) return checks;
  const samples = await sampleBoxMeans(data, hits);
  if (!samples) {
    checks.push({
      id: 'pixel-sample',
      passed: false,
      advisory: true,
      detail:
        'Pixel-Stichprobe nicht möglich (kein Canvas). Text- und Byte-Prüfung gelten; Seite gilt nicht als visuell bestätigt.',
    });
    return checks;
  }
  for (const s of samples) {
    const passed = s.mean < 48;
    checks.push({
      id: `pixel-p${s.page}`,
      passed,
      detail: passed
        ? `Mittelwert ${s.mean.toFixed(1)} (nahezu schwarz)`
        : `Mittelwert ${s.mean.toFixed(1)} — Box nicht dunkel genug`,
    });
  }
  return checks;
}

export async function verifyRedactedPdf(
  ctx: ToolContext,
  outputs: readonly NeoFile[],
  options: VerifyRedactOptions,
): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];
  const needles = [
    ...(options.strings ?? []),
    ...(options.hits ?? []).map((h) => h.text),
  ].filter((s) => s.trim().length >= 3);

  for (const file of outputs) {
    if (file.mime !== MIME.pdf) continue;
    const data = await file.bytes();
    const extracted = await extractAllText(data);
    const scanPatterns = options.mode === 'manual' ? [] : options.patterns;
    const leftovers = leftoverInText(extracted.joined, needles, scanPatterns, options.customRegex ?? []);
    checks.push({
      id: `${file.name}:text`,
      passed: leftovers.length === 0,
      detail:
        leftovers.length === 0
          ? 'Kein Muster / kein geschwärzter String im neu geladenen Text.'
          : `Noch sichtbar: ${leftovers
              .slice(0, 5)
              .map((l) => l.pattern + ':' + l.text.slice(0, 24))
              .join(', ')}`,
    });

    const rawHits = findNeedlesInPdfBytes(data, needles);
    checks.push({
      id: `${file.name}:bytes`,
      passed: rawHits.length === 0,
      detail:
        rawHits.length === 0
          ? 'Kein geschwärzter String in den gespeicherten Bytes.'
          : `Rohbytes enthalten noch: ${rawHits[0]!.slice(0, 32)}`,
    });

    if (hasIncrementalEof(data)) {
      checks.push({
        id: `${file.name}:incremental`,
        passed: false,
        detail: 'Mehrere %%EOF — inkrementelles Update, alte Objektgenerationen können Klartext halten.',
      });
    } else {
      checks.push({
        id: `${file.name}:incremental`,
        passed: true,
        detail: 'Eine %%EOF-Marke — Datei ist vollständig neu geschrieben.',
      });
    }

    const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    const meta = collectMetaStrings(doc).filter((s) => !isTechnicalPdfMeta(s));
    const struct = collectStructPlaintext(doc);
    const metaHit = leftoverInText([...meta, ...struct].join('\n'), needles, scanPatterns, options.customRegex ?? []);
    checks.push({
      id: `${file.name}:meta`,
      passed: metaHit.length === 0,
      detail:
        metaHit.length === 0
          ? 'Info/XMP/Annotationen/Outline/StructTree ohne Treffer.'
          : `Metadaten: ${metaHit[0]?.text}`,
    });

    const noToUnicode = pagesMissingToUnicode(doc);
    if (noToUnicode.length) {
      const msg =
        `Seiten ${noToUnicode.join(', ')}: Font ohne ToUnicode — Glyph-Codes können Klartext halten, pdf.js sieht ihn nicht. Nicht shared-safe.`;
      warnings.push(msg);
      checks.push({
        id: `${file.name}:tounicode`,
        passed: false,
        detail: msg,
      });
    } else {
      checks.push({
        id: `${file.name}:tounicode`,
        passed: true,
        detail: 'Keine nicht-Standard-Fonts ohne ToUnicode.',
      });
    }

    if (ctx.platform.capabilities.canvas) {
      const pixels = await pixelSample(data, options.hits ?? []);
      checks.push(...pixels);
      for (const p of pixels) {
        if (!p.passed && p.advisory) warnings.push(p.detail ?? p.id);
      }
    } else if ((options.hits ?? []).length) {
      const msg = 'Pixel-Stichprobe übersprungen (platform.capabilities.canvas=false). Visuell nicht bestätigt.';
      warnings.push(msg);
      checks.push({
        id: `${file.name}:pixel`,
        passed: false,
        advisory: true,
        detail: msg,
      });
    }
  }

  if (!checks.length) {
    checks.push({ id: 'no-pdf-output', passed: true, detail: 'Keine PDF-Ausgabe zu prüfen.' });
  }

  const blocking = checks.filter((c) => !c.passed && !c.advisory);
  return {
    passed: blocking.length === 0,
    checks,
    warnings,
  };
}

export async function leftoverPages(
  data: Uint8Array,
  needles: string[],
  patterns: RedactPatternId[],
  custom: string[],
): Promise<number[]> {
  const maps = await extractPageMaps(data);
  const pages: number[] = [];
  for (const map of maps) {
    if (leftoverInText(map.text, needles, patterns, custom).length) pages.push(map.page);
  }
  return pages;
}
