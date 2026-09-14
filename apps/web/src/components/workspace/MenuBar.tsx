import { useEffect, useRef } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w, type WKey } from '../../lib/workspace/i18n';
import {
  activeFile,
  applyPending,
  canRedo,
  canUndo,
  newSession,
  redo,
  removeFile,
  setLayout,
  setPendingTool,
  setSelection,
  setUi,
  setZoom,
  undo,
  workspace,
} from '../../lib/workspace/store';
import { groupedToolsForActive, verbLabelKey } from './toolbar-model';
import { I } from './Icons';

interface Item {
  id: string;
  label: string;
  kbd?: string;
  disabled?: boolean;
  checked?: boolean;
  href?: string;
  run?: () => void;
  sep?: boolean;
  head?: boolean;
}

function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}
export function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('neotools-theme', dark ? 'dark' : 'light');
  } catch {
    // private mode
  }
}

const MENUS: Array<{ id: string; key: WKey }> = [
  { id: 'file', key: 'menuFile' },
  { id: 'edit', key: 'menuEdit' },
  { id: 'view', key: 'menuView' },
  { id: 'tools', key: 'menuTools' },
  { id: 'help', key: 'menuHelp' },
];

/**
 * Program-style menu bar (pivot §11.1/4): File · Edit · View · Tools · Help.
 * Real menus (role=menubar/menu), keyboard navigable, every item shows its shortcut.
 */
