import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { activeFile, canRedo, canUndo, redo, setPendingTool, setUi, undo, workspace } from '../../lib/workspace/store';
import { toolsForActive } from './ActionBar';
import { I } from './Icons';

interface Item {
  id: string;
  label: string;
  hint?: string;
  run(): void;
  kind: 'tool' | 'action';
}

/** Minimal ⌘K palette (W2 scope): tools for the active file + core actions. Full version is W3. */
export default function Palette({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const file = activeFile.value;

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'export', label: w(locale, 'export'), hint: '⌘E', kind: 'action', run: () => setUi({ exportOpen: true }) },
      { id: 'undo', label: w(locale, 'undo'), hint: '⌘Z', kind: 'action', run: () => canUndo.value && void undo() },
      { id: 'redo', label: w(locale, 'redo'), hint: '⇧⌘Z', kind: 'action', run: () => canRedo.value && void redo() },
      { id: 'merge', label: w(locale, 'merge'), kind: 'action', run: () => setUi({ mergeOpen: true }) },
      { id: 'batch', label: w(locale, 'batch'), kind: 'action', run: () => setUi({ batchOpen: true }) },
      { id: 'shortcuts', label: w(locale, 'shortcuts'), hint: '?', kind: 'action', run: () => setUi({ shortcutsOpen: true }) },
    ];
    const tools: Item[] = file
      ? toolsForActive().map((t) => ({
          id: t.view.id,
          label: t.view.title[locale],
          hint: t.view.id,
          kind: 'tool',
          run: () => setPendingTool(t.view.id),
        }))
      : [];
    const all = [...tools, ...actions];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((i) => i.label.toLowerCase().includes(needle) || i.id.includes(needle));
  }, [q, locale, file?.id]);

  useEffect(() => {
    if (s.paletteOpen) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [s.paletteOpen]);

  if (!s.paletteOpen) return null;
  const close = () => setUi({ paletteOpen: false });
  const pick = (it: Item) => {
    close();
    it.run();
  };

  return (
    <div class="ws-modal-backdrop ws-palette-backdrop" onClick={close}>
      <div class="ws-palette nt-pop" role="dialog" aria-modal="true" aria-label={w(locale, 'palette')} data-palette onClick={(e) => e.stopPropagation()}>
        <div class="ws-palette-input">
          <I.search size={16} />
          <input
            ref={input}
            class="flex-1 bg-transparent outline-none"
            placeholder={w(locale, 'palettePlaceholder')}
            value={q}
            role="combobox"
            aria-expanded="true"
            aria-controls="ws-palette-list"
            aria-activedescendant={items[idx] ? `ws-pal-${items[idx].id}` : undefined}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const it = items[idx];
                if (it) pick(it);
              } else if (e.key === 'Escape') {
                close();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="ws-palette-list" class="ws-palette-list" role="listbox">
          {items.length === 0 && (
            <li class="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>
              —
            </li>
          )}
          {items.map((it, i) => (
            <li key={it.id} id={`ws-pal-${it.id}`} role="option" aria-selected={i === idx}>
              <button type="button" class="ws-palette-item" data-active={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => pick(it)}>
                <span class="stamp" style={{ color: 'var(--faint)', width: 44 }}>
                  {it.kind === 'tool' ? 'tool' : 'do'}
                </span>
                <span class="flex-1 text-left">{it.label}</span>
                {it.hint && <kbd>{it.hint}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
