import { useEffect, useRef, useState } from 'preact/hooks';
import type { FormField } from '@neotools/engine';
import { encodePipelineHash } from '@neotools/engine';
import { assessExtension, type ExtensionAssessment } from '../lib/assess-extension';
import ZodForm from './ZodForm';
import VerificationBlock from './VerificationBlock';
import RedactEditor from './RedactEditor';
import ImageBoxEditor from './ImageBoxEditor';
import MediaTrimEditor from './MediaTrimEditor';
import DropZone from './DropZone';
import NetworkStatus from './NetworkStatus';
import ModelConfirm from './ModelConfirm';
import { localePath, t, type Locale } from '../lib/i18n';
import { createToolWorker, downloadBytes, zipDownload, type WorkerFile } from '../lib/worker-client';
import { putHandoffResult, takeHandoff } from '../lib/desktop-handoff';
import { getBrowserHistoryStore } from '../lib/history';
import { readToolQuery } from '../lib/options-url';
import { bytesToBlob } from '../lib/bytes-blob';
import MarkdownOutput from './MarkdownOutput';
import TranscriptEditor from './TranscriptEditor';
import DocPreview from './DocPreview';

export interface ToolMeta {
  id: string;
  inputs: { accept: string[]; multiple: boolean; directory?: boolean };
  presets?: Array<{ id: string; title: Record<'de' | 'en', string>; options: Record<string, unknown> }>;
  ui?: { editor?: string };
  initialOptions?: Record<string, unknown>;
  initialPreset?: string;
  lockedKeys?: string[];
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
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...defaultsFrom(fields),
    ...(meta.initialOptions ?? {}),
    ...(meta.presets?.find((p) => p.id === meta.initialPreset)?.options ?? {}),
  }));
  const [progress, setProgress] = useState<{ v: number; m?: string } | null>(null);
  const [outputs, setOutputs] = useState<WorkerFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'input' | 'result'>('input');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<ExtensionAssessment[]>([]);
  const [riskOk, setRiskOk] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const session = useRef<ReturnType<typeof createToolWorker> | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => () => session.current?.terminate(), []);

  useEffect(() => {
    const query = readToolQuery();
    if (query.preset && meta.presets) {
      const preset = meta.presets.find((p) => p.id === query.preset);
      if (preset) setValues((v) => ({ ...v, ...preset.options }));
    }
    if (query.options) setValues((v) => ({ ...v, ...query.options }));
    if (query.rerun) {
      void getBrowserHistoryStore()
        .get(query.rerun)
        .then(async (record) => {
          if (!record || record.toolId !== toolId) return;
          setValues((v) => ({ ...v, ...(record.options as Record<string, unknown>) }));
          const restored: WorkerFile[] = [];
          for (const ref of record.inputs) {
            const data = await getBrowserHistoryStore().readBlob(ref);
            if (data) restored.push({ name: ref.name, mime: ref.mime, data });
          }
          if (restored.length) setFiles(restored);
        });
    }
  }, [meta.presets, toolId]);

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
      const data = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || guessMime(file.name);
      next.push({ name: file.name, mime, data });
    }
    setRiskOk(false);
    setFiles((prev) => (meta.inputs.multiple ? [...prev, ...next] : next.slice(-1)));
    const nextAssess: ExtensionAssessment[] = [];
    for (const file of next) {
      try {
        nextAssess.push(await assessExtension({ name: file.name, mime: file.mime, bytes: file.data }));
      } catch {
        // forensics optional if pack API changes
      }
    }
    setAssessments((prev) => (meta.inputs.multiple ? [...prev, ...nextAssess] : nextAssess.slice(-1)));
  };

  const risky = assessments.some((a) => a.mismatch || a.dangerous || a.severity === 'medium' || a.severity === 'high' || a.severity === 'critical');

  const persistResult = async (nextOutputs: WorkerFile[], nextReport: Record<string, unknown> | null) => {
    try {
      const record = await getBrowserHistoryStore().save({
        toolId,
        options: values,
        inputs: files,
        outputs: nextOutputs,
        report: nextReport ?? undefined,
      });
      setHistoryId(record.id);
    } catch {
      setHistoryId(null);
    }
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
      setPhase('result');
      void persistResult(result.outputs, result.report ?? null);
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
    <div class="grid gap-6" data-tool-ready={hydrated ? '1' : '0'}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <NetworkStatus locale={locale} />
        {phase === 'result' && (
          <button type="button" class="text-sm underline" onClick={() => setPhase('input')}>
            {t(locale, 'undo')}
          </button>
        )}
      </div>

      {phase === 'input' && (
        <DropZone
          locale={locale}
          accept={meta.inputs.accept.join(',')}
          multiple={meta.inputs.multiple}
          directory={Boolean(meta.inputs.directory)}
          files={files}
          assessments={assessments}
          onFiles={addFiles}
          onClear={() => {
            setFiles([]);
            setAssessments([]);
            setRiskOk(false);
          }}
        />
      )}

      {risky && phase === 'input' && (
        <aside class="rounded-lg border p-4" style={{ borderColor: '#c45c26' }} role="alert">
          <strong>{t(locale, 'riskBanner')}</strong>
          <ul class="mt-2 list-disc pl-5 text-sm">
            {assessments.flatMap((item) =>
              item.reasons.map((reason) => (
                <li key={`${item.file}-${reason[locale]}`}>{reason[locale]}</li>
              )),
            )}
          </ul>
          <label class="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={riskOk} onChange={(e) => setRiskOk((e.target as HTMLInputElement).checked)} />
            {t(locale, 'confirmProcess')}
          </label>
        </aside>
      )}

      {meta.presets && meta.presets.length > 0 && phase === 'input' && (
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

      {phase === 'input' && (
        <section>
          <h2 class="stamp mb-2">{t(locale, 'options')}</h2>
          <ZodForm fields={fields} values={values} locked={meta.lockedKeys} onChange={setValues} />
        </section>
      )}

      {phase === 'input' && (
        <ModelConfirm
          locale={locale}
          toolId={toolId}
          confirmed={Boolean(values.confirmModelDownload)}
          onConfirm={(next) => setValues((v) => ({ ...v, confirmModelDownload: next }))}
        />
      )}

      {meta.ui?.editor === 'transcript' && outputs.length > 0 && (
        <TranscriptEditor locale={locale} outputs={outputs} />
      )}

      {meta.ui?.editor === 'doc-preview' && phase === 'input' && (
        <DocPreview locale={locale} toolId={toolId} values={values} onChangeValues={setValues} onGenerate={() => void run()} />
      )}

      {meta.ui?.editor === 'image-boxes' && files[0] && phase === 'input' && (
        <ImageBoxEditor locale={locale} file={files[0]} values={values} onChangeValues={setValues} />
      )}

      {meta.ui?.editor === 'media-trim' && files[0] && phase === 'input' && (
        <MediaTrimEditor locale={locale} file={files[0]} values={values} onChangeValues={setValues} />
      )}

      {phase === 'input' && files.some((f) => f.data.byteLength > 500 * 1024 * 1024) && (
        <aside class="rounded-lg border p-4 text-sm" style={{ borderColor: '#c45c26' }} role="status">
          {t(locale, 'mobileMediaWarn')}
        </aside>
      )}

      {(meta.ui?.editor === 'redact' || toolId === 'pdf-redact') && files[0] && phase === 'input' && (
        <RedactEditor
          locale={locale}
          file={files[0]}
          values={values}
          onChangeValues={setValues}
          onRan={(result) => {
            setOutputs(result.outputs);
            setWarnings(result.warnings);
            setReport(result.report ?? null);
            setPhase('result');
            void persistResult(result.outputs, result.report ?? null);
          }}
          onProgress={setProgress}
          onError={setError}
        />
      )}

      {phase === 'input' && (
        <div class="flex gap-3">
          <button
            type="button"
            class="rounded-md px-4 py-2 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            disabled={
              (!files.length && !(meta.ui?.editor === 'doc-preview' && String(values.source ?? '').trim())) ||
              (risky && !riskOk)
            }
            onClick={run}
          >
            {t(locale, 'run')}
          </button>
          <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={cancel}>
            {t(locale, 'cancel')}
          </button>
        </div>
      )}

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

      {historyId && (
        <p class="text-sm" role="status">
          {t(locale, 'historySaved')} ·{' '}
          <a href={localePath(locale, locale === 'de' ? '/verlauf' : '/history')}>{t(locale, 'history')}</a>
        </p>
      )}

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
                class="flex items-center justify-between gap-3 rounded border px-3 py-2"
                style={{ borderColor: 'var(--line)' }}
              >
                <span class="flex min-w-0 items-center gap-3">
                  {isImageOutput(file.mime, file.name) && (
                    <span class="flex items-center gap-2">
                      {files[0] && isImageOutput(files[0].mime, files[0].name) && (
                        <Thumb bytes={files[0].data} mime={files[0].mime} label={t(locale, 'before')} />
                      )}
                      <Thumb bytes={file.data} mime={file.mime} label={t(locale, 'after')} />
                    </span>
                  )}
                  <span class="min-w-0">
                    <span class="truncate">{file.name}</span>
                    {(file.mime === 'text/markdown' || file.name.toLowerCase().endsWith('.md')) && (
                      <div class="mt-2 max-h-80 overflow-auto text-left">
                        <MarkdownOutput markdown={new TextDecoder().decode(file.data)} />
                      </div>
                    )}
                  </span>
                </span>
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
          <button
            type="button"
            class="stamp mt-3"
            onClick={() => {
              const hash = encodePipelineHash({ steps: [{ toolId, options: values }] });
              location.assign(`${localePath(locale, '/pipeline')}${hash}`);
            }}
          >
            {t(locale, 'savePipeline')}
          </button>
        </section>
      )}
    </div>
  );
}

