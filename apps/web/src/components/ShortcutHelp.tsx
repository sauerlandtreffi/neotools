import { useEffect, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';

const ROWS: Array<{ keys: string; de: string; en: string }> = [
  { keys: '⌘/Ctrl K', de: 'Befehlspalette', en: 'Command palette' },
  { keys: '?', de: 'Diese Übersicht', en: 'This cheat sheet' },
  { keys: 'Esc', de: 'Dialog schließen', en: 'Close dialog' },
  { keys: 'Tab', de: 'Fokus vor', en: 'Focus next' },
];

export default function ShortcutHelp({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'shortcuts')}
        class="w-full max-w-md rounded-lg border p-4"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-xl">{t(locale, 'shortcuts')}</h2>
        <table class="mt-3 w-full text-sm">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.keys}>
                <td class="mono py-1 pr-3">{row.keys}</td>
                <td>{locale === 'de' ? row.de : row.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
