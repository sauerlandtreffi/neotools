import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Locale } from '../lib/i18n';
import { bytesToBlob } from '../lib/bytes-blob';

interface FileLike {
  name: string;
  mime: string;
  data: Uint8Array;
}

interface Props {
  locale: Locale;
  file: FileLike;
  values: Record<string, unknown>;
  onChangeValues: (next: Record<string, unknown>) => void;
}

export default function MediaTrimEditor({ locale, file, values, onChangeValues }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => URL.createObjectURL(bytesToBlob(file.data, file.mime || 'video/mp4')), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const start = Number(values.startSec ?? 0);
  const end = Number(values.endSec ?? 0);
  const cropX = Number(values.cropX ?? 0);
  const cropY = Number(values.cropY ?? 0);
  const cropW = Number(values.cropW ?? 0);
  const cropH = Number(values.cropH ?? 0);

  const set = (patch: Record<string, unknown>) => onChangeValues({ ...values, ...patch });

  return (
    <section class="grid gap-3">
      <h2 class="stamp">{locale === 'de' ? 'Schnitt / Crop' : 'Trim / crop'}</h2>
      <div class="relative max-w-xl overflow-hidden rounded border" style={{ borderColor: 'var(--line)' }}>
        <video
          ref={videoRef}
          src={url}
          controls
          class="w-full"
          onLoadedMetadata={(ev) => {
            const dur = (ev.currentTarget as HTMLVideoElement).duration;
            if ((!end || end <= 0) && Number.isFinite(dur)) set({ endSec: Number(dur.toFixed(2)) });
          }}
        />
        {cropW > 0 && cropH > 0 && (
          <div
            class="pointer-events-none absolute border-2"
            style={{
              borderColor: 'var(--accent)',
              left: `${cropX}px`,
              top: `${cropY}px`,
              width: `${cropW}px`,
              height: `${cropH}px`,
            }}
          />
        )}
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="text-sm">
          In
          <input
            type="number"
            step="0.05"
            min="0"
            class="mt-1 w-full rounded border px-2 py-1"
            value={start}
            onInput={(e) => set({ startSec: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <label class="text-sm">
          Out
          <input
            type="number"
            step="0.05"
            min="0"
            class="mt-1 w-full rounded border px-2 py-1"
            value={end}
            onInput={(e) => set({ endSec: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
      </div>
      <div class="grid grid-cols-4 gap-2 text-sm">
        {(['cropX', 'cropY', 'cropW', 'cropH'] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              min="0"
              class="mt-1 w-full rounded border px-2 py-1"
              value={Number(values[key] ?? 0)}
              onInput={(e) => set({ [key]: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        class="justify-self-start text-sm underline"
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          set({ startSec: Number(el.currentTime.toFixed(2)) });
        }}
      >
        {locale === 'de' ? 'In auf Playhead' : 'In at playhead'}
      </button>
    </section>
  );
}
