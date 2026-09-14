import { useState } from 'preact/hooks';
import { localePath, t, type Locale } from '../lib/i18n';
import { putHandoff } from '../lib/desktop-handoff';

interface Suggestable {
  id: string;
  title: Record<'de' | 'en', string>;
  accept: string[];
}

interface Props {
  locale: Locale;
  toolsJson: string;
}

export default function OpenApp({ locale, toolsJson }: Props) {
  const tools = JSON.parse(toolsJson) as Suggestable[];
  const [mime, setMime] = useState<string>('');
  const [name, setName] = useState('');
  const suggested = tools.filter((tool) =>
    mime ? tool.accept.some((a) => a === mime || a.endsWith('/*') && mime.startsWith(a.slice(0, -1))) : false,
  );

  return (
    <div class="grid gap-4">
      <input
        type="file"
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const nextMime = file.type || guess(file.name);
          if (nextMime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            void (async () => {
              await putHandoff(
                { name: file.name, mime: 'application/pdf', bytes: new Uint8Array(await file.arrayBuffer()) },
                { returnTo: 'reader' },
              );
              location.assign(`${localePath(locale, '/reader')}?open=1`);
            })();
            return;
          }
          setName(file.name);
          setMime(nextMime);
        }}
      />
      {name && (
        <p class="mono text-sm">
          {name} · {mime}
        </p>
      )}
      <h2 class="stamp">{t(locale, 'suggest')}</h2>
      <ul class="grid gap-2">
        {suggested.map((tool) => (
          <li>
            <a href={localePath(locale, `/${tool.id}`)}>{tool.title[locale]}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function guess(name: string): string {
  if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (name.toLowerCase().endsWith('.png')) return 'image/png';
  if (name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
