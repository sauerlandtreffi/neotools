import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { localePath, type Locale } from '../lib/i18n';
import { getDesktop, type DesktopAdapter } from '../lib/desktop';
import { putHandoff, takeHandoff, takeHandoffResult } from '../lib/desktop-handoff';
import { downloadOrSavePicker, persistPdfEdits, type PersistAnnot } from '../lib/desktop-pdf';
import './Reader.css';

export interface ReaderTool {
  id: string;
  title: Record<'de' | 'en', string>;
}

interface Props {
  locale: Locale;
  toolsJson: string;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'percent';
type DrawKind = 'none' | 'highlight' | 'freetext' | 'square';
type SidebarTab = 'thumbs' | 'outline';

interface PageMetric {
  width: number;
  height: number;
  rotate: number;
}

interface DraftAnnot extends PersistAnnot {
  id: string;
}

interface SearchHit {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OutlineNode {
  title: string;
  page: number | null;
  items: OutlineNode[];
}

interface FormFieldView {
  name: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  value: string;
}

const PREFERRED_TOOLS = ['pdf-reorder', 'pdf-rotate', 'pdf-split', 'pdf-sanitize', 'pdf-watermark', 'pdf-redact'];
const COPY = {
  de: {
    open: 'Öffnen',
    save: 'Speichern',
    saveAs: 'Speichern unter',
    print: 'Drucken',
    search: 'Suchen',
    thumbs: 'Seiten',
    outline: 'Lesezeichen',
    tools: 'Werkzeuge',
    zoomWidth: 'Seitenbreite',
    zoomPage: 'Ganze Seite',
    invert: 'Dunkel',
    rotate: 'Drehen',
    highlight: 'Markieren',
    note: 'Notiz',
    rect: 'Rechteck',
    dirty: 'Ungespeicherte Änderungen',
    empty: 'PDF hierher ziehen oder öffnen. Alles bleibt lokal.',
    page: 'Seite',
  },
  en: {
    open: 'Open',
    save: 'Save',
    saveAs: 'Save as',
    print: 'Print',
    search: 'Search',
    thumbs: 'Pages',
    outline: 'Bookmarks',
    tools: 'Tools',
    zoomWidth: 'Fit width',
    zoomPage: 'Fit page',
    invert: 'Dark pages',
    rotate: 'Rotate',
    highlight: 'Highlight',
    note: 'Note',
    rect: 'Rectangle',
    dirty: 'Unsaved changes',
    empty: 'Drop a PDF here or open one. Everything stays on this device.',
    page: 'Page',
  },
} as const;

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import('pdfjs-dist').then((mod) => {
      if (!mod.GlobalWorkerOptions.workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
      }
      return mod;
    });
  }
  return pdfjsReady;
}

function sortTools(tools: ReaderTool[]): ReaderTool[] {
  const rank = new Map(PREFERRED_TOOLS.map((id, i) => [id, i]));
  return [...tools].sort((a, b) => {
    const ra = rank.get(a.id) ?? 100 + a.id.localeCompare(b.id);
    const rb = rank.get(b.id) ?? 100 + b.id.localeCompare(a.id);
    return ra - rb;
  });
}

