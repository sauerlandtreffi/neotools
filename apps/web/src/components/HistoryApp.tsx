import { useEffect, useState } from 'preact/hooks';
import { encodePipelineHash } from '@neotools/engine';
import { localePath, t, type Locale } from '../lib/i18n';
import {
  DEFAULT_HISTORY_SETTINGS,
  getBrowserHistoryStore,
  journalCsv,
  journalJsonl,
  type HistoryRecord,
  type HistorySettings,
} from '../lib/history';
import { downloadBytes } from '../lib/worker-client';

export default function HistoryApp({ locale }: { locale: Locale }) {
  const [rows, setRows] = useState<HistoryRecord[]>([]);
  const [settings, setSettings] = useState<HistorySettings>(DEFAULT_HISTORY_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const store = getBrowserHistoryStore();
    setRows(await store.list());
    setSettings(await store.settings());
  };

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const historyPath = locale === 'de' ? '/verlauf' : '/history';

  return (
    <div class="grid gap-6">
      <p class="text-sm" style={{ color: 'var(--muted)' }}>
        {t(locale, 'storedLocal')}
      </p>
      {error && <p style={{ color: '#c45c26' }}>{error}</p>}

      <section class="flex flex-wrap items-center gap-4 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.keepInputs}
            onChange={(e) => {
              const keepInputs = (e.target as HTMLInputElement).checked;
              void getBrowserHistoryStore()
                .updateSettings({ keepInputs })
                .then(setSettings);
            }}
          />
          {t(locale, 'keepInputs')}
        </label>
        <label class="text-sm">
          {t(locale, 'expire')}
          <input
            class="ml-2 w-20 rounded border px-2 py-1"
            type="number"
            min={1}
            max={168}
            value={Math.round(settings.ttlMs / 3600000)}
            onChange={(e) => {
              const hours = Number((e.target as HTMLInputElement).value);
              void getBrowserHistoryStore()
                .updateSettings({ ttlMs: Math.max(1, hours) * 3600000 })
                .then(setSettings);
            }}
          />{' '}
          {t(locale, 'hours')}
        </label>
        <span class="mono text-xs" style={{ color: 'var(--muted)' }}>
          {t(locale, 'quota')} ≤ {Math.round(settings.maxBytes / 1024 / 1024)} MB
        </span>
        <button
          type="button"
          class="rounded-md border px-3 py-1 text-sm"
          style={{ borderColor: '#c45c26', color: '#c45c26' }}
          onClick={() => {
            if (!confirm(t(locale, 'deleteAllConfirm'))) return;
            void getBrowserHistoryStore()
              .clear()
              .then(() => setRows([]));
          }}
        >
          {t(locale, 'deleteAll')}
        </button>
        <button
          type="button"
          class="text-sm underline"
          onClick={() => downloadBytes('journal.jsonl', new TextEncoder().encode(journalJsonl(rows)), 'application/jsonl')}
        >
          {t(locale, 'exportJsonl')}
        </button>
        <button
          type="button"
          class="text-sm underline"
          onClick={() => downloadBytes('journal.csv', new TextEncoder().encode(journalCsv(rows)), 'text/csv')}
        >
          {t(locale, 'exportCsv')}
        </button>
      </section>

      {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>{t(locale, 'historyEmpty')}</p>}

      <ul class="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} class="rounded-lg border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <a class="text-lg" href={localePath(locale, `/${row.toolId}`)}>
                {row.toolId}
              </a>
              <time class="mono text-xs" dateTime={new Date(row.createdAt).toISOString()}>
                {new Date(row.createdAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en')}
              </time>
            </div>
            <p class="mono mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              {row.outputs.map((f) => f.name).join(', ') || '—'}
            </p>
            <div class="mt-3 flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const store = getBrowserHistoryStore();
                    for (const ref of row.outputs) {
                      const data = await store.readBlob(ref);
                      if (data) downloadBytes(ref.name, data, ref.mime);
                    }
                  })();
                }}
              >
                {t(locale, 'downloadAgain')}
              </button>
              <a href={`${localePath(locale, `/${row.toolId}`)}?rerun=${encodeURIComponent(row.id)}`}>
                {t(locale, 'rerun')}
              </a>
              <button
                type="button"
                onClick={() => {
                  const hash = encodePipelineHash({
                    steps: [{ toolId: row.toolId, options: row.options }],
                  });
                  location.assign(`${localePath(locale, '/pipeline')}${hash}`);
                }}
              >
                {t(locale, 'savePipeline')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void getBrowserHistoryStore()
                    .delete(row.id)
                    .then(reload);
                }}
              >
                {t(locale, 'reset')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p class="sr-only">{historyPath}</p>
    </div>
  );
}
