import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { mergeFiles, setUi, workspace } from '../../lib/workspace/store';
import { currentName } from '../../lib/workspace/step-stack';
import { I } from './Icons';

export default function MergeOverlay({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const pdfs = (s.session?.files ?? []).filter((f) => f.mime === 'application/pdf');
  const [order, setOrder] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState(true);
  const [name, setName] = useState('merged.pdf');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!s.mergeOpen) return;
    const pre = s.selectedFileIds.filter((id) => pdfs.some((f) => f.id === id));
    setOrder(pre.length >= 2 ? pre : pdfs.map((f) => f.id));
  }, [s.mergeOpen]);

  if (!s.mergeOpen) return null;

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const toggle = (id: string) => setOrder(order.includes(id) ? order.filter((x) => x !== id) : [...order, id]);

  const run = async () => {
    setRunning(true);
    try {
      const added = await mergeFiles(order, { bookmarkPerFile: bookmarks, outputName: name });
      if (added) setUi({ mergeOpen: false });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div class="ws-modal-backdrop" onClick={() => setUi({ mergeOpen: false })}>
      <div class="ws-modal nt-pop" role="dialog" aria-modal="true" aria-label={w(locale, 'mergeTitle')} data-merge-overlay onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="font-medium">{w(locale, 'mergeTitle')}</span>
          <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'close')} onClick={() => setUi({ mergeOpen: false })}>
            <I.x />
          </button>
        </header>
        <div class="grid gap-3 p-4">
          <p class="text-xs" style={{ color: 'var(--muted)' }}>
            {w(locale, 'mergeHint')}
          </p>
          <ol class="grid gap-1">
            {[...order.map((id) => pdfs.find((f) => f.id === id)).filter(Boolean), ...pdfs.filter((f) => !order.includes(f.id))].map((f, i) => {
              const on = order.includes(f!.id);
              return (
                <li key={f!.id} class="ws-merge-row" data-on={on}>
                  <input type="checkbox" checked={on} onChange={() => toggle(f!.id)} aria-label={currentName(f!)} />
                  <span class="mono text-xs" style={{ color: 'var(--faint)', width: 18 }}>
                    {on ? i + 1 : ''}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm">{currentName(f!)}</span>
                  <button type="button" class="btn btn-ghost btn-icon" disabled={!on} aria-label={w(locale, 'moveUp')} onClick={() => move(f!.id, -1)}>
                    <I.up size={14} />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon" disabled={!on} aria-label={w(locale, 'moveDown')} onClick={() => move(f!.id, 1)}>
                    <I.down size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
          <label class="grid gap-1">
            <span class="label">{w(locale, 'fileName')}</span>
            <input class="field" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bookmarks} onChange={(e) => setBookmarks((e.target as HTMLInputElement).checked)} />
            {locale === 'de' ? 'Lesezeichen je Datei' : 'Bookmark per file'}
          </label>
          {order.length < 2 && (
            <p class="text-xs" style={{ color: 'var(--warn-text)' }}>
              {w(locale, 'needTwo')}
            </p>
          )}
        </div>
        <footer class="ws-options-foot">
          <button type="button" class="btn btn-primary w-full" disabled={order.length < 2 || running} data-merge-run onClick={() => void run()}>
            {running ? <I.spinner size={14} /> : <I.merge size={14} />} {w(locale, 'merge')}
          </button>
        </footer>
      </div>
    </div>
  );
}
