import { useEffect, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';

interface Props {
  locale: Locale;
  /** Compact icon-only button (workspace header). */
  compact?: boolean;
}

type Mode = 'light' | 'dark';

function currentMode(): Mode {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Theme toggle. Persists an explicit choice in `localStorage['neotools-theme']`;
 * without a stored choice the page follows `prefers-color-scheme` (see THEME_INIT_SCRIPT).
 */
export default function ThemeToggle({ locale, compact = false }: Props) {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    setMode(currentMode());
    const obs = new MutationObserver(() => setMode(currentMode()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const toggle = () => {
    const next: Mode = currentMode() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('neotools-theme', next);
    } catch {
      // private mode
    }
    setMode(next);
  };

  const label = mode === 'dark' ? t(locale, 'themeLight') : t(locale, 'themeDark');
  return (
    <button
      type="button"
      class={compact ? 'btn btn-ghost btn-icon' : 'btn btn-sm'}
      onClick={toggle}
      aria-label={label}
      aria-pressed={mode === 'dark'}
      title={label}
      data-theme-toggle
    >
      {mode === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
      {!compact && <span>{t(locale, 'theme')}</span>}
    </button>
  );
}
