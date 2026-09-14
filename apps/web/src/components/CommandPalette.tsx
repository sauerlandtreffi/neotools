import { useEffect, useState } from 'preact/hooks';
import { localePath, t, type Locale } from '../lib/i18n';

interface ToolHit {
  id: string;
  title: Record<'de' | 'en', string>;
  description: Record<'de' | 'en', string>;
}

interface Props {
  locale: Locale;
  toolsJson: string;
}

export default function CommandPalette({ locale, toolsJson }: Props) {
  const tools = JSON.parse(toolsJson) as ToolHit[];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = tools.filter((tool) => {
    const hay = `${tool.id} ${tool.title.de} ${tool.title.en} ${tool.description.de} ${tool.description.en}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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
    <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
      <div
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
          {filtered.map((tool) => (
            <li key={tool.id}>
              <a class="block rounded px-2 py-2 no-underline hover:bg-black/5" href={localePath(locale, `/${tool.id}`)}>
                <span class="mono text-xs">{tool.id}</span>
                <div>{tool.title[locale]}</div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
