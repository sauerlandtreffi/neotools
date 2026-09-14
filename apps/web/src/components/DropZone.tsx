import { useEffect, useRef } from 'preact/hooks';
import type { ExtensionAssessment } from '../lib/assess-extension';
import { t, type Locale } from '../lib/i18n';
import type { WorkerFile } from '../lib/worker-client';

export default function DropZone({
  locale,
  accept,
  multiple,
  files,
  assessments,
  onFiles,
  onClear,
}: {
  locale: Locale;
  accept: string;
  multiple: boolean;
  files: WorkerFile[];
  assessments: ExtensionAssessment[];
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

  const openPicker = () => inputRef.current?.click();

  return (
    <section
      class="rounded-xl border-2 border-dashed p-8 text-center"
      style={{
        borderColor: 'var(--accent)',
        background: 'color-mix(in oklab, var(--card) 80%, transparent)',
      }}
      role="group"
      aria-label={t(locale, 'drop')}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles([...(e.dataTransfer?.files ?? [])]);
      }}
    >
      <p class="text-xl" id="drop-title">
        {t(locale, 'drop')}
      </p>
      <p class="stamp mt-1" style={{ color: 'var(--muted)' }}>
        {t(locale, 'dropHint')}
      </p>
      <button
        type="button"
        class="mt-4 rounded-md border px-4 py-2"
        style={{ borderColor: 'var(--line)' }}
        onClick={openPicker}
      >
        {t(locale, 'choose')}
      </button>
      <input
        ref={inputRef}
        class="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        aria-labelledby="drop-title"
        onChange={(e) => {
          const list = [...((e.target as HTMLInputElement).files ?? [])];
          if (list.length) void onFiles(list);
        }}
      />
      <ul class="mx-auto mt-4 max-w-md text-left text-sm" aria-live="polite">
        {files.length === 0 && <li style={{ color: 'var(--muted)' }}>{t(locale, 'empty')}</li>}
        {files.map((f, i) => {
          const assess = assessments[i];
          return (
            <li key={`${f.name}-${i}`}>
              {f.name} · {(f.data.byteLength / 1024).toFixed(1)} KB
              {assess && assess.severity !== 'ok' && (
                <span class="ml-2 mono text-xs" style={{ color: '#c45c26' }}>
                  {assess.severity}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {files.length > 0 && (
        <button type="button" class="stamp mt-2" onClick={onClear}>
          {t(locale, 'clearFiles')}
        </button>
      )}
    </section>
  );
}
