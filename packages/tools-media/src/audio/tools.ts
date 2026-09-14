import { z } from 'zod';
import {
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type NeoFile,
  type ToolResult,
} from '@neotools/engine';
import { AUDIO_ACCEPT, IMAGE_OVERLAY_ACCEPT } from '../accept.js';
import { analyzeKeyBpm } from '../analysis/key-bpm.js';
import { extractAudio } from '../ffmpeg/extract-audio.js';
import { largeFileWarnings } from '../ffmpeg/capabilities.js';
import { parseLoudnorm, parseCueSheet, parseSrtWindows } from '../ffmpeg/parse-filters.js';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg, requireOutput } from '../ffmpeg/run.js';
import { MEDIA_LICENSES } from '../licenses.js';
import { inputAlias, outName, stem } from '../names.js';
import { definePresetTool } from '../presets/define-preset-tool.js';
import * as A from '../presets/args.js';
import { audioClickTrack } from '../tools/audio-click-track.js';
import { audioSpatialFlatten } from '../tools/audio-spatial-flatten.js';

const aIn = { accept: AUDIO_ACCEPT, multiple: false, min: 1 };
const aMany = { accept: AUDIO_ACCEPT, multiple: true, min: 2 };
const empty = z.object({});

const splitOpts = z.object({
  mode: z.enum(['length', 'silence', 'cue']).default('length'),
  segmentSec: z.coerce.number().min(0.2).max(3600).default(1),
  cueText: z.string().default(''),
});

const bleepOpts = z.object({ windows: z.string().default('0.5-0.8'), freq: z.coerce.number().min(200).max(4000).default(1000) });

const coverOpts = z.object({ mode: z.enum(['embed', 'extract']).default('embed') });

function wrap(id: string, files: NeoFile[], outputs: NeoFile[], warnings: string[], report: Record<string, unknown>, opts: unknown): Promise<ToolResult> {
  return createProvenance(id, opts, files).then((p) => ({
    outputs,
    warnings,
    report: attachProvenance(report, p),
  }));
}

/** Accepts audio-profanity-bleep-list JSON `{hits:[{start,end}]}`, keep-windows, SRT, or CSV. */
export function parseBleepSpans(text: string, name = ''): Array<{ start: number; end: number }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/\.srt$/i.test(name) || /^\d+\s*\n?\d{2}:/.test(trimmed)) {
    const fromSrt = parseSrtWindows(trimmed);
    if (fromSrt.length) return fromSrt;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? ((parsed as { hits?: unknown; windows?: unknown; keep?: unknown }).hits ??
            (parsed as { windows?: unknown }).windows ??
            (parsed as { keep?: unknown }).keep ??
            [])
          : [];
      if (Array.isArray(rows)) {
        return rows.flatMap((item) => {
          if (Array.isArray(item) && item.length >= 2) {
            const start = Number(item[0]);
            const end = Number(item[1]);
            return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
          }
          if (item && typeof item === 'object' && 'start' in item && 'end' in item) {
            const start = Number((item as { start: unknown }).start);
            const end = Number((item as { end: unknown }).end);
            return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
          }
          return [];
        });
      }
    } catch {
      // fall through to CSV / SRT
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !/^start\s*,/i.test(l));
  const csv: Array<{ start: number; end: number }> = [];
  for (const line of lines) {
    const [a, b] = line.split(/[,;\t]/).map((s) => Number(s.trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && (b as number) > (a as number)) csv.push({ start: a as number, end: b as number });
  }
  if (csv.length) return csv;
  return parseSrtWindows(trimmed);
}

const convertOpts = z.object({
  container: z.enum(['mp3', 'wav', 'ogg', 'opus', 'flac', 'm4a', 'aac']).default('mp3'),
  bitrateKbps: z.coerce.number().min(32).max(512).default(192),
  sampleRate: z.coerce.number().min(0).max(192000).default(0),
});

export const audioConvert = definePresetTool({
  id: 'audio-convert',
  category: 'audio',
  title: { de: 'Audio konvertieren', en: 'Convert audio' },
  description: { de: 'MP3/WAV/OGG/OPUS/FLAC/M4A lokal, Encode am LGPL-Set.', en: 'MP3/WAV/OGG/OPUS/FLAC/M4A locally, encode set follows the LGPL build.' },
  inputs: { accept: [...AUDIO_ACCEPT, 'video/mp4', '.mp4'], multiple: true, min: 1 },
  options: convertOpts,
  ffmpeg: (opts, probes, io) => A.audioConvertArgs({ ...opts, sampleRate: opts.sampleRate || undefined }, probes[0]!, io),
  outputName: (opts, files) => outName(files[0]!.name, opts.container),
});

