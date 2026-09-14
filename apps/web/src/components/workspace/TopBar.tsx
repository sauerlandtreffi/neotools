import { useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { activeFile, busy, canRedo, canUndo, redo, renameSession, setLayout, setUi, undo, workspace } from '../../lib/workspace/store';
import { I } from './Icons';
import MenuBar from './MenuBar';

interface Props {
  locale: Locale;
  brandName: string;
  logo: string;
  /** Embedded on `/` and not expanded → show the one quiet sentence instead of the session name. */
  showTagline: boolean;
  onToggleTray?: () => void;
}

/**
 * Title/menu bar of the program shell (pivot §11.1/4). Left: brand + menus,
 * centre: session name (editable) or tagline, right: undo/redo, ⌘K, export,
 * panel toggles.
 */
export default function TopBar({ locale, brandName, logo, showTagline, onToggleTray }: Props) {
  const s = workspace.value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const session = s.session;
  const infoBase = locale === 'de' ? '/info' : '/en/info';
  const hasFiles = Boolean(session?.files.length);

  return (
    <header class="ws-topbar" data-topbar>
      {onToggleTray && (
        <button type="button" class="ws-icon-btn ws-only-mobile" aria-label={w(locale, 'bin')} onClick={onToggleTray}>
          <I.menu size={16} />
        </button>
      )}
      <a href={locale === 'de' ? '/' : '/en'} class="ws-brand" aria-label={brandName} onClick={(e) => {
        if (hasFiles && !s.overview) {
          e.preventDefault();
          setUi({ overview: true });
        }
      }}>
        <img src={logo} alt="" width="20" height="20" />
        <span class="ws-brand-name">{brandName}</span>
      </a>
      <div class="ws-hide-mobile">
        <MenuBar locale={locale} infoBase={infoBase} />
      </div>
      <div class="ws-topbar-center">
        {showTagline || !session || !hasFiles ? (
          <span class="ws-tagline" data-tagline>
            {w(locale, 'tagline')}
          </span>
        ) : editing ? (
          <form
            class="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void renameSession(draft);
              setEditing(false);
            }}
          >
            <input
              class="field ws-session-input"
              value={draft}
              aria-label={w(locale, 'sessionName')}
              autoFocus
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              onBlur={() => {
                void renameSession(draft);
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            class="ws-session-name"
            title={w(locale, 'sessionName')}
            data-session-name
            onClick={() => {
              setDraft(session.name);
              setEditing(true);
            }}
          >
            {session.name}
          </button>
        )}
      </div>
      <div class="ws-topbar-right">
        <button type="button" class="ws-icon-btn ws-hide-mobile" aria-label={w(locale, 'undo')} title={`${w(locale, 'undo')} ⌘Z`} disabled={!canUndo.value || busy.value} data-top-undo onClick={() => void undo()}>
          <I.undo size={15} />
        </button>
        <button type="button" class="ws-icon-btn ws-hide-mobile" aria-label={w(locale, 'redo')} title={`${w(locale, 'redo')} ⇧⌘Z`} disabled={!canRedo.value || busy.value} onClick={() => void redo()}>
          <I.redo size={15} />
        </button>
        <button type="button" class="ws-icon-btn ws-hide-mobile" aria-label={w(locale, 'commandPalette')} title="⌘K" data-palette-open onClick={() => setUi({ paletteOpen: true })}>
          <I.command size={15} />
        </button>
        <button type="button" class="ws-primary-btn" disabled={!activeFile.value} data-open-export onClick={() => setUi({ exportOpen: true })}>
          <I.export size={14} /> <span class="ws-hide-mobile">{w(locale, 'export')}</span>
        </button>
        <span class="ws-topbar-sep ws-hide-mobile" aria-hidden="true" />
        <button
          type="button"
          class="ws-icon-btn ws-hide-mobile"
          aria-label={w(locale, 'toggleBin')}
          aria-pressed={s.binOpen}
          title={`${w(locale, 'toggleBin')} ⌘B`}
          data-toggle-bin
          onClick={() => setLayout({ binOpen: !s.binOpen })}
        >
          <I.panelLeft size={15} />
        </button>
        <button
          type="button"
          class="ws-icon-btn ws-hide-mobile"
          aria-label={w(locale, 'toggleInspector')}
          aria-pressed={s.inspectorOpen}
          title={`${w(locale, 'toggleInspector')} ⌘J`}
          data-toggle-inspector
          onClick={() => setLayout({ inspectorOpen: !s.inspectorOpen })}
        >
          <I.panelRight size={15} />
        </button>
        <a href={`${infoBase}/`} class="ws-icon-btn ws-hide-mobile" aria-label={w(locale, 'helpInfo')} title={w(locale, 'helpInfo')} data-help-link>
          <I.help size={15} />
        </a>
      </div>
    </header>
  );
}
