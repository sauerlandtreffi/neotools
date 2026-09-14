import { useEffect, useRef, useState } from 'preact/hooks';
import { hasFeature, verifyLicense } from '@neotools/license';
import { t, type Locale } from '../lib/i18n';
import { createToolWorker, type WorkerFile } from '../lib/worker-client';
import { getBrowserHistoryStore } from '../lib/history';
import { loadLicenseToken } from '../lib/license-store';

interface Props {
  locale: Locale;
  pubkey: string;
  embedded: string;
}

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle>;
  requestPermission?(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
  queryPermission?(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
};

interface Rule {
  id: string;
  title: string;
  match: (file: File) => boolean;
  toolId: string;
  options: Record<string, unknown>;
}

function rules(locale: Locale): Rule[] {
  return [
    {
      id: 'heic-jpg',
      title: locale === 'de' ? 'alle HEIC → JPG' : 'all HEIC → JPG',
      match: (f) => /\.heic$/i.test(f.name) || f.type === 'image/heic',
      toolId: 'image-convert',
      options: { format: 'jpeg' },
    },
    {
      id: 'pdf-compress',
      title: locale === 'de' ? 'PDF > 5 MB → compress' : 'PDF > 5 MB → compress',
      match: (f) => (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) && f.size > 5 * 1024 * 1024,
      toolId: 'pdf-compress',
      options: { preset: 'medium' },
    },
    {
      id: 'pdf-sanitize',
      title: locale === 'de' ? 'neue PDFs → sanitize + Verlauf' : 'new PDFs → sanitize + history',
      match: (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
      toolId: 'pdf-sanitize',
      options: {},
    },
  ];
}

export default function WatchApp({ locale, pubkey, embedded }: Props) {
  const [supported, setSupported] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [dirName, setDirName] = useState('');
  const [running, setRunning] = useState(false);
  const [intervalSec, setIntervalSec] = useState(4);
  const [log, setLog] = useState<string[]>([]);
  const handleRef = useRef<DirHandle | null>(null);
  const seen = useRef(new Set<string>());
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSupported(typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function');
    void (async () => {
      const token = (await loadLicenseToken()) || embedded;
      const result = await verifyLicense(token, pubkey);
      setAllowed(hasFeature('watch', result));
    })();
  }, [embedded, pubkey]);

  const pick = async () => {
    const picker = (window as unknown as { showDirectoryPicker: (o?: { mode: string }) => Promise<DirHandle> })
      .showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite' });
    if (handle.requestPermission) await handle.requestPermission({ mode: 'readwrite' });
    handleRef.current = handle;
    setDirName(handle.name);
  };

  const writeOut = async (dir: DirHandle, file: WorkerFile) => {
    const out = await dir.getDirectoryHandle('neotools-out', { create: true });
    const fh = await out.getFileHandle(file.name, { create: true });
    const writable = await fh.createWritable();
    const copy = new ArrayBuffer(file.data.byteLength);
    new Uint8Array(copy).set(file.data);
    await writable.write(copy);
    await writable.close();
  };

  const tick = async () => {
    const dir = handleRef.current;
    if (!dir) return;
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file') continue;
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.current.has(key)) continue;
      const rule = rules(locale).find((r) => r.match(file));
      if (!rule) continue;
      seen.current.add(key);
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const session = createToolWorker();
        const result = await session.api.run(rule.toolId, [{ name: file.name, mime: file.type || 'application/octet-stream', data }], rule.options);
        session.terminate();
        for (const out of result.outputs) await writeOut(dir, out);
        await getBrowserHistoryStore().save({
          toolId: `watch:${rule.id}`,
          options: rule.options,
          inputs: [{ name: file.name, mime: file.type, data }],
          outputs: result.outputs,
        });
        setLog((rows) => [`ok ${file.name} → ${rule.id}`, ...rows].slice(0, 40));
      } catch (err) {
        setLog((rows) => [`error ${file.name}: ${err instanceof Error ? err.message : String(err)}`, ...rows].slice(0, 40));
      }
    }
  };

  const start = () => {
    setRunning(true);
    void tick();
    timer.current = window.setInterval(() => void tick(), intervalSec * 1000);
  };

  const stop = () => {
    setRunning(false);
    if (timer.current) window.clearInterval(timer.current);
  };

  useEffect(() => () => stop(), []);

  if (!supported) {
    return <p style={{ color: 'var(--warn-text)' }}>{t(locale, 'watchUnsupported')}</p>;
  }

  return (
    <div class="grid max-w-2xl gap-4">
      {!allowed && (
        <p style={{ color: 'var(--muted)' }}>
          {locale === 'de'
            ? 'Watch-Automatik ist Pro/Enterprise. Community-Tools bleiben frei.'
            : 'Watch automation is Pro/Enterprise. Community tools stay free.'}
        </p>
      )}
      <p class="text-sm" style={{ color: 'var(--muted)' }}>
        {t(locale, 'watchUnsupported')}
      </p>
      <ul class="list-disc pl-5 text-sm">
        {rules(locale).map((r) => (
          <li key={r.id}>{r.title}</li>
        ))}
      </ul>
      <div class="flex flex-wrap gap-3">
        <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={pick}>
          {t(locale, 'watchPick')} {dirName ? `· ${dirName}` : ''}
        </button>
        <label class="text-sm">
          Poll
          <input
            class="ml-2 w-16 rounded border px-2 py-1"
            type="number"
            min={1}
            value={intervalSec}
            onInput={(e) => setIntervalSec(Number((e.target as HTMLInputElement).value) || 4)}
          />
          s
        </label>
        {!running ? (
          <button
            type="button"
            class="rounded-md px-4 py-2"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            disabled={!dirName || !allowed}
            onClick={start}
          >
            {t(locale, 'watchStart')}
          </button>
        ) : (
          <button type="button" class="rounded-md border px-4 py-2" style={{ borderColor: 'var(--line)' }} onClick={stop}>
            {t(locale, 'watchStop')}
          </button>
        )}
      </div>
      <ul class="mono text-xs">
        {log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
