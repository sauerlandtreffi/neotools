import { useMemo, useState } from 'preact/hooks';
import type { Locale } from '../lib/i18n';
import { downloadBytes } from '../lib/worker-client';

interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface Transcript {
  language?: string;
  segments: Segment[];
}

interface FileLike {
  name: string;
  mime: string;
  data: Uint8Array;
}

export default function TranscriptEditor({
  locale,
  outputs,
}: {
  locale: Locale;
  outputs: FileLike[];
}) {
  const initial = useMemo(() => readTranscript(outputs), [outputs]);
  const [segments, setSegments] = useState<Segment[]>(initial?.segments ?? []);
  const [active, setActive] = useState<number | null>(null);
  if (!segments.length) return null;

  const setText = (i: number, text: string) => {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, text } : s)));
  };

  const exportAs = (kind: 'srt' | 'txt' | 'json') => {
    const body = kind === 'json' ? JSON.stringify({ language: initial?.language ?? 'und', segments }, null, 2) + '\n'
      : kind === 'txt' ? segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n') + '\n'
      : toSrt(segments);
    const mime = kind === 'json' ? 'application/json' : kind === 'srt' ? 'application/x-subrip' : 'text/plain';
    downloadBytes(`transcript.${kind}`, new TextEncoder().encode(body), mime);
  };

  return (
    <section class="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }} data-transcript-editor="1">
      <h2 class="stamp mb-2">{locale === 'de' ? 'Transkript' : 'Transcript'}</h2>
      <ol class="grid max-h-96 gap-2 overflow-auto text-sm">
        {segments.map((seg, i) => (
          <li
            key={`${seg.start}-${i}`}
            class="grid gap-1 rounded border px-2 py-2"
            style={{ borderColor: active === i ? 'var(--accent)' : 'var(--line)' }}
          >
            <button type="button" class="stamp text-left" onClick={() => setActive(i)}>
              {fmt(seg.start)} → {fmt(seg.end)}
              {seg.speaker ? ` · ${seg.speaker}` : ''}
            </button>
            <textarea
              class="w-full rounded border p-2"
              style={{ borderColor: 'var(--line)', minHeight: '3rem' }}
              value={seg.text}
              onInput={(e) => setText(i, (e.target as HTMLTextAreaElement).value)}
            />
          </li>
        ))}
      </ol>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="rounded-md border px-3 py-1 text-sm" style={{ borderColor: 'var(--line)' }} onClick={() => exportAs('srt')}>
          SRT
        </button>
        <button type="button" class="rounded-md border px-3 py-1 text-sm" style={{ borderColor: 'var(--line)' }} onClick={() => exportAs('txt')}>
          TXT
        </button>
        <button type="button" class="rounded-md border px-3 py-1 text-sm" style={{ borderColor: 'var(--line)' }} onClick={() => exportAs('json')}>
          JSON
        </button>
      </div>
    </section>
  );
}

function readTranscript(outputs: FileLike[]): Transcript | null {
  const json = outputs.find((f) => f.name.endsWith('.json') || f.mime === 'application/json');
  if (!json) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(json.data)) as Transcript & { cues?: Segment[] };
    const segments = data.segments ?? data.cues;
    if (!Array.isArray(segments) || !segments.length) return null;
    return { language: data.language, segments };
  } catch {
    return null;
  }
}

function fmt(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

function toSrt(segments: Segment[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.speaker ? `${seg.speaker}: ` : ''}${seg.text}`)
    .join('\n\n')
    .concat('\n');
}
