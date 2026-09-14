import { useEffect, useRef, useState } from 'preact/hooks';
import { formatPages } from '@neotools/engine';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { openPdf, thumbnail } from '../../lib/workspace/pdf-doc';
import { activeFile, activeRef, busy, headVersion, readRef, runStep, setPage, setSelection, workspace } from '../../lib/workspace/store';
import { I } from './Icons';

/**
 * ThumbRail (FRONTEND-REDESIGN §2.7): page thumbnails, multi-select
 * (click / shift / ctrl), drag-reorder (HTML5 DnD + keyboard arrows),
 * delete and rotate. Every action becomes a stack step (pdf-reorder /
 * pdf-rotate) — nothing is destructive.
 */
export default function ThumbRail({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const file = activeFile.value;
  const ref = activeRef.value;
  const version = headVersion.value;
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const anchor = useRef<number | null>(null);
  const selected = s.selection.pages ?? [];
  const total = order.length;

  useEffect(() => {
    if (!ref) {
      setThumbs([]);
      setOrder([]);
      return;
    }
    let dead = false;
    (async () => {
      const bytes = await readRef(ref);
      if (!bytes) return;
      const pd = await openPdf(ref, bytes);
      if (dead) return;
      const n = pd.numPages;
      setOrder(Array.from({ length: n }, (_, i) => i + 1));
      setDirty(false);
      const urls: string[] = new Array(n).fill('');
      setThumbs([...urls]);
      for (let i = 1; i <= n; i++) {
        if (dead) return;
        urls[i - 1] = await thumbnail(pd, i, 88);
        setThumbs([...urls]);
      }
    })().catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [ref, version]);

  const select = (pageNo: number, e: MouseEvent | KeyboardEvent) => {
    let next: number[];
    if ('shiftKey' in e && e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, pageNo), Math.max(anchor.current, pageNo)];
      next = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    } else if (('ctrlKey' in e && e.ctrlKey) || ('metaKey' in e && e.metaKey)) {
      next = selected.includes(pageNo) ? selected.filter((p) => p !== pageNo) : [...selected, pageNo].sort((x, y) => x - y);
      anchor.current = pageNo;
    } else {
      next = selected.length === 1 && selected[0] === pageNo ? [] : [pageNo];
      anchor.current = pageNo;
    }
    setSelection({ ...s.selection, pages: next.length ? next : undefined });
    setPage(pageNo);
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setOrder(next);
    setDirty(true);
  };

  const applyOrder = async () => {
    if (!dirty) return;
    await runStep('pdf-reorder', { order }, { selection: {}, label: w(locale, 'reorderApplied') });
    setDirty(false);
  };

  const deleteSelected = async () => {
    if (!selected.length) return;
    await runStep('pdf-reorder', { delete: selected }, { selection: {}, label: w(locale, 'deletePages') });
  };

  const rotateSelected = async () => {
    const pages = selected.length ? formatPages(selected) : 'all';
    await runStep('pdf-rotate', { angle: 90, pages }, { selection: {}, label: w(locale, 'rotatePages') });
  };

  if (!file) return null;

  return (
    <aside class="ws-thumbs" aria-label={w(locale, 'thumbs')} data-thumbrail>
      <header class="ws-panel-head">
        <span class="stamp">{w(locale, 'thumbs')}</span>
        <span class="mono text-xs tnum" style={{ color: 'var(--faint)' }}>
          {selected.length ? `${selected.length}/${total}` : total}
        </span>
      </header>
      <div class="ws-thumbs-tools">
        <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'rotatePages')} title={w(locale, 'rotatePages')} disabled={busy.value} data-thumb-rotate onClick={() => void rotateSelected()}>
          <I.rotate size={15} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          aria-label={w(locale, 'deletePages')}
          title={w(locale, 'deletePages')}
          disabled={!selected.length || busy.value || selected.length >= total}
          data-thumb-delete
          onClick={() => void deleteSelected()}
        >
          <I.trash size={15} />
        </button>
        {selected.length > 0 && (
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'clearSelection')} onClick={() => setSelection({ ...s.selection, pages: undefined })}>
            <I.x size={14} />
          </button>
        )}
        {dirty && (
          <button type="button" class="btn btn-primary btn-sm ml-auto" data-thumb-apply-order onClick={() => void applyOrder()}>
            <I.check size={13} /> {w(locale, 'apply')}
          </button>
        )}
      </div>
      <ol class="ws-thumbs-list" role="listbox" aria-multiselectable="true" aria-label={w(locale, 'thumbs')}>
        {order.map((pageNo, idx) => {
          const isSel = selected.includes(pageNo);
          const isCur = s.page === pageNo;
          return (
            <li
              key={pageNo}
              role="option"
              aria-selected={isSel}
              data-current={isCur}
              data-thumb={pageNo}
              class="ws-thumb"
              draggable
              tabIndex={0}
              onClick={(e) => select(pageNo, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(pageNo, e);
                }
                if (e.altKey && e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(idx, idx - 1);
                }
                if (e.altKey && e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(idx, idx + 1);
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  void deleteSelected();
                }
              }}
              onDragStart={(e) => {
                setDragFrom(idx);
                e.dataTransfer?.setData('text/plain', String(pageNo));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, idx);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
            >
              <div class="ws-thumb-img" data-empty={!thumbs[pageNo - 1]}>
                {thumbs[pageNo - 1] ? <img src={thumbs[pageNo - 1]} alt="" draggable={false} /> : <span class="ws-skeleton" />}
              </div>
              <span class="ws-thumb-num tnum">{pageNo}</span>
              {isSel && (
                <span class="ws-thumb-check">
                  <I.check size={12} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
