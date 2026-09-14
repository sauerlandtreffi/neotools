import type { ToolContext } from '@neotools/engine';
import { findPatternMatches, maskSecret, type PatternMatch } from './patterns.js';
import { nerToMatches, runNer } from './ner.js';
import { ocrPng } from './ocr-lite.js';
import {
  buildPageTextMap,
  extractPageMaps,
  itemsForRange,
  itemsOverlappingRegion,
  unionBox,
} from './text-map.js';
import type { PageTextMap, PreviewRedactResult, RedactHit, RedactPatternId, RedactRegion } from './types.js';

export interface FindOptions {
  mode: 'auto' | 'manual' | 'both';
  patterns: RedactPatternId[];
  customRegex?: string[];
  ner?: boolean;
  regions?: RedactRegion[];
  ocrScanned?: boolean;
}

function matchToHits(map: PageTextMap, matches: PatternMatch[]): RedactHit[] {
  const hits: RedactHit[] = [];
  for (const m of matches) {
    const items = itemsForRange(map, m.start, m.end);
    const box = unionBox(items) ?? { x: 0, y: 0, w: 0, h: 0 };
    hits.push({
      page: map.page,
      pattern: m.pattern,
      text: m.text,
      masked: maskSecret(m.text, m.pattern),
      x: box.x,
      y: box.y,
      w: Math.max(box.w, 4),
      h: Math.max(box.h, 8),
      selected: true,
    });
  }
  return hits;
}

export async function collectHits(
  data: Uint8Array,
  opts: FindOptions,
  ctx?: ToolContext,
): Promise<{ hits: RedactHit[]; maps: PageTextMap[]; warnings: string[] }> {
  const warnings: string[] = [];
  let maps = await extractPageMaps(data);
  const hits: RedactHit[] = [];
  const wantAuto = opts.mode === 'auto' || opts.mode === 'both';
  const wantManual = opts.mode === 'manual' || opts.mode === 'both';

  if (opts.ocrScanned) {
    if (!ctx?.platform.capabilities.ocr) {
      warnings.push('OCR angefordert, aber platform.capabilities.ocr ist nicht gesetzt.');
    } else {
      const empty = maps.filter((m) => !m.text.trim());
      if (empty.length) {
        warnings.push('OCR-Seiten erkannt — ocr-lite wird versucht.');
        for (const map of empty) {
          try {
            const { renderPagePng } = await import('./raster.js');
            const png = await renderPagePng(data, map.page, ctx);
            if (!png) continue;
            const ocr = await ocrPng(png);
            if (ocr.warning) warnings.push(ocr.warning);
            if (ocr.text.trim()) {
              maps = maps.map((m) =>
                m.page === map.page ? buildPageTextMap(map.page, [{ str: ocr.text, width: 400, height: 12, transform: [1, 0, 0, 1, 40, 200] }]) : m,
              );
            }
          } catch (err) {
            warnings.push(`OCR Seite ${map.page}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  }

  if (wantAuto) {
    for (const map of maps) {
      const matches = findPatternMatches(map.text, opts.patterns, opts.customRegex ?? []);
      hits.push(...matchToHits(map, matches));
      if (opts.ner) {
        const nerModel = (ctx?.platform as { assets?: { nerModel?: string } } | undefined)?.assets?.nerModel;
        const ner = await runNer(map.text, nerModel);
        if (ner.warning) warnings.push(ner.warning);
        hits.push(...matchToHits(map, nerToMatches(ner.entities)));
      }
    }
  }

  if (wantManual) {
    for (const region of opts.regions ?? []) {
      const map = maps.find((m) => m.page === region.page);
      const overlapping = map ? itemsOverlappingRegion(map, region) : [];
      const text = overlapping.map((i) => i.str).join(' ') || '';
      hits.push({
        page: region.page,
        pattern: 'region',
        text,
        masked: text ? maskSecret(text, 'region') : 'region',
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        selected: true,
      });
    }
  }

  return { hits, maps, warnings };
}

export async function previewRedactHits(
  data: Uint8Array,
  options: FindOptions,
): Promise<PreviewRedactResult> {
  const { hits, maps, warnings } = await collectHits(data, options);
  return { hits, warnings, pages: maps.length };
}
