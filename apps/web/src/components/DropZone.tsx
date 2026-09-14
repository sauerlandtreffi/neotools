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
  directory,
}: {
  locale: Locale;
  accept: string;
  multiple: boolean;
  directory?: boolean;
  files: WorkerFile[];
  assessments: ExtensionAssessment[];
  onFiles: (files: File[]) => Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

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
      {directory && (
        <button
          type="button"
          class="mt-4 ml-2 rounded-md border px-4 py-2"
          style={{ borderColor: 'var(--line)' }}
          onClick={() => {
            if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
              void (async () => {
                try {
                  const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
                  const collected: File[] = [];
                  const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
                    for await (const [name, entry] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
                      if (entry.kind === 'file') {
                        const file = await (entry as FileSystemFileHandle).getFile();
                        collected.push(new File([file], prefix ? `${prefix}/${name}` : name, { type: file.type }));
                      } else if (entry.kind === 'directory') {
                        await walk(entry as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name);
                      }
                    }
                  };
                  await walk(handle, handle.name);
                  if (collected.length) void onFiles(collected);
                } catch {
                  dirRef.current?.click();
                }
              })();
            } else dirRef.current?.click();
          }}
        >
          {t(locale, 'chooseFolder')}
        </button>
      )}
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
      {directory && (
        <input
          ref={dirRef}
          class="sr-only"
          type="file"
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory="true"
          multiple
          onChange={(e) => {
            const list = [...((e.target as HTMLInputElement).files ?? [])].map((f) => {
              const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
              return rel ? new File([f], rel, { type: f.type }) : f;
            });
            if (list.length) void onFiles(list);
          }}
        />
      )}
      <ul class="mx-auto mt-4 max-w-md text-left text-sm" aria-live="polite">
        {files.length === 0 && <li style={{ color: 'var(--muted)' }}>{t(locale, 'empty')}</li>}
        {files.map((f, i) => {
          const assess = assessments[i];
          return (
            <li key={`${f.name}-${i}`}>
              {f.name} · {(f.data.byteLength / 1024).toFixed(1)} KB
              {assess && assess.severity !== 'ok' && (
                <span class="ml-2 mono text-xs" style={{ color: '#c45c26' }} data-assess-warn>
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
