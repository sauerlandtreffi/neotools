import { useEffect, useRef, useState } from 'preact/hooks';
import type { Locale } from '../lib/i18n';
import { t } from '../lib/i18n';
import type { WorkerFile } from '../lib/worker-client';
import { bytesToBlob } from '../lib/bytes-blob';

export interface ImageBox {
  x: number;
  y: number;
  w: number;
  h: number;
  unit: 'px';
}

interface Props {
  locale: Locale;
  file: WorkerFile;
  values: Record<string, unknown>;
  onChangeValues: (next: Record<string, unknown>) => void;
}

export default function ImageBoxEditor({ locale, file, values, onChangeValues }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string>('');
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [drag, setDrag] = useState<{ x0: number; y0: number } | null>(null);
  const boxes = parseBoxes(values.boxesJson);

  useEffect(() => {
    const blob = bytesToBlob(file.data, file.mime || 'image/png');
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      const max = 560;
      const scale = Math.min(1, max / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 2;
      for (const b of boxes) {
        ctx.strokeRect(
          (b.x / img.naturalWidth) * canvas.width,
          (b.y / img.naturalHeight) * canvas.height,
          (b.w / img.naturalWidth) * canvas.width,
          (b.h / img.naturalHeight) * canvas.height,
        );
      }
    };
    img.src = url;
  }, [url, boxes]);

  const toImage = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  return (
    <section>
      <h2 class="stamp mb-2">{t(locale, 'boxes')}</h2>
      <canvas
        ref={canvasRef}
        class="max-w-full cursor-crosshair rounded border"
        style={{ borderColor: 'var(--line)' }}
        onMouseDown={(e) => {
          const p = toImage(e);
          setDrag({ x0: p.x, y0: p.y });
        }}
        onMouseUp={(e) => {
          if (!drag || !canvasRef.current) return;
          const p = toImage(e);
          const imgW = canvasRef.current.width;
          const imgH = canvasRef.current.height;
          const x = Math.round((Math.min(drag.x0, p.x) / imgW) * natural.w);
          const y = Math.round((Math.min(drag.y0, p.y) / imgH) * natural.h);
          const w = Math.max(1, Math.round((Math.abs(p.x - drag.x0) / imgW) * natural.w));
          const h = Math.max(1, Math.round((Math.abs(p.y - drag.y0) / imgH) * natural.h));
          const next = [...boxes, { x, y, w, h, unit: 'px' as const }];
          onChangeValues({ ...values, boxesJson: JSON.stringify(next) });
          setDrag(null);
        }}
      />
      <ul class="mt-2 text-sm">
        {boxes.map((b, i) => (
          <li key={`${b.x}-${b.y}-${i}`} class="flex justify-between">
            <span class="mono">
              {b.x},{b.y} {b.w}×{b.h}
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeValues({
                  ...values,
                  boxesJson: JSON.stringify(boxes.filter((_, j) => j !== i)),
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function parseBoxes(raw: unknown): ImageBox[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw) as ImageBox[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

