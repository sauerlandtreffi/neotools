import { t, type Locale } from '../lib/i18n';

interface Props {
  locale: Locale;
}

export default function ThemeToggle({ locale }: Props) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    root.classList.toggle('dark', next === 'dark');
    localStorage.setItem('neotools-theme', next);
  };
  return (
    <button type="button" class="stamp rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} onClick={toggle}>
      {t(locale, 'theme')}
    </button>
  );
}
