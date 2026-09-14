import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { allText, findInText, openPdf, pageText, renderPage, type PdfDoc, type TextItem } from '../../lib/workspace/pdf-doc';
import {
  activeFile,
  activeRef,
  headVersion,
  readRef,
  setMarks,
  setPage,
  setPageCount,
  setSearch,
  setZoom,
  workspace,
  type RedactMark,
} from '../../lib/workspace/store';
import { I } from './Icons';

let markSeq = 0;
function nid(): string {
  markSeq += 1;
  return `m${markSeq}`;
}

interface Props {
  locale: Locale;
}

/**
 * DocCanvas for the PDF family (FRONTEND-REDESIGN §2.7): pdf.js page render,
 * zoom, page nav, search, and — when `pdf-redact` is pending — the embedded
 * redact editor (click text, drag rectangle, search marks).
 */
export default function PdfCanvas({ locale }: Props) {
  const s = workspace.value;
  const file = activeFile.value;
  const ref = activeRef.value;
  const version = headVersion.value;
  const redacting = s.pendingToolId === 'pdf-redact';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [items, setItems] = useState<TextItem[]>([]);
  const [allItems, setAllItems] = useState<TextItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fitScale, setFitScale] = useState<number | null>(null);
  const viewportRef = useRef<{ convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hits, setHits] = useState<Array<{ page: number; x: number; y: number; w: number; h: number; text: string }>>([]);
  const [hitIdx, setHitIdx] = useState(0);

  // open document for current head
  useEffect(() => {
    if (!file || !ref) {
      setDoc(null);
      return;
    }
    let dead = false;
    setLoading(true);
    setError(null);
    (async () => {
      const bytes = await readRef(ref);
      if (!bytes) throw new Error(locale === 'de' ? 'Datei nicht gefunden.' : 'File not found.');
      const pd = await openPdf(ref, bytes);
      if (dead) return;
      setDoc(pd);
      setAllItems(null);
      if (file.pages !== pd.numPages) void setPageCount(file.id, pd.numPages);
      if (s.page > pd.numPages) setPage(pd.numPages);
    })()
      .catch((err) => !dead && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [ref, version, file?.id]);

  // fit width
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !doc) return;
    let dead = false;
    const compute = async () => {
      try {
        const p = await doc.doc.getPage(1);
        if (dead) return;
        const vp = p.getViewport({ scale: 1 });
        const avail = el.clientWidth - 32;
        setFitScale(Math.max(0.3, Math.min(3, avail / vp.width)));
      } catch {
        // document was swapped/destroyed mid-measure (step applied) — the next doc recomputes
      }
    };
    void compute();
    const ro = new ResizeObserver(() => void compute());
    ro.observe(el);
    return () => {
      dead = true;
      ro.disconnect();
    };
  }, [doc]);

  const scale = (fitScale ?? 1) * s.zoom;

  // render page + overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    (async () => {
      const { viewport } = await renderPage(doc, s.page, canvas, scale);
      if (cancelled) return;
      viewportRef.current = viewport;
      const txt = await pageText(doc, s.page);
      if (cancelled) return;
      setItems(txt);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, s.page, scale]);

  // search
  useEffect(() => {
    if (!doc || !s.search.trim()) {
      setHits([]);
      return;
    }
    let cancelled = { cancelled: false };
    (async () => {
      const all = allItems ?? (await allText(doc, cancelled));
      if (cancelled.cancelled) return;
      if (!allItems) setAllItems(all);
      const found = findInText(all, s.search);
      setHits(found);
      setHitIdx(0);
      if (found[0] && found[0].page !== s.page) setPage(found[0].page);
    })().catch(() => undefined);
    return () => {
      cancelled.cancelled = true;
    };
  }, [doc, s.search]);

  const overlay = useMemo(() => {
    const vp = viewportRef.current;
    if (!vp) return [];
    const boxes: Array<{ key: string; x: number; y: number; w: number; h: number; kind: 'mark' | 'hit' | 'hit-active'; selected: boolean; id?: string }> = [];
    const toBox = (m: { x: number; y: number; w: number; h: number }) => {
      const [x1, y1] = vp.convertToViewportPoint(m.x, m.y + m.h);
      const [x2, y2] = vp.convertToViewportPoint(m.x + m.w, m.y);
      return { x: Math.min(x1!, x2!), y: Math.min(y1!, y2!), w: Math.abs(x2! - x1!), h: Math.abs(y2! - y1!) };
    };
    if (redacting) {
      for (const m of s.marks.filter((x) => x.page === s.page)) boxes.push({ key: m.id, id: m.id, ...toBox(m), kind: 'mark', selected: m.selected });
    }
    hits.forEach((h, i) => {
      if (h.page !== s.page) return;
      boxes.push({ key: `h${i}`, ...toBox(h), kind: i === hitIdx ? 'hit-active' : 'hit', selected: false });
    });
    return boxes;
  }, [s.marks, s.page, hits, hitIdx, redacting, scale, items]);

  const pointer = (e: PointerEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };
  const toPdf = (cx: number, cy: number) => {
    const vp = viewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const [x, y] = vp.convertToPdfPoint(cx, cy);
    return { x: x!, y: y! };
  };
  const hitItem = (pdf: { x: number; y: number }) =>
    items.find((it) => pdf.x >= it.x && pdf.x <= it.x + it.w && pdf.y >= it.y && pdf.y <= it.y + it.h);

  const onDown = (e: PointerEvent) => {
    if (!redacting) return;
    const { cx, cy } = pointer(e);
    if (s.redactMode === 'rect') {
      drag.current = { x: cx, y: cy };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (s.redactMode === 'text') {
      const hit = hitItem(toPdf(cx, cy));
      if (!hit) return;
      if (e.shiftKey && s.marks.length) {
        const last = s.marks[s.marks.length - 1]!;
        if (last.page === s.page) {
          const x = Math.min(last.x, hit.x);
          const y = Math.min(last.y, hit.y);
          const wd = Math.max(last.x + last.w, hit.x + hit.w) - x;
          const ht = Math.max(last.y + last.h, hit.y + hit.h) - y;
          setMarks([...s.marks.slice(0, -1), { ...last, x, y, w: wd, h: ht, text: `${last.text ?? ''} ${hit.str}` }]);
          return;
        }
      }
      setMarks([...s.marks, { id: nid(), page: s.page, x: hit.x, y: hit.y, w: hit.w, h: hit.h, source: 'text', text: hit.str, selected: true }]);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const { cx, cy } = pointer(e);
    setDragRect({ x: Math.min(drag.current.x, cx), y: Math.min(drag.current.y, cy), w: Math.abs(cx - drag.current.x), h: Math.abs(cy - drag.current.y) });
  };
  const onUp = (e: PointerEvent) => {
    if (!drag.current) return;
    const { cx, cy } = pointer(e);
    const a = toPdf(drag.current.x, drag.current.y);
    const b = toPdf(cx, cy);
    drag.current = null;
    setDragRect(null);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const wd = Math.abs(b.x - a.x);
    const ht = Math.abs(b.y - a.y);
    if (wd < 2 || ht < 2) return;
    setMarks([...s.marks, { id: nid(), page: s.page, x, y, w: wd, h: ht, source: 'rect', selected: true }]);
  };
  const onDbl = (e: MouseEvent) => {
    if (!redacting || s.redactMode !== 'text') return;
    const { cx, cy } = pointer(e);
    const hit = hitItem(toPdf(cx, cy));
    if (!hit) return;
    const line = items.filter((it) => Math.abs(it.y - hit.y) < hit.h * 0.6);
    if (!line.length) return;
    const x = Math.min(...line.map((i) => i.x));
    const y = Math.min(...line.map((i) => i.y));
    const wd = Math.max(...line.map((i) => i.x + i.w)) - x;
    const ht = Math.max(...line.map((i) => i.y + i.h)) - y;
    setMarks([...s.marks, { id: nid(), page: s.page, x, y, w: wd, h: ht, source: 'text', text: line.map((i) => i.str).join(' '), selected: true }]);
  };

  const toggleMark = (id: string) => setMarks((prev: RedactMark[]) => prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m)));

  const gotoHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (hitIdx + dir + hits.length) % hits.length;
    setHitIdx(next);
    const h = hits[next]!;
    if (h.page !== s.page) setPage(h.page);
  };

  const total = doc?.numPages ?? file?.pages ?? 1;

  return (
    <section class="ws-canvas" aria-label={locale === 'de' ? 'Dokument' : 'Document'} data-canvas>
      <div class="ws-canvas-bar">
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'page') + ' −'} disabled={s.page <= 1} onClick={() => setPage(s.page - 1)}>
            <I.chevronL />
          </button>
          <label class="flex items-center gap-1 text-sm tnum">
            <span class="sr-only">{w(locale, 'page')}</span>
            <input
              class="field ws-page-input"
              type="number"
              min={1}
              max={total}
              value={s.page}
              data-page-input
              onChange={(e) => setPage(Number((e.target as HTMLInputElement).value) || 1)}
            />
            <span style={{ color: 'var(--muted)' }}>
              / {total}
            </span>
          </label>
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'page') + ' +'} disabled={s.page >= total} onClick={() => setPage(s.page + 1)}>
            <I.chevronR />
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'zoomOut')} onClick={() => setZoom(s.zoom - 0.15)}>
            <I.zoomOut />
          </button>
          <button type="button" class="btn btn-ghost btn-sm tnum" aria-label={w(locale, 'fitWidth')} onClick={() => setZoom(1)}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'zoomIn')} onClick={() => setZoom(s.zoom + 0.15)}>
            <I.zoomIn />
          </button>
        </div>
        <div class="ml-auto flex items-center gap-1">
          {searchOpen ? (
            <div class="flex items-center gap-1 nt-fade-in">
              <input
                class="field ws-search"
                type="search"
                placeholder={w(locale, 'searchPlaceholder')}
                value={s.search}
                autoFocus
                data-search-input
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') gotoHit(e.shiftKey ? -1 : 1);
                  if (e.key === 'Escape') {
                    setSearch('');
                    setSearchOpen(false);
                  }
                }}
              />
              <span class="mono text-xs tnum" style={{ color: 'var(--muted)' }} data-search-hits>
                {hits.length ? `${hitIdx + 1}/${hits.length}` : s.search ? '0' : ''}
              </span>
              <button type="button" class="btn btn-ghost btn-icon" aria-label="prev" onClick={() => gotoHit(-1)}>
                <I.up size={14} />
              </button>
              <button type="button" class="btn btn-ghost btn-icon" aria-label="next" onClick={() => gotoHit(1)}>
                <I.down size={14} />
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label={w(locale, 'close')}
                onClick={() => {
                  setSearch('');
                  setSearchOpen(false);
                }}
              >
                <I.x size={14} />
              </button>
            </div>
          ) : (
            <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'search')} title="/" data-search-open onClick={() => setSearchOpen(true)}>
              <I.search />
            </button>
          )}
        </div>
      </div>
      <div ref={wrapRef} class="ws-canvas-scroll" data-redacting={redacting} data-mode={s.redactMode}>
        {error && (
          <p class="card m-4 p-4 text-sm" style={{ color: 'var(--warn-text)' }}>
            {error}
          </p>
        )}
        {!error && (
          <div class="ws-page-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
            <canvas
              ref={canvasRef}
              class="ws-page"
              data-pdf-page
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onDblClick={onDbl}
            />
            <div class="ws-overlay" aria-hidden={!redacting}>
              {overlay.map((b) =>
                b.kind === 'mark' ? (
                  <button
                    key={b.key}
                    type="button"
                    class="ws-mark"
                    data-selected={b.selected}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    aria-label={locale === 'de' ? 'Markierung umschalten' : 'Toggle mark'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMark(b.id!);
                    }}
                  />
                ) : (
                  <span key={b.key} class="ws-hit" data-active={b.kind === 'hit-active'} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
                ),
              )}
              {dragRect && <span class="ws-mark ws-mark-drag" style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }} />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