const loudOpts = z.object({
  targetLufs: z.enum(['-16', '-14', '-23']).default('-16'),
  truePeak: z.coerce.number().min(-9).max(0).default(-1.5),
});

export const audioNormalize = defineTool({
  id: 'audio-normalize',
  pack: 'media',
  category: 'audio',
  title: { de: 'Lautheit normalisieren', en: 'Normalize loudness' },
  description: { de: 'loudnorm 2-Pass, −16/−14/−23 LUFS, True-Peak, EBU-R128-Report aus Pass 1.', en: '2-pass loudnorm, −16/−14/−23 LUFS, true peak, EBU R128 report from pass 1.' },
  inputs: aIn,
  options: loudOpts,
  presets: [
    { id: 'ebu-r128', title: { de: 'EBU R128 −23', en: 'EBU R128 −23' }, options: { targetLufs: '-23' } },
    { id: 'preset-audio-replaygain', title: { de: 'ReplayGain-ähnlich −18', en: 'ReplayGain-like −18' }, options: { targetLufs: '-16' } },
  ],
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = loudOpts.parse(options);
    const file = files[0]!;
    const I = Number(opts.targetLufs);
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    const pass1 = await runFfmpeg(ctx, {
      args: ['-i', alias, '-af', `loudnorm=I=${I}:TP=${opts.truePeak}:LRA=11:print_format=json`, '-f', 'null', '-'],
      inputs: [{ name: alias, data }],
      outputs: [],
    });
    const measured = parseLoudnorm(pass1.log) ?? {};
    const lin = [
      `loudnorm=I=${I}:TP=${opts.truePeak}:LRA=11`,
      measured.input_i !== undefined ? `measured_I=${measured.input_i}` : '',
      measured.input_tp !== undefined ? `measured_TP=${measured.input_tp}` : '',
      measured.input_lra !== undefined ? `measured_LRA=${measured.input_lra}` : '',
      measured.input_thresh !== undefined ? `measured_thresh=${measured.input_thresh}` : '',
      measured.target_offset !== undefined ? `offset=${measured.target_offset}` : '',
      'linear=true',
      'print_format=summary',
    ]
      .filter(Boolean)
      .join(':');
    const out = outName(file.name, 'wav');
    const pass2 = await runFfmpeg(ctx, {
      args: ['-i', alias, '-af', lin, out],
      inputs: [{ name: alias, data }],
      outputs: [out],
    });
    const report = {
      ebuR128: measured,
      targetLufs: I,
      truePeak: opts.truePeak,
      input_i: measured.input_i,
      output_i: measured.output_i ?? I,
    };
    return wrap('audio-normalize', files, [neoFileFromBytes(out, requireOutput(pass2, out), 'audio/wav')], largeFileWarnings(files, ctx), report, opts);
  },
});

export const audioJoin = definePresetTool({
  id: 'audio-join',
  category: 'audio',
  title: { de: 'Audio zusammenfügen', en: 'Join audio' },
  description: { de: 'Gapless Concat, optional Crossfade.', en: 'Gapless concat, optional crossfade.' },
  inputs: aMany,
  options: z.object({ crossfade: z.coerce.number().min(0).max(12).default(0) }),
  presets: [{ id: 'preset-audio-gapless', title: { de: 'Gapless', en: 'Gapless' }, options: { crossfade: 0 } }],
  ffmpeg: (opts, probes, io) => A.audioJoinArgs(opts, probes, io),
  outputName: () => 'joined.wav',
});

