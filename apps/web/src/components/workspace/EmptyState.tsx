import { useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { addBrowserFiles, deleteSession, openSession, workspace } from '../../lib/workspace/store';
import { I } from './Icons';

export default function EmptyState({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div class="ws-empty nt-fade-in" data-empty-state>
      <input
        ref={input}
        type="file"
        multiple
        class="sr-only"
        data-empty-input
        onChange={(e) => {
          const list = Array.from((e.target as HTMLInputElement).files ?? []);
          (e.target as HTMLInputElement).value = '';
          void addBrowserFiles(list);
        }}
      />
      <div
        class="ws-empty-drop"
        data-over={over}
        data-empty-drop
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addBrowserFiles(Array.from(e.dataTransfer?.files ?? []));
        }}
      >
        <p class="stamp" style={{ color: 'var(--accent-text)' }}>
          {w(locale, 'local')} · 0 Uploads
        </p>
        <h1 class="ws-empty-title">{w(locale, 'emptyTitle')}</h1>
        <p class="ws-empty-lead">{w(locale, 'emptyLead')}</p>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" class="btn btn-primary" onClick={() => input.current?.click()}>
            <I.plus size={16} /> {w(locale, 'chooseFiles')}
          </button>
          <span class="text-sm" style={{ color: 'var(--muted)' }}>
            {w(locale, 'dropHint').replace(/ (oder|or)$/, '')} · <kbd>⌘O</kbd> <kbd>⌘V</kbd>
          </span>
        </div>
      </div>
      {s.recent.length > 0 && (
        <section class="ws-empty-recent">
          <h2 class="stamp" style={{ color: 'var(--muted)' }}>
            {w(locale, 'recentSessions')}
          </h2>
          <ul class="grid gap-1">
            {s.recent.map((r) => (
              <li key={r.id} class="ws-recent-row">
                <button type="button" class="ws-recent-main" data-recent={r.id} onClick={() => void openSession(r.id)}>
                  <span class="truncate font-medium">{r.name}</span>
                  <span class="text-xs tnum" style={{ color: 'var(--muted)' }}>
                    {fmt.format(r.updatedAt)} · {r.steps} {w(locale, 'steps').toLowerCase()}
                  </span>
                </button>
                <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'remove')} onClick={() => void deleteSession(r.id)}>
                  <I.trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