export default function MenuBar({ locale, infoBase }: { locale: Locale; infoBase: string }) {
  const s = workspace.value;
  const file = activeFile.value;
  const open = s.menu;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setUi({ menu: null });
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (file: boolean) => {
    (document.querySelector(file ? '[data-tray-input],[data-empty-input]' : '[data-empty-input]') as HTMLInputElement | null)?.click();
  };
  const hasFiles = Boolean(s.session?.files.length);
  const dark = isDark();
  const toolDocs = s.pendingToolId ? `${infoBase}/tools/${s.pendingToolId}` : null;

  const items = (menu: string): Item[] => {
    switch (menu) {
      case 'file':
        return [
          { id: 'open', label: w(locale, 'open'), kbd: '⌘O', run: () => pick(true) },
          { id: 'new', label: w(locale, 'newSession'), kbd: '⇧⌘N', run: () => void newSession() },
          { id: 'sessions', label: `${w(locale, 'sessions')}…`, kbd: '⇧⌘H', run: () => setUi({ panel: 'history' }) },
          { id: 'sep1', label: '', sep: true },
          { id: 'export', label: `${w(locale, 'export')}…`, kbd: '⌘E', disabled: !file, run: () => setUi({ exportOpen: true }) },
          { id: 'close', label: w(locale, 'closeFile'), kbd: '⌘W', disabled: !file, run: () => file && void removeFile(file.id) },
          { id: 'sep2', label: '', sep: true },
          ...(s.desktop ? [{ id: 'watch', label: w(locale, 'watchFolder'), run: () => setUi({ panel: 'watch' }) }] : []),
          { id: 'overview', label: w(locale, 'overview'), kbd: 'Esc', disabled: !hasFiles || s.overview, run: () => setUi({ overview: true }) },
        ];
      case 'edit':
        return [
          { id: 'undo', label: w(locale, 'undo'), kbd: '⌘Z', disabled: !canUndo.value, run: () => void undo() },
          { id: 'redo', label: w(locale, 'redo'), kbd: '⇧⌘Z', disabled: !canRedo.value, run: () => void redo() },
          { id: 'sep', label: '', sep: true },
          { id: 'apply', label: w(locale, 'apply'), kbd: '⌘↵', disabled: !s.pendingToolId, run: () => void applyPending() },
          { id: 'clear', label: w(locale, 'clearSelection'), kbd: 'Esc', disabled: !s.selection.pages?.length, run: () => setSelection({}) },
          {
            id: 'all',
            label: w(locale, 'selectAll'),
            kbd: '⌘A',
            disabled: !file?.pages,
            run: () => file?.pages && setSelection({ pages: Array.from({ length: file.pages }, (_, i) => i + 1) }),
          },
        ];
      case 'view':
        return [
          { id: 'bin', label: w(locale, 'toggleBin'), kbd: '⌘B', checked: s.binOpen, run: () => setLayout({ binOpen: !s.binOpen }) },
          { id: 'insp', label: w(locale, 'toggleInspector'), kbd: '⌘J', checked: s.inspectorOpen, run: () => setLayout({ inspectorOpen: !s.inspectorOpen }) },
          { id: 'sep', label: '', sep: true },
          { id: 'zin', label: w(locale, 'zoomIn'), kbd: '+', disabled: !file, run: () => setZoom(s.zoom + 0.15) },
          { id: 'zout', label: w(locale, 'zoomOut'), kbd: '−', disabled: !file, run: () => setZoom(s.zoom - 0.15) },
          { id: 'fit', label: w(locale, 'fitWidth'), kbd: '0', disabled: !file, run: () => setZoom(1) },
          { id: 'sep2', label: '', sep: true },
          { id: 'theme', label: dark ? w(locale, 'lightMode') : w(locale, 'darkMode'), kbd: '⇧⌘L', run: () => setTheme(!dark) },
          { id: 'lang', label: `${w(locale, 'language')}: ${locale === 'de' ? 'English' : 'Deutsch'}`, href: `${locale === 'de' ? '/en' : '/'}${typeof location !== 'undefined' ? location.search : ''}` },
          { id: 'sep3', label: '', sep: true },
          s.overview || !hasFiles
            ? { id: 'full', label: w(locale, 'fullscreen'), disabled: !hasFiles, run: () => setUi({ overview: false }) }
            : { id: 'over', label: w(locale, 'overview'), kbd: 'Esc', run: () => setUi({ overview: true }) },
        ];
      case 'tools': {
        const groups = groupedToolsForActive();
        const out: Item[] = [
          { id: 'palette', label: w(locale, 'commandPalette'), kbd: '⌘K', run: () => setUi({ paletteOpen: true }) },
          { id: 'pipe', label: w(locale, 'automate'), run: () => setUi({ panel: 'pipeline' }) },
          { id: 'batch', label: w(locale, 'batchMenu'), disabled: !file, run: () => setUi({ batchOpen: true }) },
        ];
        for (const g of groups) {
          out.push({ id: `h-${g.verb}`, label: w(locale, verbLabelKey(g.verb)), head: true });
          for (const t of g.tools) {
            out.push({
              id: t.view.id,
              label: t.view.title[locale],
              disabled: t.view.desktopOnly && !s.desktop,
              checked: s.pendingToolId === t.view.id,
              run: () => setPendingTool(t.view.id),
            });
          }
        }
        if (!groups.length && !file) out.push({ id: 'none', label: w(locale, 'inspectorEmpty'), disabled: true });
        return out;
      }
      case 'help':
        return [
          { id: 'keys', label: w(locale, 'shortcuts'), kbd: '?', run: () => setUi({ shortcutsOpen: true }) },
          { id: 'sep', label: '', sep: true },
          { id: 'info', label: w(locale, 'helpInfo'), href: `${infoBase}/` },
          ...(toolDocs ? [{ id: 'tooldoc', label: w(locale, 'helpTool'), href: toolDocs }] : []),
          { id: 'noup', label: w(locale, 'helpNoUpload'), href: `${infoBase}/no-upload` },
          { id: 'priv', label: w(locale, 'helpPrivacy'), href: `${infoBase}/${locale === 'de' ? 'datenschutz' : 'privacy'}` },
          { id: 'lic', label: w(locale, 'helpLicenses'), href: `${infoBase}/${locale === 'de' ? 'lizenzen' : 'licenses'}` },
        ];
      default:
        return [];
    }
  };

  const onKey = (e: KeyboardEvent, menuId: string) => {
    const idx = MENUS.findIndex((m) => m.id === menuId);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = MENUS[(idx + 1) % MENUS.length]!.id;
      setUi({ menu: open ? next : null });
      (root.current?.querySelector(`[data-menu-btn="${next}"]`) as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = MENUS[(idx - 1 + MENUS.length) % MENUS.length]!.id;
      setUi({ menu: open ? prev : null });
      (root.current?.querySelector(`[data-menu-btn="${prev}"]`) as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowDown' && open === menuId) {
      e.preventDefault();
      (root.current?.querySelector(`[data-menu="${menuId}"] [role="menuitem"]:not([aria-disabled="true"])`) as HTMLElement | null)?.focus();
    } else if (e.key === 'Escape') {
      setUi({ menu: null });
    }
  };
  const onItemKey = (e: KeyboardEvent) => {
    const list = Array.from(root.current?.querySelectorAll<HTMLElement>(`[data-menu="${open}"] [role="menuitem"]:not([aria-disabled="true"])`) ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setUi({ menu: null });
      (root.current?.querySelector(`[data-menu-btn="${open}"]`) as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      onKey(e, open ?? 'file');
    }
  };

  return (
    <div class="ws-menubar" role="menubar" aria-label="Menu" ref={root} data-menubar>
      {MENUS.map((m) => (
        <div key={m.id} class="ws-menu-root">
          <button
            type="button"
            class="ws-menu-btn"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            data-menu-btn={m.id}
            data-open={open === m.id}
            onClick={() => setUi({ menu: open === m.id ? null : m.id })}
            onMouseEnter={() => open && open !== m.id && setUi({ menu: m.id })}
            onKeyDown={(e) => onKey(e, m.id)}
          >
            {w(locale, m.key)}
          </button>
          {open === m.id && (
            <div class="ws-menu nt-pop ws-menu-drop" role="menu" data-menu={m.id} onKeyDown={onItemKey}>
              {items(m.id).map((it) =>
                it.sep ? (
                  <div key={it.id} class="ws-menu-sep" role="separator" />
                ) : it.head ? (
                  <div key={it.id} class="ws-menu-head" role="presentation">
                    {it.label}
                  </div>
                ) : it.href ? (
                  <a key={it.id} class="ws-menu-item" role="menuitem" href={it.href} onClick={() => setUi({ menu: null })}>
                    <span class="ws-menu-check" aria-hidden="true" />
                    <span class="flex-1 truncate">{it.label}</span>
                    <I.link size={12} />
                  </a>
                ) : (
                  <button
                    key={it.id}
                    type="button"
                    class="ws-menu-item"
                    role="menuitem"
                    aria-disabled={it.disabled ? 'true' : undefined}
                    aria-checked={it.checked}
                    disabled={it.disabled}
                    data-menu-item={it.id}
                    onClick={() => {
                      if (it.disabled) return;
                      setUi({ menu: null });
                      it.run?.();
                    }}
                  >
                    <span class="ws-menu-check" aria-hidden="true">
                      {it.checked ? <I.check2 size={12} /> : null}
                    </span>
                    <span class="flex-1 truncate">{it.label}</span>
                    {it.kbd && <kbd>{it.kbd}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}