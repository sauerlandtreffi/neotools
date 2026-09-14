import { useEffect, useRef, useState } from 'preact/hooks';
import type { FormField } from '@neotools/engine';
import ZodForm from './ZodForm';
import VerificationBlock from './VerificationBlock';
import RedactEditor from './RedactEditor';
import { localePath, t, type Locale } from '../lib/i18n';
import { createToolWorker, downloadBytes, zipDownload, type WorkerFile } from '../lib/worker-client';
import { putHandoffResult, takeHandoff } from '../lib/desktop-handoff';

export interface ToolMeta {
  id: string;
  inputs: { accept: string[]; multiple: boolean };
  presets?: Array<{ id: string; title: Record<'de' | 'en', string>; options: Record<string, unknown> }>;
  ui?: { editor?: string };
}

interface Props {
  locale: Locale;
  toolId: string;
  fieldsJson: string;
  metaJson: string;
}

interface BatchRow {
  file: string;
  status: string;
  reason?: string;
}

export default function ToolApp({ locale, toolId, fieldsJson, metaJson }: Props) {
  const fields = JSON.parse(fieldsJson) as FormField[];
  const meta = JSON.parse(metaJson) as ToolMeta;
  const [files, setFiles] = useState<WorkerFile[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>(defaultsFrom(fields));
  const [progress, setProgress] = useState<{ v: number; m?: string } | null>(null);
  const [outputs, setOutputs] = useState<WorkerFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof createToolWorker> | null>(null);

  useEffect(() => () => session.current?.terminate(), []);

  useEffect(() => {
    void takeHandoff().then((incoming) => {
      if (!incoming) return;
      setFiles([
        {
          name: incoming.name,
          mime: incoming.mime,
          data: incoming.bytes,
        },
      ]);
    });
  }, []);

  const addFiles = async (list: File[]) => {
    const next: WorkerFile[] = [];
    for (const file of list) {
      next.push({
        name: file.name,
        mime: file.type || guessMime(file.name),
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }
    setFiles((prev) => (meta.inputs.multiple ? [...prev, ...next] : next.slice(-1)));
  };

  const run = async () => {
    setError(null);
    setOutputs([]);
    session.current?.terminate();
    const s = createToolWorker();
    session.current = s;
    try {
      const result = await s.api.run(
        toolId,
        files,
        values,
        s.proxy((v: number, m?: string) => setProgress({ v, m })),
      );
      setOutputs(result.outputs);
      setWarnings(result.warnings);
      setReport(result.report ?? null);
      setProgress({ v: 1, m: 'OK' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancel = () => {
    session.current?.terminate();
    session.current = null;
    setProgress(null);
  };

  const batch = (report?.batch as BatchRow[] | undefined) ?? [];

  return (
    <div class="grid gap-6">
      <Drop
        locale={locale}
        accept={meta.inputs.accept.join(',')}
        multiple={meta.inputs.multiple}
        files={files}
        onFiles={addFiles}
        onClear={() => setFiles([])}
      />

      {meta.presets && meta.presets.length > 0 && (
        <section>
          <h2 class="stamp mb-2">{t(locale, 'presets')}</h2>
          <div class="flex flex-wrap gap-2">
            {meta.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                class="rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: 'var(--line)' }}
                onClick={() => setValues((v) => ({ ...v, ...p.options }))}
              >
                {p.title[locale]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 class="stamp mb-2">{t(locale, 'options')}</h2>
        <ZodForm fields={fields} values={values} onChange={setValues} />
      </section>

      {(meta.ui?.editor === 'redact' || toolId === 'pdf-redact') && files[0] && (
        <RedactEditor
          locale={locale}
          file={files[0]}
          values={values}
          onChangeValues={setValues}
          onRan={(result) => {
            setOutputs(result.outputs);
            setWarnings(result.warnings);
            setReport(result.report ?? null);
          }}
          onProgress={setProgress}
          onError={setError}
        />
      )}

      <div class="flex gap-3">
        <button
          type="button"
          class="rounded-md px-4 py-2 font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          disabled={!files.length}
          onClick={run}
        >
          {t(locale, 'run')}
        </button>
        <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={cancel}>
          {t(locale, 'cancel')}
        </button>
      </div>

      {progress && (
        <div>
          <div class="stamp">{t(locale, 'progress')}</div>
          <progress class="mt-1 w-full" value={progress.v} max={1} />
          <div class="mono text-xs">
            {Math.round(progress.v * 100)}% {progress.m}
          </div>
        </div>
      )}
      {error && <p style={{ color: '#c45c26' }}>{error}</p>}
      {warnings.map((w) => (
        <p key={w} class="text-sm" style={{ color: 'var(--muted)' }}>
          {w}
        </p>
      ))}

      {batch.length > 0 && (
        <section>
          <h2 class="stamp mb-2">{t(locale, 'errors')}</h2>
          <table class="w-full text-sm">
            <tbody>
              {batch.map((row) => (
                <tr key={row.file}>
                  <td class="py-1">{row.file}</td>
                  <td class="mono">{row.status}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <VerificationBlock locale={locale} report={report} />

      {report && (
        <section>
          <h2 class="stamp mb-2">{t(locale, 'report')}</h2>
          <pre class="overflow-auto rounded border p-3 text-xs" style={{ borderColor: 'var(--line)' }}>
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}

      {outputs.length > 0 && (
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="stamp">{t(locale, 'results')}</h2>
            {outputs.length > 1 && (
              <button type="button" onClick={() => zipDownload(outputs, `${toolId}.zip`)}>
                {t(locale, 'downloadAll')}
              </button>
            )}
          </div>
          <ul class="grid gap-2">
            {outputs.map((file) => (
              <li
                key={file.name}
                class="flex items-center justify-between rounded border px-3 py-2"
                style={{ borderColor: 'var(--line)' }}
              >
                <span>{file.name}</span>
                <span class="flex gap-3">
                  {(file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && (
                    <button
                      type="button"
                      onClick={() => {
                        void putHandoffResult({ name: file.name, mime: file.mime || 'application/pdf', bytes: file.data }).then(() => {
                          location.assign(`${localePath(locale, '/reader')}?result=1`);
                        });
                      }}
                    >
                      {t(locale, 'reader')}
                    </button>
                  )}
                  <button type="button" onClick={() => downloadBytes(file.name, file.data, file.mime)}>
                    {t(locale, 'download')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function defaultsFrom(fields: FormField[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) if (f.defaultValue !== undefined) o[f.name] = f.defaultValue;
  return o;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function Drop({
  locale,
  accept,
  multiple,
  files,
  onFiles,
  onClear,
}: {
  locale: Locale;
  accept: string;
  multiple: boolean;
  files: WorkerFile[];
  onFiles: (files: File[]) => Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const list = [...(e.clipboardData?.files ?? [])];
      if (list.length) void onFiles(list);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFiles]);

  return (
    <section
      class="rounded-xl border-2 border-dashed p-8 text-center"
      style={{
        borderColor: 'var(--accent)',
        background: 'color-mix(in oklab, var(--card) 80%, transparent)',
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles([...(e.dataTransfer?.files ?? [])]);
      }}
    >
      <p class="text-xl">{t(locale, 'drop')}</p>
      <p class="stamp mt-1" style={{ color: 'var(--muted)' }}>
        {t(locale, 'dropHint')}
      </p>
      <button
        type="button"
        class="mt-4 rounded-md border px-4 py-2"
        style={{ borderColor: 'var(--line)' }}
        onClick={() => inputRef.current?.click()}
      >
        {t(locale, 'choose')}
      </button>
      <input
        ref={inputRef}
        class="hidden"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const list = [...((e.target as HTMLInputElement).files ?? [])];
          if (list.length) void onFiles(list);
        }}
      />
      <ul class="mx-auto mt-4 max-w-md text-left text-sm">
        {files.length === 0 && <li style={{ color: 'var(--muted)' }}>{t(locale, 'empty')}</li>}
        {files.map((f) => (
          <li key={f.name}>
            {f.name} · {(f.data.byteLength / 1024).toFixed(1)} KB
          </li>
        ))}
      </ul>
      {files.length > 0 && (
        <button type="button" class="stamp mt-2" onClick={onClear}>
          reset
        </button>
      )}
    </section>
  );
}
