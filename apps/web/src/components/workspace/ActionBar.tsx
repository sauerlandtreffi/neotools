import { useMemo, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import {
  activeFile,
  familyOf,
  setPendingTool,
  setUi,
  tools,
  workspace,
  type WorkspaceToolMeta,
} from '../../lib/workspace/store';
import { I } from './Icons';

const PRIMARY_COUNT = 8;

export function toolsForActive(): WorkspaceToolMeta[] {
  const file = activeFile.value;
  const all = tools.value;
  if (!file) return [];
  const fam = familyOf(file);
  return all
    .filter((t) => acceptsMime(t.inputs.accept, file.mime))
    .filter((t) => !fam || !t.view.family.length || t.view.family.includes(fam))
    .sort((a, b) => a.view.priority - b.view.priority || a.view.id.localeCompare(b.view.id));
}

export function acceptsMime(accept: string[], mime: string): boolean {
  return accept.some((rule) => rule === '*/*' || rule === mime || (rule.endsWith('/*') && mime.startsWith(rule.slice(0, -1))));
}

export default function ActionBar({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const file = activeFile.value;
  const [more, setMore] = useState(false);
  const list = useMemo(() => toolsForActive(), [file?.id, file?.mime, tools.value]);
  if (!file) return null;
  const primary = list.slice(0, PRIMARY_COUNT);
  const overflow = list.slice(PRIMARY_COUNT);
  const desktop = s.desktop;

  const render = (t: WorkspaceToolMeta) => {
    const v = t.view;
    const active = s.pendingToolId === v.id;
    const locked = v.desktopOnly && !desktop;
    const multi = v.multiFile;
    const onClick = () => {
      setMore(false);
      if (locked) {
        setPendingTool(v.id);
        return;
      }
      if (v.id === 'pdf-merge' || v.id === 'pdf-aktenbundler' || v.id === 'images-to-pdf') {
        setUi({ mergeOpen: true });
        return;
      }
      setPendingTool(active ? null : v.id);
    };
    return (
      <button
        key={v.id}
        type="button"
        class="ws-action"
        data-tool={v.id}
        data-active={active}
        data-locked={locked}
        aria-pressed={active}
        title={`${v.title[locale]} — ${v.description[locale]}${locked ? ` (${w(locale, 'desktopOnly')})` : ''}`}
        onClick={onClick}
      >
        {locked && <I.lock size={12} />}
        {v.destructive && !locked && <span class="ws-action-dot" aria-hidden="true" />}
        <span>{v.title[locale]}</span>
        {multi && <span class="mono text-[10px]" style={{ color: 'var(--faint)' }}>n</span>}
      </button>
    );
  };

  return (
    <nav class="ws-actionbar" aria-label={w(locale, 'tools')} data-actionbar>
      <div class="ws-actionbar-scroll">
        {primary.map(render)}
        {overflow.length > 0 && (
          <div class="relative">
            <button type="button" class="ws-action" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore((m) => !m)}>
              {w(locale, 'more')} <I.down size={12} />
            </button>
            {more && (
              <div class="ws-menu nt-pop" role="menu">
                {overflow.map((t) => (
                  <div key={t.view.id} role="menuitem">
                    {render(t)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <button type="button" class="ws-action ws-action-icon" aria-label={w(locale, 'palette')} title="⌘K" onClick={() => setUi({ paletteOpen: true })}>
        <I.command size={16} />
      </button>
    </nav>
  );
}