function defaultsFrom(fields: FormField[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'object' && f.fields?.length) {
      o[f.name] = { ...defaultsFrom(f.fields), ...(f.defaultValue && typeof f.defaultValue === 'object' ? (f.defaultValue as Record<string, unknown>) : {}) };
      continue;
    }
    if (f.kind === 'array' && f.itemKind === 'object' && Array.isArray(f.defaultValue)) {
      o[f.name] = f.defaultValue;
      continue;
    }
    if (f.defaultValue !== undefined) o[f.name] = f.defaultValue;
  }
  return o;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.jxl')) return 'image/jxl';
  if (lower.endsWith('.wav') || lower.endsWith('.wave')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.opus')) return 'audio/opus';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.srt')) return 'application/x-subrip';
  if (lower.endsWith('.vtt')) return 'text/vtt';
  return 'application/octet-stream';
}

function isImageOutput(mime: string, name: string): boolean {
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|ico)$/i.test(name);
}

function Thumb({ bytes, mime, label }: { bytes: Uint8Array; mime: string; label: string }) {
  const url = URL.createObjectURL(bytesToBlob(bytes, mime || 'image/png'));
  return (
    <span class="grid justify-items-center text-[10px]" style={{ color: 'var(--muted)' }}>
      <img src={url} alt={label} class="h-12 w-12 rounded object-cover" onLoad={() => URL.revokeObjectURL(url)} />
      {label}
    </span>
  );
}
