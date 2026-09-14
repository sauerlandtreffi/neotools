import { useEffect, useMemo, useState } from 'preact/hooks';
import { encodePipelineHash, mimeAccepted, pipelinePayloadMimes, type FormField } from '@neotools/engine';
import ZodForm from './ZodForm';
import { localePath, t, type Locale } from '../lib/i18n';
import { createToolWorker, downloadBytes, type WorkerFile } from '../lib/worker-client';
import { getBrowserHistoryStore } from '../lib/history';
import { decodePipelineHash, sanitizePipelineSteps } from '../lib/pipeline-import';

export interface CatalogTool {
  id: string;
  title: Record<'de' | 'en', string>;
  fields: FormField[];
  accept: string[];
  outputs: string[];
  pack: string;
  lockedKeys: string[];
}

export interface LibraryPreset {
  id: string;
  title: Record<'de' | 'en', string>;
  description: Record<'de' | 'en', string>;
  steps: StepState[];
  pending: boolean;
  missing: string[];
}

interface StepState {
  toolId: string;
  options: Record<string, unknown>;
  whenMime?: string[];
}

interface Props {
  locale: Locale;
  catalogJson: string;
  libraryJson: string;
  requiredJson?: string;
}

export default function PipelineBuilder({ locale, catalogJson, libraryJson, requiredJson = '[]' }: Props) {
  const catalog = JSON.parse(catalogJson) as CatalogTool[];
  const library = JSON.parse(libraryJson) as LibraryPreset[];
  const required = JSON.parse(requiredJson) as Array<{ name: string; tools: string[] }>;
  const [steps, setSteps] = useState<StepState[]>([]);
  const [files, setFiles] = useState<WorkerFile[]>([]);
  const [hash, setHash] = useState('');
  const [outputs, setOutputs] = useState<WorkerFile[]>([]);
  const [intermediates, setIntermediates] = useState<Array<{ toolId: string; files: WorkerFile[] }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ v: number; m?: string } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const typeErrors = useMemo(() => {
    const errors: string[] = [];
    let prev = pipelinePayloadMimes(files.map((f) => f.mime));
    steps.forEach((step, index) => {
      const tool = catalog.find((c) => c.id === step.toolId);
      if (!tool) {
        errors.push(`${locale === 'de' ? 'Unbekanntes Tool' : 'Unknown tool'}: ${step.toolId}`);
        return;
      }
      const incoming = prev.filter((m) => !step.whenMime?.length || mimeAccepted(m, step.whenMime));
      for (const mime of incoming) {
        if (!mimeAccepted(mime, tool.accept)) {
          errors.push(
            locale === 'de'
              ? `Schritt ${index + 1} akzeptiert kein ${mime}`
              : `Step ${index + 1} does not accept ${mime}`,
          );
        }
      }
      const emitted = pipelinePayloadMimes(tool.outputs.length ? tool.outputs : incoming);
      if (step.whenMime?.length) {
        prev = [...new Set([...emitted, ...prev.filter((m) => !mimeAccepted(m, step.whenMime!))])];
      } else {
        prev = emitted;
      }
    });
    return errors;
  }, [catalog, files, locale, steps]);

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
    if (steps.length || !required.length || location.hash.startsWith('#p=')) return;
    const first = required[0];
    if (!first?.tools.length) return;
    setSteps(
      first.tools.map((toolId) => {
        const tool = catalog.find((c) => c.id === toolId);
        const options: Record<string, unknown> = {};
        for (const f of tool?.fields ?? []) if (f.defaultValue !== undefined) options[f.name] = f.defaultValue;
        return { toolId, options };
      }),
    );
  }, [catalog, required, steps.length]);

  useEffect(() => {
    if (!location.hash.startsWith('#p=')) return;
    try {
      const json = decodePipelineHash(location.hash.slice(3)) as { steps?: unknown } | undefined;
      if (!json || typeof json !== 'object') return;
      const known = new Set(catalog.map((c) => c.id));
      const next = sanitizePipelineSteps(json.steps, known);
      if (next.length) setSteps(next);
    } catch {
      // ignore
    }
  }, [catalog]);

  const addStep = (toolId: string) => {
    const tool = catalog.find((c) => c.id === toolId);
    if (!tool) return;
    const options: Record<string, unknown> = {};
    for (const f of tool.fields) if (f.defaultValue !== undefined) options[f.name] = f.defaultValue;
    setSteps((s) => [...s, { toolId, options }]);
  };

  const loadPreset = (preset: LibraryPreset) => {
    if (preset.pending) return;
    setSteps(preset.steps.map((s) => ({ ...s, options: { ...s.options } })));
  };

  const run = async () => {
    setError(null);
    setIntermediates([]);
    setOutputs([]);
    setHistoryId(null);
    const session = createToolWorker();
    try {
      const result = await session.api.runPipeline(
        { steps },
        files,
        session.proxy((v: number, m?: string) => {
          setProgress({ v, m });
        }),
      );
      setIntermediates([]);
      setOutputs(result.outputs.filter((file) => file.mime !== 'application/json'));
      setProgress({ v: 1, m: locale === 'de' ? 'Fertig' : 'Done' });
      const record = await getBrowserHistoryStore().save({
        toolId: 'pipeline',
        options: { steps },
        inputs: files,
        outputs: result.outputs,
      });
      setHistoryId(record.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      session.terminate();
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, steps }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline.neopipeline.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveTeamFragment = () => {
    const fragment = {
      version: 1,
      organization: 'local',
      defaults: {},
      locked: {},
      hiddenTools: [],
      requiredPipelines: { custom: steps.map((s) => s.toolId) },
      pipeline: { steps },
    };
    const blob = new Blob([JSON.stringify(fragment, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presets.fragment.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="grid gap-6" data-pipeline-ready="1">
      {required.length > 0 && (
        <aside class="rounded-lg border p-4" style={{ borderColor: 'var(--accent)' }} data-required-pipeline>
          <strong>{t(locale, 'requiredPipeline')}</strong>
          <ul class="mt-2 list-disc pl-5 text-sm">
            {required.map((row) => (
              <li key={row.name}>
                {row.name}: {row.tools.join(' → ')}
              </li>
            ))}
          </ul>
        </aside>
      )}

      <section>
        <h2 class="stamp mb-2">{t(locale, 'pipelineLibrary')}</h2>
        <div class="flex flex-wrap gap-2">
          {library.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-pipeline-preset={preset.id}
              class="rounded-full border px-3 py-1 text-sm"
              style={{ borderColor: 'var(--line)', opacity: preset.pending ? 0.55 : 1 }}
              disabled={preset.pending}
              title={preset.pending ? `${t(locale, 'pendingPreset')}: ${preset.missing.join(', ')}` : preset.description[locale]}
              onClick={() => loadPreset(preset)}
            >
              {preset.title[locale]}
              {preset.pending ? ' · pending' : ''}
            </button>
          ))}
        </div>
      </section>

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
            <option value={tool.id}>
              {tool.title[locale]} ({tool.pack})
            </option>
          ))}
        </select>
      </label>

      {steps.map((step, i) => {
        const tool = catalog.find((c) => c.id === step.toolId);
        return (
          <article key={`${step.toolId}-${i}`} class="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
            <div class="mb-2 flex flex-wrap justify-between gap-2">
              <strong>
                {i + 1}. {tool?.title[locale] ?? step.toolId}
              </strong>
              <button type="button" onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}>
                ×
              </button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="mono text-xs" style={{ color: 'var(--muted)' }}>
                {t(locale, 'branchMime')}
              </span>
              <input
                class="mt-1 w-full rounded border px-2 py-2"
                style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
                placeholder="application/pdf, image/*"
                value={(step.whenMime ?? []).join(', ')}
                onInput={(e) => {
                  const whenMime = (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, whenMime: whenMime.length ? whenMime : undefined } : st)));
                }}
              />
            </label>
            <ZodForm
              fields={tool?.fields ?? []}
              values={step.options}
              locked={tool?.lockedKeys}
              onChange={(options) => setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, options } : st)))}
            />
          </article>
        );
      })}

      <input
        type="file"
        multiple
        data-pipeline-files
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

      {typeErrors.length > 0 && (
        <ul class="text-sm" style={{ color: '#c45c26' }} data-mime-errors>
          {typeErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-md px-4 py-2"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          data-pipeline-run
          disabled={!steps.length || !files.length || typeErrors.length > 0}
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
        <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={exportJson}>
          {t(locale, 'exportJson')}
        </button>
        <label class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }}>
          {t(locale, 'importJson')}
          <input
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text()) as { steps?: StepState[]; pipeline?: { steps?: StepState[] } };
                const known = new Set(catalog.map((c) => c.id));
                const next = sanitizePipelineSteps(parsed.steps ?? parsed.pipeline?.steps, known);
                if (next.length) setSteps(next);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </label>
        <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={saveTeamFragment}>
          {t(locale, 'saveTeamPreset')}
        </button>
      </div>
      {hash && <p class="mono break-all text-xs">{hash}</p>}
      {progress && (
        <div>
          <progress class="w-full" value={progress.v} max={1} />
          <div class="mono text-xs">
            {Math.round(progress.v * 100)}% {progress.m}
          </div>
        </div>
      )}
      {error && <p style={{ color: '#c45c26' }}>{error}</p>}
      {historyId && (
        <p class="text-sm">
          {t(locale, 'historySaved')} ·{' '}
          <a href={localePath(locale, locale === 'de' ? '/verlauf' : '/history')}>{t(locale, 'history')}</a>
        </p>
      )}
      {intermediates.length > 0 && (
        <section>
          <h2 class="stamp mb-2">{t(locale, 'intermediates')}</h2>
          {intermediates.map((row, i) => (
            <div key={`${row.toolId}-${i}`} class="mb-2 text-sm">
              <strong>
                {i + 1}. {row.toolId}
              </strong>
              <ul>
                {row.files.map((file) => (
                  <li>
                    <button type="button" onClick={() => downloadBytes(file.name, file.data, file.mime)}>
                      {file.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      <ul>
        {outputs.map((file) => (
          <li>
            <button type="button" data-pipeline-download onClick={() => downloadBytes(file.name, file.data, file.mime)}>
              {file.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
