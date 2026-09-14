import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';

interface PaletteItem {
  href: string;
  title: string;
  hint?: string;
  group: string;
}

interface Props {
  locale: Locale;
  itemsJson: string;
}

export default function CommandPalette({ locale, itemsJson }: Props) {
  const items = useMemo(() => JSON.parse(itemsJson) as PaletteItem[], [itemsJson]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = items.filter((item) => {
    const hay = `${item.title} ${item.hint ?? ''} ${item.group} ${item.href}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQ('');
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'command')}
        class="w-full max-w-xl rounded-lg border p-3 shadow-xl"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="stamp mb-2">{t(locale, 'command')} · ⌘K</div>
        <input
          autofocus
          class="w-full rounded border bg-transparent px-3 py-2"
          style={{ borderColor: 'var(--line)' }}
          placeholder={t(locale, 'searchHint')}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <ul class="mt-3 max-h-80 overflow-auto">
          {filtered.map((item) => (
            <li key={`${item.group}-${item.href}`}>
              <a class="block rounded px-2 py-2 no-underline hover:bg-black/5" href={item.href}>
                <span class="mono text-xs" style={{ color: 'var(--muted)' }}>
                  {item.group}
                </span>
                <div>{item.title}</div>
                {item.hint && (
                  <div class="text-xs" style={{ color: 'var(--muted)' }}>
                    {item.hint}
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
