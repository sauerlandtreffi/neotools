import { z } from 'zod';

/**
 * Standard selection building blocks (FRONTEND-REDESIGN §2.15 B).
 * Tools `extend` these so the workspace UI writes exactly these keys and
 * nothing else. All fields are optional: an empty selection means "whole file".
 */

export const pagesSchema = z.object({
  /** 1-based, inclusive; empty/undefined = all pages. */
  pages: z.array(z.number().int().positive()).optional(),
});

export const regionItemSchema = z.object({
  /** PDF page (1-based); undefined for single images. */
  page: z.number().int().positive().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  /** `pdf` = PDF user space points, `px` = source pixels, `norm` = 0..1 of width/height. */
  unit: z.enum(['pdf', 'px', 'norm']).default('norm'),
});

export const regionSchema = z.object({
  regions: z.array(regionItemSchema).optional(),
});

export const timeRangeSchema = z.object({
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
});

export const fileIdsSchema = z.object({
  fileIds: z.array(z.string()).optional(),
  /** Explicit ordering of `fileIds` (merge, bundle). */
  order: z.array(z.string()).optional(),
});

export type SelectionRegion = z.infer<typeof regionItemSchema>;

/** Runtime selection as produced by the workspace canvas. */
export interface Selection {
  pages?: number[];
  regions?: SelectionRegion[];
  timeRange?: { startSec: number; endSec: number };
  fileIds?: string[];
  textQuery?: string;
}

/** Option keys that are owned by the selection and must not be rendered as form fields. */
export const SELECTION_KEYS: readonly string[] = [
  'pages',
  'regions',
  'startSec',
  'endSec',
  'fileIds',
  'order',
];

export function isSelectionKey(name: string): boolean {
  return SELECTION_KEYS.includes(name);
}

export function emptySelection(): Selection {
  return {};
}

export function selectionIsEmpty(sel: Selection | undefined | null): boolean {
  if (!sel) return true;
  return (
    !(sel.pages && sel.pages.length) &&
    !(sel.regions && sel.regions.length) &&
    !sel.timeRange &&
    !(sel.fileIds && sel.fileIds.length) &&
    !(sel.textQuery && sel.textQuery.length)
  );
}

/**
 * Parse `1-3,7,10-` style page lists (1-based). `total` clamps open ranges.
 * Invalid tokens are skipped; the result is sorted and deduplicated.
 */
export function parsePagesParam(raw: string | null | undefined, total = Number.MAX_SAFE_INTEGER): number[] {
  if (!raw) return [];
  const out = new Set<number>();
  for (const token of raw.split(/[,\s;]+/)) {
    const part = token.trim();
    if (!part) continue;
    const m = /^(\d+)?(?:-(\d+)?)?$/.exec(part);
    if (!m) continue;
    const a = m[1] ? Number(m[1]) : 1;
    const hasDash = part.includes('-');
    const b = hasDash ? (m[2] ? Number(m[2]) : total) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.max(1, Math.min(a, b));
    const hi = Math.min(total, Math.max(a, b));
    if (hi - lo > 100_000) continue;
    for (let i = lo; i <= hi; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** Inverse of {@link parsePagesParam}: `[1,2,3,7]` → `"1-3,7"`. */
export function formatPages(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i]!;
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      end = sorted[i + 1]!;
      i++;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    i++;
  }
  return parts.join(',');
}

/** Parse `12.0-40.5` into a time range. */
export function parseTimeRangeParam(raw: string | null | undefined): { startSec: number; endSec: number } | undefined {
  if (!raw) return undefined;
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!m) return undefined;
  const startSec = Number(m[1]);
  const endSec = Number(m[2]);
  if (!(endSec > startSec)) return undefined;
  return { startSec, endSec };
}

/**
 * Map the runtime selection onto a tool's option object. Only keys the tool's
 * schema declares are written, so legacy tools keep their own shapes.
 */
export function applySelectionToOptions(
  schema: z.ZodTypeAny,
  options: Record<string, unknown>,
  selection: Selection,
): Record<string, unknown> {
  const shape = objectShape(schema);
  if (!shape) return options;
  const next = { ...options };
  if ('pages' in shape && selection.pages?.length) next.pages = [...selection.pages];
  if ('regions' in shape && selection.regions?.length) next.regions = selection.regions.map((r) => ({ ...r }));
  if ('startSec' in shape && selection.timeRange) next.startSec = selection.timeRange.startSec;
  if ('endSec' in shape && selection.timeRange) next.endSec = selection.timeRange.endSec;
  if ('fileIds' in shape && selection.fileIds?.length) next.fileIds = [...selection.fileIds];
  return next;
}

function objectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  let inner: z.ZodTypeAny = schema;
  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      inner = inner.unwrap();
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      inner = inner._def.innerType;
      continue;
    }
    if (inner instanceof z.ZodEffects) {
      inner = inner._def.schema;
      continue;
    }
    break;
  }
  return inner instanceof z.ZodObject ? (inner.shape as Record<string, z.ZodTypeAny>) : null;
}
