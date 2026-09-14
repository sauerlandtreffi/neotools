import { useEffect, useRef, useState } from 'preact/hooks';
import { loadPdfjs } from '@neotools/tools-pdf';
import { t, type Locale } from '../lib/i18n';
import { createToolWorker, downloadBytes, type WorkerFile } from '../lib/worker-client';

export interface RedactMark {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  source: 'text' | 'rect' | 'search' | 'auto';
  pattern?: string;
  text?: string;
  selected: boolean;
}

interface Props {
  locale: Locale;
  file: WorkerFile;
  values: Record<string, unknown>;
  onChangeValues: (values: Record<string, unknown>) => void;
  onRan: (result: {
    outputs: WorkerFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  }) => void;
  onProgress: (p: { v: number; m?: string } | null) => void;
  onError: (msg: string | null) => void;
}

type Mode = 'text' | 'rect' | 'search';

let markSeq = 1;
function nid(): string {
  markSeq += 1;
  return `m${markSeq}`;
}

export default function RedactEditor({
  locale,
  file,
  values,
  onChangeValues,
  onRan,
  onProgress,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1.25);
  const [mode, setMode] = useState<Mode>('text');
  const [marks, setMarks] = useState<RedactMark[]>([]);
  const [past, setPast] = useState<RedactMark[][]>([]);
  const [future, setFuture] = useState<RedactMark[][]>([]);
  const [items, setItems] = useState<Array<{ page: number; str: string; x: number; y: number; w: number; h: number }>>([]);
  const [search, setSearch] = useState('');
  const [autoHits, setAutoHits] = useState<RedactMark[]>([]);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const viewportRef = useRef<{ convertToPdfPoint: (x: number, y: number) => number[]; convertToViewportPoint: (x: number, y: number) => number[]; width: number; height: number } | null>(null);

  const push = (next: RedactMark[]) => {
    setPast((p) => [...p, marks]);
    setFuture([]);
    setMarks(next);
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: file.data.slice(), isEvalSupported: false, verbosity: 0 }).promise;
      if (dead) {
        await doc.destroy();
        return;
      }
      pdfRef.current = doc;
      setPages(doc.numPages);
      const collected: typeof items = [];
      const thumbUrls: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        const content = await p.getTextContent();
        for (const raw of content.items) {
          const it = raw as { str?: string; width?: number; height?: number; transform?: number[] };
          if (!it.str) continue;
          const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
          collected.push({
            page: i,
            str: it.str,
            x: tr[4] ?? 0,
            y: tr[5] ?? 0,
            w: it.width ?? 8,
            h: it.height ?? 10,
          });
        }
        const tv = p.getViewport({ scale: 0.18 });
        const c = document.createElement('canvas');
        c.width = tv.width;
        c.height = tv.height;
        const ctx = c.getContext('2d');
        if (ctx) await p.render({ canvasContext: ctx, viewport: tv }).promise;
        thumbUrls.push(c.toDataURL('image/png'));
      }
      if (!dead) {
        setItems(collected);
        setThumbs(thumbUrls);
      }
    })().catch((err) => onError(err instanceof Error ? err.message : String(err)));
    return () => {
      dead = true;
      void pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    const doc = pdfRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const viewport = p.getViewport({ scale: zoom });
      viewportRef.current = viewport;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await p.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;
      const all = [...marks, ...autoHits.filter((h) => h.selected)];
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeStyle = '#c45c26';
      for (const m of all.filter((x) => x.page === page)) {
        const [x1, y1] = viewport.convertToViewportPoint(m.x, m.y + m.h);
        const [x2, y2] = viewport.convertToViewportPoint(m.x + m.w, m.y);
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [page, zoom, marks, autoHits, file, pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setMode('rect');
      if (e.key === 't' || e.key === 'T') setMode('text');
      if (e.key === 'Delete' || e.key === 'Backspace') {
        push(marks.filter((m) => !m.selected));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = past[past.length - 1];
        if (!prev) return;
        setPast((p) => p.slice(0, -1));
        setFuture((f) => [marks, ...f]);
        setMarks(prev);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = future[0];
        if (!next) return;
        setFuture((f) => f.slice(1));
        setPast((p) => [...p, marks]);
        setMarks(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [marks, past, future]);

  const toPdf = (cx: number, cy: number): { x: number; y: number } => {
    const vp = viewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const [x, y] = vp.convertToPdfPoint(cx, cy);
    return { x, y };
  };

  const onCanvasDown = (e: MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * (e.target as HTMLCanvasElement).width) / rect.width;
    const cy = ((e.clientY - rect.top) * (e.target as HTMLCanvasElement).height) / rect.height;
    if (mode === 'rect') {
      drag.current = { x: cx, y: cy };
      return;
    }
    if (mode === 'text') {
      const pdf = toPdf(cx, cy);
      const hit = items.find(
        (it) =>
          it.page === page && pdf.x >= it.x && pdf.x <= it.x + it.w && pdf.y >= it.y && pdf.y <= it.y + it.h,
      );
      if (!hit) return;
      if (e.shiftKey && marks.length) {
        const last = marks[marks.length - 1]!;
        const x = Math.min(last.x, hit.x);
        const y = Math.min(last.y, hit.y);
        const w = Math.max(last.x + last.w, hit.x + hit.w) - x;
        const h = Math.max(last.y + last.h, hit.y + hit.h) - y;
        push([...marks.slice(0, -1), { ...last, x, y, w, h, text: `${last.text ?? ''} ${hit.str}` }]);
        return;
      }
      push([
        ...marks,
        { id: nid(), page, x: hit.x, y: hit.y, w: hit.w, h: hit.h, source: 'text', text: hit.str, selected: true },
      ]);
    }
  };

  const onCanvasDbl = (e: MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * (e.target as HTMLCanvasElement).width) / rect.width;
    const cy = ((e.clientY - rect.top) * (e.target as HTMLCanvasElement).height) / rect.height;
    const pdf = toPdf(cx, cy);
    const hit = items.find(
      (it) => it.page === page && pdf.x >= it.x && pdf.x <= it.x + it.w && pdf.y >= it.y && pdf.y <= it.y + it.h,
    );
    if (!hit) return;
    const line = items.filter((it) => it.page === page && Math.abs(it.y - hit.y) < hit.h * 0.6);
    if (!line.length) return;
    const x = Math.min(...line.map((i) => i.x));
    const y = Math.min(...line.map((i) => i.y));
    const w = Math.max(...line.map((i) => i.x + i.w)) - x;
    const h = Math.max(...line.map((i) => i.y + i.h)) - y;
    push([
      ...marks,
      { id: nid(), page, x, y, w, h, source: 'text', text: line.map((i) => i.str).join(' '), selected: true },
    ]);
  };

  const onCanvasUp = (e: MouseEvent) => {
    if (mode !== 'rect' || !drag.current) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * (e.target as HTMLCanvasElement).width) / rect.width;
    const cy = ((e.clientY - rect.top) * (e.target as HTMLCanvasElement).height) / rect.height;
    const a = toPdf(drag.current.x, drag.current.y);
    const b = toPdf(cx, cy);
    drag.current = null;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 2 || h < 2) return;
    push([...marks, { id: nid(), page, x, y, w, h, source: 'rect', selected: true }]);
  };

  const markSearch = () => {
    if (!search.trim()) return;
    let re: RegExp;
    try {
      re = new RegExp(search, 'gi');
    } catch {
      re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }
    const next: RedactMark[] = [];
    const byPage = new Map<number, typeof items>();
    for (const it of items) {
      const list = byPage.get(it.page) ?? [];
      list.push(it);
      byPage.set(it.page, list);
    }
    for (const [p, list] of byPage) {
      const text = list.map((i) => i.str).join('');
      for (const m of text.matchAll(re)) {
        if (m.index === undefined || !m[0]) continue;
        const start = m.index;
        const end = start + m[0].length;
        const covered = list.filter((it) => {
          const s = offsetOf(list, it);
          return s < end && s + it.str.length > start;
        });
        if (!covered.length) continue;
        const x = Math.min(...covered.map((i) => i.x));
        const y = Math.min(...covered.map((i) => i.y));
        next.push({
          id: nid(),
          page: p,
          x,
          y,
          w: Math.max(...covered.map((i) => i.x + i.w)) - x,
          h: Math.max(...covered.map((i) => i.y + i.h)) - y,
          source: 'search',
          text: m[0],
          selected: true,
        });
      }
    }
    push([...marks, ...next]);
  };

  const previewAuto = async () => {
    setLoadingModel(values.ner ? t(locale, 'loadingNer') : t(locale, 'loadingHits'));
    const session = createToolWorker();
    try {
      const result = await session.api.previewRedact(file, values);
      setAutoHits(
        (result.hits as Array<{ page: number; x: number; y: number; w: number; h: number; pattern?: string; text?: string }>).map(
          (h) => ({
            id: nid(),
            page: h.page,
            x: h.x,
            y: h.y,
            w: h.w,
            h: h.h,
            source: 'auto' as const,
            pattern: h.pattern,
            text: h.text,
            selected: true,
          }),
        ),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      session.terminate();
      setLoadingModel(null);
    }
  };

  const apply = async () => {
    const regions = [
      ...marks.filter((m) => m.selected),
      ...autoHits.filter((h) => h.selected),
    ].map((m) => ({ page: m.page, x: m.x, y: m.y, w: m.w, h: m.h }));
    const next = { ...values, regions, mode: regions.length && values.mode === 'auto' ? 'both' : values.mode };
    onChangeValues(next);
    onError(null);
    const session = createToolWorker();
    try {
      onProgress({ v: 0.05, m: t(locale, 'redactApply') });
      const result = await session.api.run( 'pdf-redact', [file], next, session.proxy((v: number, m?: string) => onProgress({ v, m })));
      onRan(result);
      onProgress({ v: 1, m: 'OK' });
      const pdf = result.outputs.find((o) => o.mime === 'application/pdf');
      if (pdf) downloadBytes(pdf.name, pdf.data, pdf.mime);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      session.terminate();
    }
  };

  return (
    <section class="grid gap-4 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <div class="flex flex-wrap items-center gap-2">
        <strong>{t(locale, 'redactEditor')}</strong>
        <button type="button" class={chip(mode === 'text')} onClick={() => setMode('text')}>
          {t(locale, 'redactText')} (T)
        </button>
        <button type="button" class={chip(mode === 'rect')} onClick={() => setMode('rect')}>
          {t(locale, 'redactRect')} (R)
        </button>
        <button type="button" class={chip(mode === 'search')} onClick={() => setMode('search')}>
          {t(locale, 'redactSearch')}
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
          +
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
          −
        </button>
        <button type="button" onClick={previewAuto}>
          {t(locale, 'autoHits')}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          onClick={() => void apply()}
        >
          {t(locale, 'redactApply')}
        </button>
      </div>
      {loadingModel && <p class="text-sm" style={{ color: 'var(--muted)' }}>{loadingModel}</p>}
      {mode === 'search' && (
        <div class="flex gap-2">
          <input
            class="flex-1 rounded border px-2 py-1"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            value={search}
            placeholder="Text / Regex"
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
          <button type="button" onClick={markSearch}>
            {t(locale, 'redactSearch')}
          </button>
        </div>
      )}
      <div class="grid gap-3 md:grid-cols-[88px_1fr_220px]">
        <ul class="grid gap-1 content-start">
          {thumbs.map((src, i) => (
            <li key={src}>
              <button type="button" onClick={() => setPage(i + 1)} class="block w-full">
                <img src={src} alt={`p${i + 1}`} class="w-full rounded border" style={{ borderColor: page === i + 1 ? 'var(--accent)' : 'var(--line)' }} />
              </button>
            </li>
          ))}
        </ul>
        <div class="overflow-auto">
          <canvas
            ref={canvasRef}
            class="max-w-full cursor-crosshair rounded border"
            style={{ borderColor: 'var(--line)' }}
            onMouseDown={onCanvasDown}
            onMouseUp={onCanvasUp}
            onDblClick={onCanvasDbl}
          />
        </div>
        <div>
          <h3 class="stamp mb-2">{t(locale, 'marks')}</h3>
          <ul class="grid max-h-80 gap-1 overflow-auto text-xs">
            {marks.map((m) => (
              <li key={m.id} class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={() => setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, selected: !x.selected } : x)))}
                />
                <span>
                  p{m.page} {m.source} {m.text ? `“${m.text.slice(0, 18)}”` : `${Math.round(m.w)}×${Math.round(m.h)}`}
                </span>
              </li>
            ))}
            {autoHits.map((m) => (
              <li key={m.id} class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={() =>
                    setAutoHits((all) => all.map((x) => (x.id === m.id ? { ...x, selected: !x.selected } : x)))
                  }
                />
                <span>
                  p{m.page} {m.pattern} {m.text ? `“${m.text.slice(0, 18)}”` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function chip(on: boolean): string {
  return on ? 'rounded-full border px-3 py-1 text-sm' : 'rounded-full border px-3 py-1 text-sm opacity-70';
}

function offsetOf(list: Array<{ str: string }>, item: { str: string }): number {
  let n = 0;
  for (const it of list) {
    if (it === item) return n;
    n += it.str.length;
  }
  return n;
}
