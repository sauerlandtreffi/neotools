import type { NeoFile, ToolContext, VerificationCheck, VerificationReport } from '@neotools/engine';
import { MIME } from '@neotools/engine';
import { PDFDocument } from 'pdf-lib';
import { findPatternMatches, normalizeWs, type PatternMatch } from './patterns.js';
import { extractAllText, extractPageMaps } from './text-map.js';
import { collectMetaStrings } from './metadata.js';
import { sampleBoxMeans } from './raster.js';
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

async function pixelSample(data: Uint8Array, hits: RedactHit[]): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  if (!hits.length) return checks;
  const samples = await sampleBoxMeans(data, hits);
  if (!samples) {
    checks.push({
      id: 'pixel-sample',
      passed: true,
      detail: 'Pixel-Stichprobe übersprungen (kein Canvas).',
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

    const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    const meta = collectMetaStrings(doc);
    const metaHit = leftoverInText(meta.join('\n'), needles, scanPatterns, options.customRegex ?? []);
    checks.push({
      id: `${file.name}:meta`,
      passed: metaHit.length === 0,
      detail: metaHit.length === 0 ? 'Info/Annotationen/Outline ohne Treffer.' : `Metadaten: ${metaHit[0]?.text}`,
    });

    if (ctx.platform.capabilities.canvas) {
      checks.push(...(await pixelSample(data, options.hits ?? [])));
    } else {
      checks.push({
        id: `${file.name}:pixel`,
        passed: true,
        detail: 'Pixel-Stichprobe übersprungen (platform.capabilities.canvas=false).',
      });
    }
  }

  if (!checks.length) {
    checks.push({ id: 'no-pdf-output', passed: true, detail: 'Keine PDF-Ausgabe zu prüfen.' });
  }

  return { passed: checks.every((c) => c.passed), checks };
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
