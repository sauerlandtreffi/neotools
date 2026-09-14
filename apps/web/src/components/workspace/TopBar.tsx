import { useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { activeFile, busy, canRedo, canUndo, newSession, redo, renameSession, setUi, undo, workspace } from '../../lib/workspace/store';
import ThemeToggle from '../ThemeToggle';
import TrustBadge from './TrustBadge';
import { I } from './Icons';

interface Props {
  locale: Locale;
  brandName: string;
  logo: string;
  onToggleTray?: () => void;
}

export default function TopBar({ locale, brandName, logo, onToggleTray }: Props) {
  const s = workspace.value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const session = s.session;
  const other: Locale = locale === 'de' ? 'en' : 'de';
  const home = locale === 'de' ? '/' : '/en/';
  const historyHref = locale === 'de' ? '/verlauf' : '/en/history';

  return (
    <header class="ws-topbar" data-topbar>
      {onToggleTray && (
        <button type="button" class="btn btn-ghost btn-icon ws-only-mobile" aria-label={w(locale, 'tray')} onClick={onToggleTray}>
          <I.menu />
        </button>
      )}
      <a href={home} class="ws-brand" aria-label={brandName}>
        <img src={logo} alt="" width="28" height="28" />
        <span class="ws-brand-name">{brandName}</span>
        <span class="stamp ws-brand-app">{w(locale, 'appTitle')}</span>
      </a>
      <span class="ws-topbar-sep" aria-hidden="true" />
      {session ? (
        editing ? (
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
        )
      ) : (
        <span class="text-sm" style={{ color: 'var(--muted)' }}>
          {w(locale, 'newSession')}
        </span>
      )}
      <span class="ml-auto flex items-center gap-1">
        <TrustBadge locale={locale} />
        <span class="ws-topbar-sep ws-hide-mobile" aria-hidden="true" />
        <button type="button" class="btn btn-ghost btn-icon ws-hide-mobile" aria-label={w(locale, 'undo')} title="⌘Z" disabled={!canUndo.value || busy.value} data-top-undo onClick={() => void undo()}>
          <I.undo />
        </button>
        <button type="button" class="btn btn-ghost btn-icon ws-hide-mobile" aria-label={w(locale, 'redo')} title="⇧⌘Z" disabled={!canRedo.value || busy.value} onClick={() => void redo()}>
          <I.redo />
        </button>
        <button type="button" class="btn btn-ghost btn-sm ws-hide-mobile" aria-label={w(locale, 'palette')} title="⌘K" onClick={() => setUi({ paletteOpen: true })}>
          <I.command size={14} /> <kbd>⌘K</kbd>
        </button>
        <button type="button" class="btn btn-primary btn-sm" disabled={!activeFile.value} data-open-export onClick={() => setUi({ exportOpen: true })}>
          <I.export size={14} /> <span class="ws-hide-mobile">{w(locale, 'export')}</span>
        </button>
        <span class="ws-topbar-sep ws-hide-mobile" aria-hidden="true" />
        <a href={historyHref} class="btn btn-ghost btn-sm ws-hide-mobile">
          {w(locale, 'history')}
        </a>
        <button type="button" class="btn btn-ghost btn-sm ws-hide-mobile" onClick={() => void newSession()}>
          <I.plus size={14} /> {w(locale, 'newSession')}
        </button>
        <a href={`${locale === 'de' ? '/en/app' : '/app'}${location?.search ?? ''}`} hreflang={other} class="btn btn-ghost btn-sm mono uppercase">
          {other}
        </a>
        <ThemeToggle locale={locale} compact />
      </span>
    </header>
  );
}
