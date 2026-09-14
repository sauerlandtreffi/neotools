import { useEffect, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';
import { buildWorkspaceQuery, workspacePath } from '../lib/workspace/router';
import { getSessionStore } from '../lib/workspace/session-store';
import type { SessionSummary } from '../lib/workspace/types';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Workspace sessions on /verlauf (W1) — the classic run history stays below. */
export default function SessionsList({ locale }: { locale: Locale }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const load = () =>
    getSessionStore()
      .list()
      .then(setSessions)
      .catch(() => setSessions([]));

  useEffect(() => {
    void load();
  }, []);

  if (sessions === null) return null;

  return (
    <section class="grid gap-3" aria-labelledby="sessions-h" data-sessions>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sessions-h" class="text-2xl">
          {t(locale, 'sessions')}
        </h2>
        <a class="btn btn-primary btn-sm" href={workspacePath(locale)}>
          {t(locale, 'openWorkspace')}
        </a>
      </div>
      <p class="text-sm" style={{ color: 'var(--muted)' }}>
        {t(locale, 'sessionsHint')}
      </p>
      {sessions.length === 0 ? (
        <p class="text-sm" style={{ color: 'var(--faint)' }}>
          —
        </p>
      ) : (
        <ul class="grid gap-2">
          {sessions.map((s) => (
            <li key={s.id} class="card flex flex-wrap items-center gap-3 p-3" data-session-row={s.id}>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{s.name}</div>
                <div class="truncate text-xs tnum" style={{ color: 'var(--muted)' }}>
                  {fmt.format(s.updatedAt)} · {s.fileCount} {locale === 'de' ? 'Dateien' : 'files'} · {s.stepCount}{' '}
                  {locale === 'de' ? 'Schritte' : 'steps'} · {fmtBytes(s.bytes)}
                </div>
                <div class="truncate text-xs" style={{ color: 'var(--faint)' }}>
                  {s.fileNames.slice(0, 4).join(', ')}
                  {s.fileNames.length > 4 ? ` +${s.fileNames.length - 4}` : ''}
                </div>
              </div>
              <a class="btn btn-sm" href={`${workspacePath(locale)}${buildWorkspaceQuery({ session: s.id })}`}>
                {t(locale, 'openSession')}
              </a>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => {
                  void getSessionStore()
                    .delete(s.id)
                    .then(load);
                }}
              >
                {t(locale, 'deleteSession')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
