import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { activeFile, setPendingTool, setUi, tools, workspace, type WorkspaceToolMeta } from '../../lib/workspace/store';
import { I } from './Icons';
import { groupTools, toolsForFile, verbLabelKey, type ToolGroup } from './toolbar-model';

export { acceptsMime } from './toolbar-model';

/** Backwards-compatible helper used by tests: every tool that can act on the active file. */
export function toolsForActive(all: WorkspaceToolMeta[] = tools.value): WorkspaceToolMeta[] {
  return toolsForFile(activeFile.value, all);
}

/**
 * Toolbar of the program shell (pivot §11.1/3): every registry tool that accepts
 * the active file, grouped by verb — Convert·Edit · Protect·Redact · Inspect·Analyse ·
 * Compare · Export. Each group is a real menu; nothing is hard-coded.
 */
export default function ActionBar({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const file = activeFile.value;
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const list = useMemo(() => toolsForActive(), [file?.id, file?.mime, tools.value]);
  const groups = useMemo(() => groupTools(list), [list]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!file) return null;
  const desktop = s.desktop;
  const activeTool = list.find((t) => t.view.id === s.pendingToolId);

  const pick = (t: WorkspaceToolMeta) => {
    const v = t.view;
    setOpen(null);
    if (v.desktopOnly && !desktop) {
      setPendingTool(v.id);
      return;
    }
    if (v.id === 'pdf-merge' || v.id === 'pdf-aktenbundler' || v.id === 'images-to-pdf') {
      setUi({ mergeOpen: true });
      return;
    }
    setPendingTool(s.pendingToolId === v.id ? null : v.id);
  };

  const renderGroup = (g: ToolGroup) => {
    const isOpen = open === g.verb;
    const hasActive = g.tools.some((t) => t.view.id === s.pendingToolId);
    return (
      <div key={g.verb} class="ws-action-group" data-verb={g.verb}>
        <button
          type="button"
          class="ws-action-group-btn"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          data-active={hasActive}
          data-tool-group={g.verb}
          onClick={() => setOpen(isOpen ? null : g.verb)}
          onMouseEnter={() => open && open !== g.verb && setOpen(g.verb)}
        >
          {w(locale, verbLabelKey(g.verb))}
          <span class="ws-count">{g.tools.length}</span>
          <I.down size={11} />
        </button>
        {isOpen && (
          <div class="ws-menu nt-pop ws-menu-drop" role="menu" data-tool-menu={g.verb}>
            {g.tools.map((t) => {
              const v = t.view;
              const locked = v.desktopOnly && !desktop;
              const active = s.pendingToolId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  class="ws-menu-item"
                  role="menuitem"
                  data-tool={v.id}
                  data-active={active}
                  data-locked={locked}
                  aria-checked={active}
                  title={`${v.description[locale]}${locked ? ` (${w(locale, 'desktopOnly')})` : ''}`}
                  onClick={() => pick(t)}
                >
                  <span class="ws-menu-check" aria-hidden="true">
                    {active ? <I.check2 size={12} /> : locked ? <I.lock size={11} /> : v.destructive ? <span class="ws-action-dot" /> : null}
                  </span>
                  <span class="flex-1 truncate">{v.title[locale]}</span>
                  {v.multiFile && (
                    <span class="mono text-[10px]" style={{ color: 'var(--faint)' }}>
                      n
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav class="ws-actionbar" aria-label={w(locale, 'tools')} data-actionbar data-tool-count={list.length} ref={root}>
      <div class="ws-actionbar-scroll">
        {groups.map(renderGroup)}
        {/* individual tools stay addressable for tests/deep-links even when their menu is closed */}
        <span class="sr-only" data-tool-list>
          {list.map((t) => (
            <span key={t.view.id} data-tool={t.view.id} />
          ))}
        </span>
      </div>
      {activeTool && (
        <span class="ws-action-active" data-active-tool={activeTool.view.id}>
          <I.wand size={12} /> {activeTool.view.title[locale]}
        </span>
      )}
      <button type="button" class="ws-icon-btn" aria-label={w(locale, 'palette')} title="⌘K" onClick={() => setUi({ paletteOpen: true })}>
        <I.command size={14} />
      </button>
    </nav>
  );
}
