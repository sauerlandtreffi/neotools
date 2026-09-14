import { useState } from 'preact/hooks';
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

export default function HomeSearch({ locale, toolsJson }: Props) {
  const tools = JSON.parse(toolsJson) as ToolHit[];
  const [q, setQ] = useState('');
  const hits = q
    ? tools.filter((tool) =>
        `${tool.id} ${tool.title.de} ${tool.title.en} ${tool.description[locale]}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : [];
  return (
    <div class="relative">
      <label class="stamp" style={{ color: 'var(--muted)' }}>
        {t(locale, 'search')}
      </label>
      <input
        class="mt-1 w-full rounded-lg border px-4 py-3"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        placeholder={`${t(locale, 'searchHint')} · ⌘K`}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {hits.length > 0 && (
        <ul
          class="absolute z-10 mt-1 w-full rounded-lg border p-2"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          {hits.map((tool) => (
            <li key={tool.id}>
              <a class="block px-2 py-1" href={localePath(locale, `/${tool.id}`)}>
                {tool.title[locale]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