export const audioTrim = definePresetTool({
  id: 'audio-trim',
  category: 'audio',
  title: { de: 'Audio trimmen', en: 'Trim audio' },
  description: { de: 'Start/Ende in Sekunden.', en: 'Start/end in seconds.' },
  inputs: aIn,
  options: z.object({ startSec: z.coerce.number().min(0).default(0), endSec: z.coerce.number().min(0).default(0) }),
  ui: { editor: 'media-trim' },
  ffmpeg: (opts, p, io) => A.audioTrimArgs({ startSec: opts.startSec, endSec: opts.endSec || undefined }, p[0]!, io),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioSplit = defineTool({
  id: 'audio-split',
  pack: 'media',
  category: 'audio',
  title: { de: 'Audio splitten', en: 'Split audio' },
  description: { de: 'Länge, Stille oder CUE-Sheet.', en: 'Length, silence, or CUE sheet.' },
  inputs: { accept: [...AUDIO_ACCEPT, '.cue', 'application/x-cue'], multiple: true, min: 1 },
  options: splitOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = splitOpts.parse(options);
    const audio = files.find((f) => !/\.cue$/i.test(f.name)) ?? files[0]!;
    const cueFile = files.find((f) => /\.cue$/i.test(f.name));
    const alias = inputAlias(0, audio.name);
    const data = await audio.bytes();
    const outputs: NeoFile[] = [];
    if (opts.mode === 'cue' || cueFile || opts.cueText) {
      const text = opts.cueText || (cueFile ? new TextDecoder().decode(await cueFile.bytes()) : '');
      const tracks = parseCueSheet(text);
      const p = await probe(audio, ctx);
      for (let i = 0; i < tracks.length; i++) {
        const start = tracks[i]!.start;
        const end = tracks[i + 1]?.start ?? p.duration;
        const name = `cue-${String(i + 1).padStart(2, '0')}.wav`;
        const result = await runFfmpeg(ctx, {
          args: ['-ss', String(start), '-to', String(end), '-i', alias, name],
          inputs: [{ name: alias, data }],
          outputs: [name],
        });
        const bytes = result.files[name];
        if (bytes) outputs.push(neoFileFromBytes(name, bytes, 'audio/wav'));
      }
    } else if (opts.mode === 'silence') {
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-af', 'silencedetect=n=-40dB:d=0.4', '-f', 'null', '-'],
        inputs: [{ name: alias, data }],
        outputs: [],
      });
      const starts = [0, ...[...result.log.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]))];
      const p = await probe(audio, ctx);
      for (let i = 0; i < starts.length; i++) {
        const name = `sil-${String(i + 1).padStart(2, '0')}.wav`;
        const end = starts[i + 1] ?? p.duration;
        const r = await runFfmpeg(ctx, {
          args: ['-ss', String(starts[i]), '-to', String(end), '-i', alias, name],
          inputs: [{ name: alias, data }],
          outputs: [name],
        });
        const bytes = r.files[name];
        if (bytes) outputs.push(neoFileFromBytes(name, bytes, 'audio/wav'));
      }
    } else {
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-f', 'segment', '-segment_time', String(opts.segmentSec), 'seg_%03d.wav'],
        inputs: [{ name: alias, data }],
        outputs: [],
        outputPrefix: 'seg_',
      });
      for (const [n, b] of Object.entries(result.files)) {
        if (n.startsWith('seg_') && b.byteLength) outputs.push(neoFileFromBytes(n, b, 'audio/wav'));
      }
    }
    return wrap('audio-split', files, outputs, [], { count: outputs.length }, opts);
  },
});

