import { useEffect, useState } from 'preact/hooks';
import { encodePipelineHash, type FormField } from '@neotools/engine';
import ZodForm from './ZodForm';
import { t, type Locale } from '../lib/i18n';
import { createToolWorker, downloadBytes, type WorkerFile } from '../lib/worker-client';

export interface CatalogTool {
  id: string;
  title: Record<'de' | 'en', string>;
  fields: FormField[];
}

interface StepState {
  toolId: string;
  options: Record<string, unknown>;
}

interface Props {
  locale: Locale;
  catalogJson: string;
}

export default function PipelineBuilder({ locale, catalogJson }: Props) {
  const catalog = JSON.parse(catalogJson) as CatalogTool[];
  const [steps, setSteps] = useState<StepState[]>([]);
  const [files, setFiles] = useState<WorkerFile[]>([]);
  const [hash, setHash] = useState('');
  const [outputs, setOutputs] = useState<WorkerFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const spec = { steps };
    try {
      const encoded = encodePipelineHash(spec);
      setHash(encoded);
      if (steps.length) history.replaceState(null, '', encoded);
    } catch {
      // ignore
    }
  }, [steps]);

  useEffect(() => {
    if (!location.hash.startsWith('#p=')) return;
    try {
      const raw = location.hash.slice(3);
      const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
      const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
      const json = JSON.parse(atob(padded + pad));
      if (Array.isArray(json.steps)) setSteps(json.steps);
    } catch {
      // ignore
    }
  }, []);

  const addStep = (toolId: string) => {
    const tool = catalog.find((c) => c.id === toolId);
    if (!tool) return;
    const options: Record<string, unknown> = {};
    for (const f of tool.fields) if (f.defaultValue !== undefined) options[f.name] = f.defaultValue;
    setSteps((s) => [...s, { toolId, options }]);
  };

  const run = async () => {
    setError(null);
    const session = createToolWorker();
    try {
      const result = await session.api.runPipeline({ steps }, files);
      setOutputs(result.outputs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      session.terminate();
    }
  };

  return (
    <div class="grid gap-6">
      <label class="block">
        <span class="stamp">{t(locale, 'addStep')}</span>
        <select
          class="mt-1 w-full rounded border px-2 py-2"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          onChange={(e) => {
            const id = (e.target as HTMLSelectElement).value;
            if (id) addStep(id);
            (e.target as HTMLSelectElement).value = '';
          }}
        >
          <option value="">—</option>
          {catalog.map((tool) => (
            <option value={tool.id}>{tool.title[locale]}</option>
          ))}
        </select>
      </label>

      {steps.map((step, i) => {
        const tool = catalog.find((c) => c.id === step.toolId);
        return (
          <article key={`${step.toolId}-${i}`} class="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
            <div class="mb-2 flex justify-between">
              <strong>
                {i + 1}. {tool?.title[locale] ?? step.toolId}
              </strong>
              <button type="button" onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}>
                ×
              </button>
            </div>
            <ZodForm
              fields={tool?.fields ?? []}
              values={step.options}
              onChange={(options) =>
                setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, options } : st)))
              }
            />
          </article>
        );
      })}

      <input
        type="file"
        multiple
        onChange={async (e) => {
          const next: WorkerFile[] = [];
          for (const file of [...((e.target as HTMLInputElement).files ?? [])]) {
            next.push({
              name: file.name,
              mime: file.type || 'application/pdf',
              data: new Uint8Array(await file.arrayBuffer()),
            });
          }
          setFiles(next);
        }}
      />

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-md px-4 py-2"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          disabled={!steps.length || !files.length}
          onClick={run}
        >
          {t(locale, 'execute')}
        </button>
        <button
          type="button"
          class="rounded-md border px-4 py-2"
          style={{ borderColor: 'var(--line)' }}
          onClick={() => navigator.clipboard.writeText(`${location.origin}${location.pathname}${hash}`)}
        >
          {t(locale, 'share')}
        </button>
      </div>
      {hash && <p class="mono break-all text-xs">{hash}</p>}
      {error && <p style={{ color: '#c45c26' }}>{error}</p>}
      <ul>
        {outputs.map((file) => (
          <li>
            <button type="button" onClick={() => downloadBytes(file.name, file.data, file.mime)}>
              {file.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
