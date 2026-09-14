import { useEffect, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';
import { createToolWorker } from '../lib/worker-client';

interface Row {
  id: string;
  ready: boolean;
  sizeBytes: number;
  license: string;
  confirmMessageDe: string;
  confirmMessageEn: string;
}

export default function ModelConfirm({
  locale,
  toolId,
  confirmed,
  onConfirm,
}: {
  locale: Locale;
  toolId: string;
  confirmed: boolean;
  onConfirm: (next: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const s = createToolWorker();
    void s.api
      .modelStatus(toolId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => s.terminate());
  }, [toolId]);

  if (!rows.length) return null;

  return (
    <section class="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <h2 class="stamp mb-2">{t(locale, 'loadModel')}</h2>
      <ul class="grid gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.id}</strong> · {(row.sizeBytes / 1_000_000).toFixed(1)} MB · {row.license}
            <div class="stamp" style={{ color: 'var(--muted)' }}>
              {row.ready ? t(locale, 'modelCached') : locale === 'de' ? row.confirmMessageDe : row.confirmMessageEn}
            </div>
          </li>
        ))}
      </ul>
      {rows.some((r) => !r.ready) && (
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirm((e.target as HTMLInputElement).checked)}
          />
          {locale === 'de'
            ? 'Ja, Modelle same-origin laden und im Cache behalten.'
            : 'Yes, load same-origin models into cache.'}
        </label>
      )}
    </section>
  );
}