export const audioMono = definePresetTool({
  id: 'audio-mono',
  category: 'audio',
  title: { de: 'Stereo → Mono', en: 'Stereo → mono' },
  description: { de: 'Auf eine Spur mischen.', en: 'Downmix to one channel.' },
  inputs: aIn,
  options: empty,
  presets: [{ id: 'preset-audio-stereo-mono', title: { de: 'Mono', en: 'Mono' }, options: {} }],
  ffmpeg: A.adapt(A.audioMonoArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioVolume = definePresetTool({
  id: 'audio-volume',
  category: 'audio',
  title: { de: 'Lautstärke', en: 'Volume' },
  description: { de: 'dB mit Clip-Guard (alimiter).', en: 'dB with clip guard (alimiter).' },
  inputs: aIn,
  options: z.object({ db: z.coerce.number().min(-60).max(24).default(-3) }),
  presets: [{ id: 'preset-audio-volume', title: { de: '−3 dB', en: '−3 dB' }, options: { db: -3 } }],
  ffmpeg: A.adapt(A.audioVolumeArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioFade = definePresetTool({
  id: 'audio-fade',
  category: 'audio',
  title: { de: 'Fade', en: 'Fade' },
  description: { de: 'Ein- und Ausblenden.', en: 'Fade in and out.' },
  inputs: aIn,
  options: z.object({ fadeIn: z.coerce.number().min(0).max(30).default(0.2), fadeOut: z.coerce.number().min(0).max(30).default(0.2) }),
  presets: [{ id: 'preset-audio-fade', title: { de: '0,2 s', en: '0.2 s' }, options: { fadeIn: 0.2, fadeOut: 0.2 } }],
  ffmpeg: A.adapt(A.audioFadeArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioRemoveSilence = definePresetTool({
  id: 'audio-remove-silence',
  category: 'audio',
  title: { de: 'Stille entfernen', en: 'Remove silence' },
  description: { de: 'silenceremove nach Pegel.', en: 'silenceremove by level.' },
  inputs: aIn,
  options: empty,
  ffmpeg: A.adapt(A.audioSilenceArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioDucking = definePresetTool({
  id: 'audio-ducking',
  category: 'audio',
  title: { de: 'Ducking', en: 'Ducking' },
  description: { de: 'sidechaincompress: zweite Datei = Sprache.', en: 'sidechaincompress: second file is speech.' },
  inputs: aMany,
  options: z.object({ threshold: z.coerce.number().min(0.001).max(1).default(0.05) }),
  ffmpeg: (opts, _p, io) => [
    '-i',
    io.inputs[0]!,
    '-i',
    io.inputs[1] ?? io.inputs[0]!,
    '-filter_complex',
    `[1:a]asplit=2[sc][mix];[0:a][sc]sidechaincompress=threshold=${opts.threshold}:ratio=8:attack=50:release=300[duck]`,
    '-map',
    '[duck]',
    io.output,
  ],
  outputName: () => 'ducked.wav',
});

export const audioBleep = defineTool({
  id: 'audio-bleep',
  pack: 'media',
  category: 'audio',
  title: { de: 'Piepen / Bleep', en: 'Bleep' },
  description: { de: 'Zeitstempel-Liste oder SRT → volume=enable + Sinus.', en: 'Timestamp list or SRT → volume=enable + sine.' },
  inputs: {
    accept: [...AUDIO_ACCEPT, '.srt', 'application/x-subrip', 'application/json', '.json', 'text/csv', '.csv'],
    multiple: true,
    min: 1,
  },
  options: bleepOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = bleepOpts.parse(options);
    const audio =
      files.find((f) => !/\.(srt|json|csv)$/i.test(f.name) && f.mime !== 'application/json' && f.mime !== 'text/csv') ??
      files[0]!;
    const cue = files.find((f) => /\.(srt|json|csv)$/i.test(f.name) || f.mime === 'application/json' || f.mime === 'text/csv');
    let spans: Array<{ start: number; end: number }> = [];
    if (cue) spans = parseBleepSpans(new TextDecoder().decode(await cue.bytes()), cue.name);
    if (!spans.length) {
      spans = opts.windows.split(/[,;\s]+/).flatMap((part) => {
        const [a, b] = part.split('-').map(Number);
        return Number.isFinite(a) && Number.isFinite(b) ? [{ start: a!, end: b! }] : [];
      });
    }
    const enable = spans.map((s) => `between(t,${s.start},${s.end})`).join('+') || '0';
    const alias = inputAlias(0, audio.name);
    const result = await runFfmpeg(ctx, {
      args: [
        '-i',
        alias,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${opts.freq}:sample_rate=48000`,
        '-filter_complex',
        `[0:a]volume=0:enable='${enable}'[m];[1:a]volume=0.4:enable='${enable}'[b];[m][b]amix=inputs=2:duration=first[out]`,
        '-map',
        '[out]',
        'bleep.wav',
      ],
      inputs: [{ name: alias, data: await audio.bytes() }],
      outputs: ['bleep.wav'],
    });
    return wrap('audio-bleep', files, [neoFileFromBytes(outName(audio.name, 'wav'), requireOutput(result, 'bleep.wav'), 'audio/wav')], [], { spans }, opts);
  },
});

export const audioEqPresets = definePresetTool({
  id: 'audio-eq-presets',
  category: 'audio',
  title: { de: 'EQ-Presets', en: 'EQ presets' },
  description: { de: 'Telefon / Radio / Club.', en: 'Phone / radio / club.' },
  inputs: aIn,
  options: z.object({ preset: z.enum(['telefon', 'radio', 'club']).default('telefon') }),
  ffmpeg: A.adapt(A.audioEqArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioLimiterDc = definePresetTool({
  id: 'audio-limiter-dc',
  category: 'audio',
  title: { de: 'Limiter / DC-Offset', en: 'Limiter / DC offset' },
  description: { de: 'alimiter + DC.', en: 'alimiter + DC.' },
  inputs: aIn,
  options: z.object({ dc: z.boolean().default(true) }),
  ffmpeg: A.adapt(A.audioLimiterArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioReplaygain = definePresetTool({
  id: 'audio-replaygain',
  category: 'audio',
  title: { de: 'ReplayGain', en: 'ReplayGain' },
  description: { de: 'replaygain-Filter anwenden.', en: 'Apply the replaygain filter.' },
  inputs: aIn,
  options: empty,
  ffmpeg: A.adapt(A.audioReplaygainArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioDither = definePresetTool({
  id: 'audio-dither',
  category: 'audio',
  title: { de: 'Sample-Rate / Dither', en: 'Sample rate / dither' },
  description: { de: 'aresample + triangular Dither.', en: 'aresample + triangular dither.' },
  inputs: aIn,
  options: z.object({
    sampleRate: z.coerce.number().min(8000).max(192000).default(44100),
    bitDepth: z.enum(['16', '24']).default('16'),
  }),
  ffmpeg: A.adapt(A.audioDitherArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioCrossfadePlaylist = definePresetTool({
  id: 'audio-crossfade-playlist',
  category: 'audio',
  title: { de: 'Playlist-Crossfade', en: 'Playlist crossfade' },
  description: { de: 'acrossfade über mehrere Takes.', en: 'acrossfade across multiple takes.' },
  inputs: aMany,
  options: z.object({ crossfade: z.coerce.number().min(0.05).max(12).default(2) }),
  ffmpeg: (opts, probes, io) => A.audioJoinArgs(opts, probes, io),
  outputName: () => 'playlist.wav',
});

export const audioRingtone = definePresetTool({
  id: 'audio-ringtone',
  category: 'audio',
  title: { de: 'Klingelton / M4R', en: 'Ringtone / M4R' },
  description: { de: 'AAC, höchstens 40 s, Loop-Punkt-Metadaten.', en: 'AAC, 40 s max, loop-point metadata.' },
  inputs: aIn,
  options: z.object({ seconds: z.coerce.number().min(1).max(40).default(30) }),
  ffmpeg: (opts, _p, io) => [
    '-i',
    io.inputs[0]!,
    '-t',
    String(Math.min(40, opts.seconds)),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-metadata',
    'comment=loop-start=0',
    io.output,
  ],
  outputName: (_o, files) => outName(files[0]!.name, 'm4r'),
});

export const audioSpectrogram = definePresetTool({
  id: 'audio-spectrogram',
  category: 'audio',
  title: { de: 'Spektrogramm', en: 'Spectrogram' },
  description: { de: 'showspectrumpic → PNG.', en: 'showspectrumpic → PNG.' },
  inputs: aIn,
  options: empty,
  ffmpeg: A.adapt(A.audioSpectrogramArgs),
  outputName: (_o, files) => `${stem(files[0]!.name)}-spec.png`,
});

export const audioWaveformPoster = definePresetTool({
  id: 'audio-waveform-poster',
  category: 'audio',
  title: { de: 'Waveform-Poster', en: 'Waveform poster' },
  description: { de: 'showwavespic → PNG.', en: 'showwavespic → PNG.' },
  inputs: aIn,
  options: empty,
  ffmpeg: A.adapt(A.audioWaveformArgs),
  outputName: (_o, files) => `${stem(files[0]!.name)}-wave.png`,
});

export const audioMidSide = definePresetTool({
  id: 'audio-mid-side',
  category: 'audio',
  title: { de: 'Mid/Side', en: 'Mid/Side' },
  description: { de: 'M/S-Pan.', en: 'M/S pan.' },
  inputs: aIn,
  options: z.object({ mode: z.enum(['ms', 'side']).default('ms') }),
  presets: [{ id: 'preset-audio-midside', title: { de: 'M/S', en: 'M/S' }, options: { mode: 'ms' } }],
  ffmpeg: A.adapt(A.audioMidSideArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioCenterRemove = definePresetTool({
  id: 'audio-center-remove',
  category: 'audio',
  title: { de: 'Center entfernen', en: 'Remove center' },
  description: { de: 'Karaoke-ähnliches L−R.', en: 'Karaoke-style L−R.' },
  inputs: aIn,
  options: empty,
  ffmpeg: A.adapt(A.audioCenterRemoveArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioCoverArt = defineTool({
  id: 'audio-cover-art',
  pack: 'media',
  category: 'audio',
  title: { de: 'Cover-Art / ID3', en: 'Cover art / ID3' },
  description: { de: 'Bild einbetten oder extrahieren.', en: 'Embed or extract artwork.' },
  inputs: { accept: [...AUDIO_ACCEPT, ...IMAGE_OVERLAY_ACCEPT], multiple: true, min: 1 },
  options: coverOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = coverOpts.parse(options);
    const audio = files.find((f) => !/^image\//.test(f.mime) && !/\.(png|jpe?g|webp)$/i.test(f.name)) ?? files[0]!;
    const image = files.find((f) => f !== audio);
    const alias = inputAlias(0, audio.name);
    if (opts.mode === 'extract') {
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-an', '-vcodec', 'copy', 'cover.jpg'],
        inputs: [{ name: alias, data: await audio.bytes() }],
        outputs: ['cover.jpg'],
      });
      const bytes = result.files['cover.jpg'];
      if (!bytes) throw new Error('Kein Cover in der Datei.');
      return wrap('audio-cover-art', files, [neoFileFromBytes('cover.jpg', bytes, 'image/jpeg')], [], {}, opts);
    }
    if (!image) throw new Error('Zum Einbetten ein Bild als zweite Datei wählen.');
    const result = await runFfmpeg(ctx, {
      args: ['-i', alias, '-i', 'art.jpg', '-map', '0:a', '-map', '1', '-c', 'copy', '-disposition:v', 'attached_pic', 'tagged.m4a'],
      inputs: [{ name: alias, data: await audio.bytes() }],
      outputs: ['tagged.m4a'],
      cwdExtra: { 'art.jpg': await image.bytes() },
    });
    return wrap('audio-cover-art', files, [neoFileFromBytes(outName(audio.name, 'm4a'), requireOutput(result, 'tagged.m4a'), 'audio/mp4')], [], {}, opts);
  },
});

export const audioVoiceNotes = definePresetTool({
  id: 'audio-voice-notes',
  category: 'audio',
  title: { de: 'Sprachnotizen', en: 'Voice notes' },
  description: { de: 'WhatsApp Opus/OGG oder Voice-Memo M4A.', en: 'WhatsApp Opus/OGG or Voice Memo M4A.' },
  inputs: aIn,
  options: z.object({ preset: z.enum(['whatsapp', 'voice-memo']).default('whatsapp') }),
  ffmpeg: (opts, _p, io) =>
    opts.preset === 'voice-memo'
      ? ['-i', io.inputs[0]!, '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', io.output]
      : ['-i', io.inputs[0]!, '-c:a', 'libopus', '-b:a', '24k', '-ar', '16000', '-ac', '1', io.output],
  outputName: (opts, files) => outName(files[0]!.name, opts.preset === 'voice-memo' ? 'm4a' : 'ogg'),
});

export const audioKeyBpm = defineTool({
  id: 'audio-key-bpm',
  pack: 'media',
  category: 'audio',
  title: { de: 'Tonart / BPM', en: 'Key / BPM' },
  description: {
    de: 'Chromagramm + Krumhansl-Profile; BPM über Onset-Autokorrelation auf PCM.',
    en: 'Chromagram + Krumhansl profiles; BPM via onset autocorrelation on PCM.',
  },
  inputs: aIn,
  options: empty,
  licenses: MEDIA_LICENSES,
  async run(ctx, files) {
    const file = files[0]!;
    const wav = await extractAudio(file, { sampleRate: 22050, mono: true, format: 'wav' }, ctx);
    const analysis = analyzeKeyBpm(await wav.bytes(), 22050);
    const json = new TextEncoder().encode(JSON.stringify(analysis, null, 2));
    return wrap('audio-key-bpm', files, [neoFileFromBytes(`${stem(file.name)}-key-bpm.json`, json, 'application/json')], [], analysis as unknown as Record<string, unknown>, {});
  },
});

export const audioAnonymizeVoice = definePresetTool({
  id: 'audio-anonymize-voice',
  category: 'audio',
  title: { de: 'Stimme anonymisieren', en: 'Anonymize voice' },
  description: {
    de: 'asetrate+atempo Pitch-Shift (kein rubberband — GPL). Kein Unumkehrbar-Claim.',
    en: 'asetrate+atempo pitch shift (no rubberband — GPL). No irreversibility claim.',
  },
  inputs: aIn,
  options: z.object({ semitones: z.coerce.number().min(-12).max(12).default(5) }),
  ffmpeg: A.adapt(A.audioAnonymizeArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioStems = defineTool({
  id: 'audio-stems',
  pack: 'media',
  category: 'audio',
  title: { de: 'Stems / Gesang trennen', en: 'Stems / vocal split' },
  description: {
    de: 'Offen: kein Apache/MIT-ONNX in vertretbarer Größe gebündelt (Spleeter/Demucs ≫ 2 MB-Limit).',
    en: 'Open: no Apache/MIT ONNX of acceptable size is bundled (Spleeter/Demucs exceed the 2 MB limit).',
  },
  inputs: aIn,
  options: empty,
  licenses: MEDIA_LICENSES,
  async run() {
    const report = {
      available: false,
      status: 'open',
      reason:
        'Kein MIT/Apache-ONNX-Modell mit vertretbarer Größe im Repo. Demucs-Gewichte sind MIT, aber dutzende MB. Modell-Registry analog tools-image-ai möglich, sobald ein kompaktes Modell self-hosted liegt.',
    };
    return {
      outputs: [neoFileFromBytes('audio-stems-open.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), 'application/json')],
      warnings: [report.reason],
      report,
    };
  },
});

export const audioEdit = definePresetTool({
  id: 'audio-edit',
  category: 'audio',
  title: { de: 'Audio-Filterkern', en: 'Audio filter core' },
  description: { de: 'Träger der Audio-FFmpeg-Presets.', en: 'Carrier for audio FFmpeg presets.' },
  inputs: aIn,
  options: z.object({
    preset: z.enum(['mono', 'volume', 'fade', 'midside']).default('mono'),
    db: z.coerce.number().min(-24).max(12).default(-3),
  }),
  presets: [
    { id: 'preset-audio-stereo-mono', title: { de: 'Mono', en: 'Mono' }, options: { preset: 'mono' } },
    { id: 'preset-audio-volume', title: { de: 'Lautstärke', en: 'Volume' }, options: { preset: 'volume' } },
    { id: 'preset-audio-fade', title: { de: 'Fade', en: 'Fade' }, options: { preset: 'fade' } },
    { id: 'preset-audio-midside', title: { de: 'Mid/Side', en: 'Mid/Side' }, options: { preset: 'midside' } },
  ],
  ffmpeg: (opts, probes, io) => {
    if (opts.preset === 'volume') return A.audioVolumeArgs({ db: opts.db }, probes[0]!, io);
    if (opts.preset === 'fade') return A.audioFadeArgs({ fadeIn: 0.2, fadeOut: 0.2 }, probes[0]!, io);
    if (opts.preset === 'midside') return A.audioMidSideArgs({ mode: 'ms' }, probes[0]!, io);
    return A.audioMonoArgs(opts, probes[0]!, io);
  },
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});

export const audioTools = [
  audioConvert,
  audioEdit,
  audioNormalize,
  audioJoin,
  audioTrim,
  audioSplit,
  audioMono,
  audioVolume,
  audioFade,
  audioRemoveSilence,
  audioDucking,
  audioBleep,
  audioEqPresets,
  audioLimiterDc,
  audioReplaygain,
  audioDither,
  audioCrossfadePlaylist,
  audioRingtone,
  audioSpectrogram,
  audioWaveformPoster,
  audioMidSide,
  audioCenterRemove,
  audioCoverArt,
  audioVoiceNotes,
  audioKeyBpm,
  audioAnonymizeVoice,
  audioStems,
  audioClickTrack,
  audioSpatialFlatten,
];