function displaySize(metric: PageMetric, extra: number, scale: number) {
  const rot = (((metric.rotate + extra) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  return {
    w: (swap ? metric.height : metric.width) * scale,
    h: (swap ? metric.width : metric.height) * scale,
    rot,
  };
}

export default function Reader({ locale, toolsJson }: Props) {
  const ui = COPY[locale];
  const tools = useMemo(() => sortTools(JSON.parse(toolsJson) as ReaderTool[]), [toolsJson]);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [desktop, setDesktop] = useState<DesktopAdapter | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [name, setName] = useState('document.pdf');
  const [nativePath, setNativePath] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [metrics, setMetrics] = useState<PageMetric[]>([]);
  const [page, setPage] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [percent, setPercent] = useState(110);
  const [scale, setScale] = useState(1);
  const [invert, setInvert] = useState(false);
  const [visible, setVisible] = useState<{ from: number; to: number }>({ from: 1, to: 1 });
  const [sidebar, setSidebar] = useState<SidebarTab>('thumbs');
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [draw, setDraw] = useState<DrawKind>('none');
  const [annots, setAnnots] = useState<DraftAnnot[]>([]);
  const [forms, setForms] = useState<FormFieldView[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ page: number; x: number; y: number; x2: number; y2: number } | null>(null);

  const pageCount = metrics.length;

  const loadBytes = useCallback(async (next: Uint8Array, fileName: string, path?: string | null) => {
    setError(null);
    setBytes(next);
    setName(fileName);
    setNativePath(path ?? null);
    setAnnots([]);
    setFormValues({});
    setRotations({});
    setDirty(false);
    setHits([]);
    setPage(1);
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({
      data: next.slice(),
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    });
    const doc = await task.promise;
    const nextMetrics: PageMetric[] = [];
    const nextForms: FormFieldView[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1, rotation: p.rotate });
      nextMetrics.push({ width: vp.width, height: vp.height, rotate: p.rotate });
      const annotList = await p.getAnnotations({ intent: 'display' });
      for (const annot of annotList) {
        const rec = annot as {
          subtype?: string;
          fieldName?: string;
          fieldType?: string;
          fieldValue?: unknown;
          rect?: number[];
        };
        if (rec.subtype !== 'Widget' || !rec.fieldName || !rec.rect) continue;
        const [x1, y1, x2, y2] = rec.rect;
        nextForms.push({
          name: rec.fieldName,
          page: i,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
          type: rec.fieldType ?? 'Tx',
          value: rec.fieldValue == null ? '' : String(rec.fieldValue),
        });
      }
    }
    const tree = await doc.getOutline().catch(() => null);
    const mapped = tree ? await mapOutline(doc, tree) : [];
    setPdf(doc);
    setMetrics(nextMetrics);
    setForms(nextForms);
    setFormValues(Object.fromEntries(nextForms.map((f) => [f.name, f.value])));
    setOutline(mapped);
  }, []);

  useEffect(() => {
    void getDesktop().then(setDesktop);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    void (async () => {
      if (params.get('result') === '1') {
        const result = await takeHandoffResult();
        if (result) await loadBytes(result.bytes, result.name);
      }
      if (params.get('open') === '1') {
        const incoming = await takeHandoff();
        if (incoming) await loadBytes(incoming.bytes, incoming.name);
      }
      const d = await getDesktop();
      if (params.get('desktop') === '1' || d.available) {
        const opened = await d.readOpenedFile();
        if (opened) await loadBytes(opened.bytes, opened.name, opened.path);
      }
    })();
  }, [loadBytes]);

  useEffect(() => {
    if (!desktop?.available) return;
    let stop: () => void = () => {};
    void desktop.listenOpenFile(() => {
      void desktop.readOpenedFile().then((opened) => {
        if (opened) void loadBytes(opened.bytes, opened.name, opened.path);
      });
    }).then((un) => {
      stop = un;
    });
    return () => stop();
  }, [desktop, loadBytes]);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);

  const extras = rotations;
  const layout = useMemo(() => {
    const gap = 18;
    const pad = 28;
    let top = pad;
    const items: Array<{ page: number; top: number; w: number; h: number }> = [];
    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i];
      if (!metric) continue;
      const size = displaySize(metric, extras[i] ?? 0, scale);
      items.push({ page: i + 1, top, w: size.w, h: size.h });
      top += size.h + gap;
    }
    return { items, height: top + pad };
  }, [metrics, extras, scale]);

  useEffect(() => {
    const stage = stageRef.current;
    const metric = metrics[0];
    if (!stage || !metric) return;
    const extra = extras[0] ?? 0;
    const size1 = displaySize(metric, extra, 1);
    const next =
      zoomMode === 'fit-width'
        ? Math.max(0.25, (stage.clientWidth - 56) / size1.w)
        : zoomMode === 'fit-page'
          ? Math.max(0.25, Math.min((stage.clientWidth - 56) / size1.w, (stage.clientHeight - 40) / size1.h))
          : percent / 100;
    setScale((current) => (Math.abs(current - next) < 0.01 ? current : next));
  }, [zoomMode, percent, metrics, extras]);

  const recomputeVisible = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const top = stage.scrollTop;
    const bottom = top + stage.clientHeight;
    let from = 1;
    let to = 1;
    for (const item of layout.items) {
      if (item.top + item.h >= top && from === 1) from = item.page;
      if (item.top <= bottom) to = item.page;
    }
    setVisible({ from: Math.max(1, from - 2), to: Math.min(pageCount, to + 2) });
    const mid = top + stage.clientHeight / 3;
    const current = layout.items.find((it) => mid >= it.top && mid <= it.top + it.h);
    if (current) setPage(current.page);
  }, [layout.items, pageCount]);

  useEffect(() => {
    recomputeVisible();
  }, [recomputeVisible, scale, pageCount]);

  const jumpTo = (n: number) => {
    const item = layout.items[n - 1];
    const stage = stageRef.current;
    if (!item || !stage) return;
    stage.scrollTo({ top: item.top - 12, behavior: 'smooth' });
    setPage(n);
  };

  const openFiles = async (list: File[]) => {
    const file = list.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!file) return;
    await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  };

  const runSearch = async () => {
    if (!pdf || !query.trim()) {
      setHits([]);
      return;
    }
    const pdfjs = await loadPdfjs();
    const q = query.trim().toLowerCase();
    const found: SearchHit[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const extra = extras[i - 1] ?? 0;
      const vp = p.getViewport({ scale, rotation: p.rotate + extra });
      const content = await p.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.toLowerCase().includes(q)) continue;
        const tx = pdfjs.Util.transform(vp.transform, item.transform);
        found.push({
          page: i,
          x: tx[4],
          y: tx[5] - Math.abs(tx[3] || item.height * scale),
          width: (item.width || 8) * (vp.scale ?? scale),
          height: Math.abs(tx[3]) || item.height * scale || 12,
        });
      }
    }
    setHits(found);
    setHitIndex(0);
    if (found[0]) jumpTo(found[0].page);
  };

  const saveNow = async (asNew: boolean) => {
    if (!bytes) return;
    const payload = await persistPdfEdits(bytes, {
      formValues: Object.entries(formValues).map(([fieldName, value]) => ({ name: fieldName, value })),
      annotations: annots,
      pageRotations: rotations,
    });
    if (desktop?.available) {
      let path = !asNew ? nativePath : null;
      if (!path) path = await desktop.pickSavePath(name);
      if (!path) return;
      await desktop.saveFile(path, payload);
      setNativePath(path);
      setName(path.split(/[\\/]/).pop() ?? name);
    } else {
      await downloadOrSavePicker(name, payload, 'application/pdf');
    }
    setBytes(payload);
    setDirty(false);
    await loadBytes(payload, name, nativePath);
  };

  const handoffTo = async (toolId: string) => {
    if (!bytes) return;
    const current = dirty
      ? await persistPdfEdits(bytes, {
          formValues: Object.entries(formValues).map(([fieldName, value]) => ({ name: fieldName, value })),
          annotations: annots,
          pageRotations: rotations,
        })
      : bytes;
    await putHandoff({ name, mime: 'application/pdf', bytes: current }, { returnTo: 'reader', toolId });
    location.assign(`${localePath(locale, `/${toolId}`)}?from=reader`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpTo(Math.min(pageCount, page + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpTo(Math.max(1, page - 1));
      } else if (e.key === '+' || e.key === '=') {
        setZoomMode('percent');
        setPercent((v) => Math.min(300, v + 10));
      } else if (e.key === '-' || e.key === '_') {
        setZoomMode('percent');
        setPercent((v) => Math.max(25, v - 10));
      } else if (meta && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('reader-search')?.focus();
      } else if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoomMode('percent');
      setPercent((v) => Math.min(300, Math.max(25, v + (e.deltaY > 0 ? -10 : 10))));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [bytes]);

  const captureSelection = async () => {
    if (draw !== 'highlight' || !pdf) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const pageEl = node?.closest('[data-reader-page]') as HTMLElement | null;
    if (!pageEl) return;
    const pageNo = Number(pageEl.dataset.readerPage);
    const canvas = pageEl.querySelector('canvas');
    if (!canvas || Number.isNaN(pageNo)) return;
    const p = await pdf.getPage(pageNo);
    const extra = extras[pageNo - 1] ?? 0;
    const vp = p.getViewport({ scale, rotation: p.rotate + extra });
    const box = canvas.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    for (const rect of [...range.getClientRects()]) {
      const x1 = ((rect.left - box.left) / box.width) * vp.width;
      const y1 = ((rect.top - box.top) / box.height) * vp.height;
      const x2 = ((rect.right - box.left) / box.width) * vp.width;
      const y2 = ((rect.bottom - box.top) / box.height) * vp.height;
      const [px1, py1] = vp.convertToPdfPoint(x1, y1);
      const [px2, py2] = vp.convertToPdfPoint(x2, y2);
      setAnnots((prev) => [
        ...prev,
        {
          id: `hl-${prev.length}-${Date.now()}`,
          kind: 'highlight',
          pageIndex: pageNo - 1,
          x: Math.min(px1, px2),
          y: Math.min(py1, py2),
          width: Math.abs(px2 - px1),
          height: Math.abs(py2 - py1),
          text: sel.toString(),
        },
      ]);
    }
    setDirty(true);
    sel.removeAllRanges();
  };

  return (
    <div
      class="reader-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void openFiles([...(e.dataTransfer?.files ?? [])]);
      }}
    >
      <div class="reader-toolbar">
        <button type="button" onClick={() => fileRef.current?.click()}>
          {ui.open}
        </button>
        <input
          ref={fileRef}
          class="hidden"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => void openFiles([...((e.target as HTMLInputElement).files ?? [])])}
        />
        <span class="stamp">
          {ui.page} {page}/{pageCount || '–'}
        </span>
        <button type="button" onClick={() => jumpTo(Math.max(1, page - 1))} disabled={page <= 1}>
          ←
        </button>
        <button type="button" onClick={() => jumpTo(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
          →
        </button>
        <button type="button" aria-pressed={zoomMode === 'fit-width'} onClick={() => setZoomMode('fit-width')}>
          {ui.zoomWidth}
        </button>
        <button type="button" aria-pressed={zoomMode === 'fit-page'} onClick={() => setZoomMode('fit-page')}>
          {ui.zoomPage}
        </button>
        <label>
          {Math.round(scale * 100)}%
          <input
            type="range"
            min="25"
            max="300"
            value={percent}
            onInput={(e) => {
              setZoomMode('percent');
              setPercent(Number((e.target as HTMLInputElement).value));
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setRotations((r) => ({ ...r, [page - 1]: ((r[page - 1] ?? 0) + 90) % 360 }));
            setDirty(true);
          }}
        >
          {ui.rotate}
        </button>
        <button type="button" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>
          {ui.invert}
        </button>
        <button type="button" aria-pressed={draw === 'highlight'} onClick={() => setDraw((d) => (d === 'highlight' ? 'none' : 'highlight'))}>
          {ui.highlight}
        </button>
        <button type="button" aria-pressed={draw === 'freetext'} onClick={() => setDraw((d) => (d === 'freetext' ? 'none' : 'freetext'))}>
          {ui.note}
        </button>
        <button type="button" aria-pressed={draw === 'square'} onClick={() => setDraw((d) => (d === 'square' ? 'none' : 'square'))}>
          {ui.rect}
        </button>
        <form
          class="reader-search"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <input
            id="reader-search"
            value={query}
            placeholder={ui.search}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <button type="submit">{ui.search}</button>
          {hits.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const next = (hitIndex + 1) % hits.length;
                setHitIndex(next);
                const hit = hits[next];
                if (hit) jumpTo(hit.page);
              }}
            >
              {hitIndex + 1}/{hits.length}
            </button>
          )}
        </form>
        <label>
          {ui.tools}
          <select
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value;
              (e.target as HTMLSelectElement).value = '';
              if (id) void handoffTo(id);
            }}
          >
            <option value="">{ui.tools}</option>
            {tools.map((tool) => (
              <option value={tool.id}>{tool.title[locale]}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!bytes} onClick={() => void saveNow(false)}>
          {ui.save}
        </button>
        <button type="button" disabled={!bytes} onClick={() => void saveNow(true)}>
          {ui.saveAs}
        </button>
        <button type="button" onClick={() => window.print()}>
          {ui.print}
        </button>
        {dirty && <span class="reader-dirty stamp">{ui.dirty}</span>}
      </div>

      {!bytes ? (
        <div class="reader-empty">
          <div>
            <p class="text-2xl">{ui.empty}</p>
            <button type="button" class="mt-4 rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={() => fileRef.current?.click()}>
              {ui.open}
            </button>
            {error && <p class="mt-3">{error}</p>}
          </div>
        </div>
      ) : (
        <div class="reader-body">
          <aside class="reader-sidebar">
            <div class="flex gap-2 p-2">
              <button type="button" aria-pressed={sidebar === 'thumbs'} onClick={() => setSidebar('thumbs')}>
                {ui.thumbs}
              </button>
              <button type="button" aria-pressed={sidebar === 'outline'} onClick={() => setSidebar('outline')}>
                {ui.outline}
              </button>
            </div>
            {sidebar === 'thumbs' ? (
              <div class="reader-thumbs">
                {layout.items.map((item) => (
                  <Thumb
                    key={item.page}
                    pdf={pdf}
                    page={item.page}
                    active={item.page === page}
                    extra={extras[item.page - 1] ?? 0}
                    invert={invert}
                    onClick={() => jumpTo(item.page)}
                  />
                ))}
              </div>
            ) : (
              <div class="reader-outline">
                {outline.length === 0 && <p class="px-3 text-sm" style={{ color: 'var(--muted)' }}>—</p>}
                {outline.map((node) => (
                  <OutlineButtons key={node.title} node={node} onJump={jumpTo} depth={0} />
                ))}
              </div>
            )}
          </aside>
          <div class="reader-stage" ref={stageRef} onScroll={recomputeVisible} onMouseUp={() => void captureSelection()}>
            <div class="reader-spacer" style={{ height: `${layout.height}px` }}>
              {layout.items
                .filter((item) => item.page >= visible.from && item.page <= visible.to)
                .map((item) => (
                  <PageView
                    key={`${item.page}-${scale}-${extras[item.page - 1] ?? 0}`}
                    pdf={pdf}
                    item={item}
                    extra={extras[item.page - 1] ?? 0}
                    invert={invert}
                    hits={hits.filter((h) => h.page === item.page)}
                    activeHit={hits[hitIndex]}
                    forms={forms.filter((f) => f.page === item.page)}
                    formValues={formValues}
                    onForm={(field, value) => {
                      setFormValues((prev) => ({ ...prev, [field]: value }));
                      setDirty(true);
                    }}
                    annots={annots.filter((a) => a.pageIndex === item.page - 1)}
                    draw={draw}
                    drag={drag?.page === item.page ? drag : null}
                    onDragStart={(pt) => setDrag({ page: item.page, ...pt, x2: pt.x, y2: pt.y })}
                    onDrag={(pt) => setDrag((d) => (d ? { ...d, x2: pt.x, y2: pt.y } : d))}
                    onDragEnd={async (pt) => {
                      if (!drag || !pdf || (draw !== 'square' && draw !== 'freetext')) {
                        setDrag(null);
                        return;
                      }
                      const p = await pdf.getPage(item.page);
                      const vp = p.getViewport({ scale, rotation: p.rotate + (extras[item.page - 1] ?? 0) });
                      const [px1, py1] = vp.convertToPdfPoint(Math.min(drag.x, pt.x), Math.min(drag.y, pt.y));
                      const [px2, py2] = vp.convertToPdfPoint(Math.max(drag.x, pt.x), Math.max(drag.y, pt.y));
                      const text = draw === 'freetext' ? window.prompt(ui.note) ?? '' : '';
                      setAnnots((prev) => [
                        ...prev,
                        {
                          id: `an-${prev.length}-${Date.now()}`,
                          kind: draw,
                          pageIndex: item.page - 1,
                          x: Math.min(px1, px2),
                          y: Math.min(py1, py2),
                          width: Math.abs(px2 - px1),
                          height: Math.abs(py2 - py1),
                          text,
                        },
                      ]);
                      setDirty(true);
                      setDrag(null);
                    }}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function mapOutline(
  pdf: PDFDocumentProxy,
  nodes: Array<{ title: string; dest: string | unknown[] | null; items: unknown[] }>,
): Promise<OutlineNode[]> {
  const out: OutlineNode[] = [];
  for (const node of nodes) {
    let page: number | null = null;
    try {
      let dest = node.dest;
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0] as { num: number; gen: number })) + 1;
    } catch {
      page = null;
    }
    out.push({
      title: node.title,
      page,
      items: node.items?.length ? await mapOutline(pdf, node.items as typeof nodes) : [],
    });
  }
  return out;
}

function OutlineButtons({ node, onJump, depth }: { node: OutlineNode; onJump: (n: number) => void; depth: number }) {
  return (
    <>
      <button type="button" style={{ paddingLeft: `${0.7 + depth * 0.7}rem` }} onClick={() => node.page && onJump(node.page)}>
        {node.title}
      </button>
      {node.items.map((child) => (
        <OutlineButtons key={`${node.title}-${child.title}`} node={child} onJump={onJump} depth={depth + 1} />
      ))}
    </>
  );
}

function Thumb({
  pdf,
  page,
  extra,
  active,
  invert,
  onClick,
}: {
  pdf: PDFDocumentProxy | null;
  page: number;
  extra: number;
  active: boolean;
  invert: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdf || !ref.current) return;
    let cancel = false;
    void (async () => {
      const p = await pdf.getPage(page);
      if (cancel) return;
      const vp = p.getViewport({ scale: 0.18, rotation: p.rotate + extra });
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => {
      cancel = true;
    };
  }, [pdf, page, extra]);
  return (
    <button type="button" class={active ? 'active' : ''} onClick={onClick}>
      <canvas ref={ref} class={invert ? 'invert' : ''} />
      <span class="stamp">{page}</span>
    </button>
  );
}

function PageView({
  pdf,
  item,
  extra,
  invert,
  hits,
  activeHit,
  forms,
  formValues,
  onForm,
  annots,
  draw,
  drag,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  pdf: PDFDocumentProxy | null;
  item: { page: number; top: number; w: number; h: number };
  extra: number;
  invert: boolean;
  hits: SearchHit[];
  activeHit?: SearchHit;
  forms: FormFieldView[];
  formValues: Record<string, string>;
  onForm: (name: string, value: string) => void;
  annots: DraftAnnot[];
  draw: DrawKind;
  drag: { x: number; y: number; x2: number; y2: number } | null;
  onDragStart: (pt: { x: number; y: number }) => void;
  onDrag: (pt: { x: number; y: number }) => void;
  onDragEnd: (pt: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number; convertToViewportRectangle: (r: number[]) => number[] } | null>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancel = false;
    let pageProxy: PDFPageProxy | null = null;
    void (async () => {
      const pdfjs = await loadPdfjs();
      const p = await pdf.getPage(item.page);
      pageProxy = p;
      if (cancel) return;
      const vp = p.getViewport({ scale: item.w / ((p.getViewport({ scale: 1, rotation: p.rotate + extra }).width) || item.w), rotation: p.rotate + extra });
      const canvas = canvasRef.current;
      const textLayer = textRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = vp.width;
      canvas.height = vp.height;
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      setViewport(vp);
      if (textLayer) {
        textLayer.replaceChildren();
        const content = await p.getTextContent();
        const layer = new pdfjs.TextLayer({ textContentSource: content, container: textLayer, viewport: vp });
        await layer.render();
      }
    })();
    return () => {
      cancel = true;
      pageProxy?.cleanup();
    };
  }, [pdf, item.page, item.w, extra]);

  const localPoint = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * canvas.width,
      y: ((e.clientY - box.top) / box.height) * canvas.height,
    };
  };

  return (
    <div
      class={`reader-page ${invert ? 'invert' : ''}`}
      data-reader-page={item.page}
      style={{ top: `${item.top}px`, width: `${item.w}px`, height: `${item.h}px` }}
      onMouseDown={(e) => {
        if (draw === 'square' || draw === 'freetext') onDragStart(localPoint(e));
      }}
      onMouseMove={(e) => {
        if (drag) onDrag(localPoint(e));
      }}
      onMouseUp={(e) => {
        if (drag) onDragEnd(localPoint(e));
      }}
    >
      <canvas ref={canvasRef} />
      <div class="reader-textLayer" ref={textRef} />
      <div class="reader-annotLayer">
        {hits.map((hit, i) => (
          <span
            class={`reader-hit ${activeHit === hit ? 'active' : ''}`}
            key={`${hit.page}-${i}`}
            style={{ left: `${hit.x}px`, top: `${hit.y}px`, width: `${hit.width}px`, height: `${hit.height}px` }}
          />
        ))}
        {annots.map((annot) => {
          if (!viewport) return null;
          const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([
            annot.x,
            annot.y,
            annot.x + annot.width,
            annot.y + annot.height,
          ]);
          return (
            <div
              key={annot.id}
              class={`reader-draft ${annot.kind}`}
              style={{
                left: `${Math.min(vx1, vx2)}px`,
                top: `${Math.min(vy1, vy2)}px`,
                width: `${Math.abs(vx2 - vx1)}px`,
                height: `${Math.abs(vy2 - vy1)}px`,
              }}
            >
              {annot.kind === 'freetext' ? annot.text : null}
            </div>
          );
        })}
        {drag && (
          <div
            class={`reader-draft ${draw}`}
            style={{
              left: `${Math.min(drag.x, drag.x2)}px`,
              top: `${Math.min(drag.y, drag.y2)}px`,
              width: `${Math.abs(drag.x2 - drag.x)}px`,
              height: `${Math.abs(drag.y2 - drag.y)}px`,
            }}
          />
        )}
      </div>
      <div class="reader-formLayer">
        {forms.map((field) => {
          if (!viewport) return null;
          const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([
            field.x,
            field.y,
            field.x + field.w,
            field.y + field.h,
          ]);
          const style = {
            left: `${Math.min(vx1, vx2)}px`,
            top: `${Math.min(vy1, vy2)}px`,
            width: `${Math.abs(vx2 - vx1)}px`,
            height: `${Math.abs(vy2 - vy1)}px`,
          };
          if (field.type === 'Btn') {
            return (
              <input
                key={field.name}
                type="checkbox"
                style={style}
                checked={formValues[field.name] === 'true' || formValues[field.name] === 'Yes' || formValues[field.name] === 'On'}
                onChange={(e) => onForm(field.name, (e.target as HTMLInputElement).checked ? 'Yes' : 'Off')}
              />
            );
          }
          return (
            <input
              key={field.name}
              style={style}
              value={formValues[field.name] ?? ''}
              onInput={(e) => onForm(field.name, (e.target as HTMLInputElement).value)}
            />
          );
        })}
      </div>
    </div>
  );
}
