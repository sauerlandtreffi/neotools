import { useEffect, useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { fmtBytes, w } from '../../lib/workspace/i18n';
import { openPdf, renderPage } from '../../lib/workspace/pdf-doc';
import { activeFile, readRef, setUi, workspace } from '../../lib/workspace/store';
import { I } from './Icons';

/**
 * Before/after wiper for one step: left = input of the step, right = output.
 * Both sides render the same page at the same scale; a range input drives the clip.
 */
export default function DiffView({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const file = activeFile.value;
  const stepId = s.diffStepId;
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [sizes, setSizes] = useState<{ a: number; b: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const idx = file?.revisions.findIndex((r) => r.stepId === stepId) ?? -1;
  const rec = idx >= 0 ? file?.revisions[idx] : undefined;
  const inRef = idx > 0 ? file?.revisions.slice(0, idx).reverse().find((r) => r.status === 'ok' && r.outputRef)?.outputRef ?? file?.srcRef : file?.srcRef;
  const outRef = rec?.outputRef;

  useEffect(() => {
    if (!inRef || !outRef || !beforeRef.current || !afterRef.current) return;
    let dead = false;
    (async () => {
      const [a, b] = await Promise.all([readRef(inRef), readRef(outRef)]);
      if (!a || !b) throw new Error(locale === 'de' ? 'Snapshot fehlt — Schritt zuerst anzeigen.' : 'Snapshot missing — show the step first.');
      setSizes({ a: a.byteLength, b: b.byteLength });
      const [da, db] = await Promise.all([openPdf(inRef, a), openPdf(outRef, b)]);
      if (dead) return;
      const page = Math.min(s.page, da.numPages, db.numPages);
      // size from the dialog body (the clipped "before" layer has no intrinsic width yet)
      const avail = wrapRef.current?.clientWidth ?? 800;
      const maxH = Math.max(320, (typeof innerHeight === 'number' ? innerHeight : 800) * 0.9 - 180);
      const p = await da.doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min((Math.min(940, avail - 24)) / base.width, maxH / base.height);
      await Promise.all([renderPage(da, page, beforeRef.current!, scale), renderPage(db, page, afterRef.current!, scale)]);
    })().catch((e) => !dead && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      dead = true;
    };
  }, [inRef, outRef, s.page]);

  if (!file || !rec) return null;

  return (
    <div class="ws-modal-backdrop" role="dialog" aria-modal="true" aria-label={w(locale, 'diff')} data-diffview onClick={() => setUi({ diffStepId: null })}>
      <div class="ws-modal ws-modal-wide nt-pop" onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="font-medium">{w(locale, 'diff')}</span>
          <span class="text-xs tnum" style={{ color: 'var(--muted)' }}>
            {sizes ? `${fmtBytes(sizes.a)} → ${fmtBytes(sizes.b)}` : ''}
          </span>
          <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'close')} onClick={() => setUi({ diffStepId: null })}>
            <I.x />
          </button>
        </header>
        {err && (
          <p class="p-4 text-sm" style={{ color: 'var(--warn-text)' }}>
            {err}
          </p>
        )}
        <div class="ws-diff" ref={wrapRef}>
          <div class="ws-diff-stage">
            <canvas ref={afterRef} class="ws-diff-after" />
            <div class="ws-diff-before" style={{ width: `${pos}%` }}>
              <canvas ref={beforeRef} />
            </div>
            <div class="ws-diff-handle" style={{ left: `${pos}%` }} aria-hidden="true" />
            <span class="ws-diff-label" style={{ left: 8 }}>
              {w(locale, 'before')}
            </span>
            <span class="ws-diff-label" style={{ right: 8 }}>
              {w(locale, 'after')}
            </span>
          </div>
          <input type="range" min={0} max={100} value={pos} aria-label={w(locale, 'diffHint')} class="ws-diff-range" onInput={(e) => setPos(Number((e.target as HTMLInputElement).value))} />
          <p class="text-xs" style={{ color: 'var(--muted)' }}>
            {w(locale, 'diffHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
