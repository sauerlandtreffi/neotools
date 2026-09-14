import { afJoin, atempoChain, vfJoin } from '../names.js';
import type { ProbeResult } from '../ffmpeg/types.js';
import { primaryVideo } from '../ffmpeg/parse-probe.js';
import type { PresetIo } from './define-preset-tool.js';

const emptyProbe: ProbeResult = { container: 'unknown', duration: 0, streams: [], hdr: false, chapters: [], attachments: [] };

export function adapt<O>(fn: (opts: O, probe: ProbeResult, io: PresetIo) => string[]) {
  return (opts: O, probes: ProbeResult[], io: PresetIo) => fn(opts, probes[0] ?? emptyProbe, io);
}

export function firstProbe(probes: ProbeResult[]): ProbeResult {
  return probes[0] ?? emptyProbe;
}

export function watermarkFilter(opts: {
  position?: string;
  opacity?: number;
  text?: string;
}): string {
  const pos = opts.position ?? 'se';
  const xy =
    pos === 'nw'
      ? '10:10'
      : pos === 'ne'
        ? 'W-w-10:10'
        : pos === 'sw'
          ? '10:H-h-10'
          : pos === 'center'
            ? '(W-w)/2:(H-h)/2'
            : 'W-w-10:H-h-10';
  const opacity = opts.opacity ?? 0.6;
  if (opts.text) {
    const escaped = opts.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `drawtext=text='${escaped}':x=${xy.split(':')[0]}:y=${xy.split(':')[1]}:fontsize=24:fontcolor=white@${opacity}:box=1:boxcolor=black@0.35`;
  }
  return `overlay=${xy}:format=auto`;
}

export function cropDetectOrManual(opts: { crop?: string; mode?: string }): string | undefined {
  if (opts.mode === 'letterbox' || opts.crop === 'detect') return undefined;
  if (opts.crop && opts.crop !== 'auto') return `crop=${opts.crop}`;
  const x = Number((opts as { cropX?: number }).cropX ?? 0);
  const y = Number((opts as { cropY?: number }).cropY ?? 0);
  const w = Number((opts as { cropW?: number }).cropW ?? 0);
  const h = Number((opts as { cropH?: number }).cropH ?? 0);
  if (w > 0 && h > 0) return `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)}`;
  return undefined;
}

export function videoConvertArgs(
  opts: {
    container?: string;
    codec?: string;
    crf?: number;
    bitrateKbps?: number;
    width?: number;
    height?: number;
    fps?: number;
  },
  _probe: ProbeResult,
  io: PresetIo,
): string[] {
  const container = opts.container ?? 'mp4';
  const codec = opts.codec ?? (container === 'webm' ? 'vp9' : container === 'gif' ? 'gif' : 'vp9');
  const args = ['-i', io.inputs[0]!];
  const scale =
    opts.width || opts.height
      ? `scale=${opts.width && opts.width > 0 ? opts.width : -2}:${opts.height && opts.height > 0 ? opts.height : -2}`
      : undefined;
  const fps = opts.fps && opts.fps > 0 ? `fps=${opts.fps}` : undefined;
  if (codec === 'gif') {
    args.push(
      ...vfJoin([scale, fps, 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse']),
      '-loop',
      '0',
      io.output,
    );
    return args;
  }
  args.push(...vfJoin([scale, fps]));
  if (codec === 'vp9') args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(opts.crf ?? 32));
  else if (codec === 'av1') args.push('-c:v', 'libaom-av1', '-crf', String(opts.crf ?? 32), '-cpu-used', '6');
  else if (codec === 'h264') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(opts.crf ?? 23));
  else if (codec === 'mpeg4') args.push('-c:v', 'mpeg4', '-q:v', String(opts.crf ?? 5));
  else args.push('-c:v', codec);
  if (opts.bitrateKbps && opts.bitrateKbps > 0 && codec !== 'vp9') {
    args.push('-b:v', `${opts.bitrateKbps}k`);
  }
  if (container === 'webm') args.push('-c:a', 'libopus', '-b:a', '96k');
  else if (container === 'mp4' || container === 'mov' || container === 'mkv') args.push('-c:a', 'aac', '-b:a', '128k');
  else args.push('-c:a', 'copy');
  if (container === 'mp4' || container === 'mov') args.push('-movflags', '+faststart');
  args.push(io.output);
  return args;
}

export function videoTrimArgs(opts: { startSec?: number; endSec?: number; copy?: boolean }, probe: ProbeResult, io: PresetIo): string[] {
  const start = opts.startSec ?? 0;
  const end = opts.endSec && opts.endSec > start ? opts.endSec : undefined;
  const args = ['-ss', String(start), '-i', io.inputs[0]!];
  if (end !== undefined) args.push('-to', String(end));
  if (opts.copy !== false) {
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
  }
  args.push(io.output);
  void probe;
  return args;
}

export function videoMuteArgs(_opts: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-c:v', 'copy', '-an', io.output];
}

export function videoResizeArgs(opts: { width?: number; height?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const w = opts.width && opts.width > 0 ? opts.width : -2;
  const h = opts.height && opts.height > 0 ? opts.height : -2;
  return ['-i', io.inputs[0]!, '-vf', `scale=${w}:${h}`, io.output];
}

export function videoCropArgs(
  opts: { cropX?: number; cropY?: number; cropW?: number; cropH?: number; mode?: string },
  probe: ProbeResult,
  io: PresetIo,
): string[] {
  const v = primaryVideo(probe);
  if (opts.mode === 'letterbox') {
    return ['-i', io.inputs[0]!, '-vf', 'cropdetect=24:16:0', '-f', 'null', '-'];
  }
  const w = opts.cropW && opts.cropW > 1 ? opts.cropW : Math.round((v?.width ?? 320) * (opts.cropW || 1));
  const h = opts.cropH && opts.cropH > 1 ? opts.cropH : Math.round((v?.height ?? 240) * (opts.cropH || 1));
  const x = opts.cropX && opts.cropX > 1 ? opts.cropX : Math.round((v?.width ?? 320) * (opts.cropX || 0));
  const y = opts.cropY && opts.cropY > 1 ? opts.cropY : Math.round((v?.height ?? 240) * (opts.cropY || 0));
  return ['-i', io.inputs[0]!, '-vf', `crop=${Math.max(2, w)}:${Math.max(2, h)}:${Math.max(0, x)}:${Math.max(0, y)}`, io.output];
}

export function videoReverseArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-vf', 'reverse', '-af', 'areverse', io.output];
}

export function videoBoomerangArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return [
    '-i',
    io.inputs[0]!,
    '-filter_complex',
    '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0',
    '-an',
    io.output,
  ];
}

export function videoSpeedArgs(opts: { rate?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const rate = opts.rate && opts.rate > 0 ? opts.rate : 2;
  return ['-i', io.inputs[0]!, '-filter_complex', `[0:v]setpts=PTS/${rate}[v];[0:a]${atempoChain(rate)}[a]`, '-map', '[v]', '-map', '[a]', io.output];
}

export function videoFpsArgs(opts: { fps?: number; mode?: string }, probe: ProbeResult, io: PresetIo): string[] {
  const fps = opts.fps ?? 30;
  if (opts.mode === 'vfr-cfr') return ['-i', io.inputs[0]!, '-vsync', 'cfr', '-r', String(fps), io.output];
  const src = primaryVideo(probe)?.fps ?? fps;
  const tempo = src > 0 ? fps / src : 1;
  return ['-i', io.inputs[0]!, '-vf', `fps=${fps}`, '-af', atempoChain(tempo), io.output];
}

export function videoGifArgs(opts: { fps?: number; width?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const fps = opts.fps ?? 12;
  const width = opts.width ?? 320;
  return [
    '-i',
    io.inputs[0]!,
    '-vf',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`,
    '-loop',
    '0',
    io.output,
  ];
}

export function videoRemuxArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-c', 'copy', io.output];
}

export function videoRepairArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-err_detect', 'ignore_err', '-fflags', '+genpts+igndts+discardcorrupt', '-i', io.inputs[0]!, '-c', 'copy', io.output];
}

export function videoRestoreArgs(opts: { preset?: string }, _p: ProbeResult, io: PresetIo): string[] {
  const preset = opts.preset ?? 'denoise';
  const vf =
    preset === 'deinterlace'
      ? 'yadif=0:-1:0'
      : preset === 'stabilize'
        ? 'deshake'
        : preset === 'sharpen'
          ? 'unsharp=5:5:1.0:5:5:0.0'
          : preset === 'brighten'
            ? 'eq=brightness=0.12:contrast=1.08:gamma=1.1'
            : 'hqdn3d=4:3:6:4.5';
  return ['-i', io.inputs[0]!, '-vf', vf, io.output];
}

export function videoHdrArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return [
    '-i',
    io.inputs[0]!,
    '-vf',
    'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p',
    io.output,
  ];
}

export function videoFlagsArgs(
  opts: { action?: string; colorRange?: string },
  _p: ProbeResult,
  io: PresetIo,
): string[] {
  const args = ['-i', io.inputs[0]!, '-c', 'copy'];
  if (opts.colorRange && opts.colorRange !== 'keep') args.push('-color_range', opts.colorRange);
  if (opts.action === 'clear-rotate') args.push('-metadata:s:v:0', 'rotate=0');
  if (opts.action === 'strip-hdr') args.push('-color_trc', 'bt709', '-color_primaries', 'bt709', '-colorspace', 'bt709');
  args.push(io.output);
  return args;
}

export function videoContactSheetArgs(opts: { cols?: number; rows?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const cols = opts.cols ?? 4;
  const rows = opts.rows ?? 4;
  return ['-i', io.inputs[0]!, '-vf', `fps=1/${Math.max(1, rows)},scale=160:90,tile=${cols}x${rows}`, '-frames:v', '1', io.output];
}

export function videoThumbnailsArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return [
    '-i',
    io.inputs[0]!,
    '-vf',
    "thumbnail=n=80,scale=480:-1,drawbox=x=iw*0.05:y=ih*0.05:w=iw*0.9:h=ih*0.9:color=white@0.15:t=2",
    '-frames:v',
    '1',
    io.output,
  ];
}

export function videoLoopArgs(opts: { times?: number; crossfade?: boolean }, probe: ProbeResult, io: PresetIo): string[] {
  const n = Math.max(1, opts.times ?? 2);
  if (opts.crossfade) {
    const d = Math.max(0.2, Math.min(1, (probe.duration || 2) / 8));
    return ['-i', io.inputs[0]!, '-filter_complex', `loop=loop=${n}:size=32767:start=0,acrossfade=d=${d}`, io.output];
  }
  return ['-stream_loop', String(n), '-i', io.inputs[0]!, '-c', 'copy', io.output];
}

export function videoPipArgs(opts: { position?: string; scale?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const s = opts.scale ?? 0.28;
  const pos = opts.position ?? 'se';
  const xy =
    pos === 'nw' ? '10:10' : pos === 'ne' ? 'W-w-10:10' : pos === 'sw' ? '10:H-h-10' : 'W-w-10:H-h-10';
  const overlay = io.inputs[1] ?? io.inputs[0]!;
  return ['-i', io.inputs[0]!, '-i', overlay, '-filter_complex', `[1:v]scale=iw*${s}:ih*${s}[p];[0:v][p]overlay=${xy}`, io.output];
}

export function videoWatermarkArgs(
  opts: { text?: string; position?: string; opacity?: number },
  _p: ProbeResult,
  io: PresetIo,
): string[] {
  const hasImage = (io.inputs.length > 1 && !opts.text) || Boolean(io.inputs[1] && !opts.text);
  if (hasImage && io.inputs[1]) {
    return ['-i', io.inputs[0]!, '-i', io.inputs[1], '-filter_complex', `[1:v]format=rgba,colorchannelmixer=aa=${opts.opacity ?? 0.6}[wm];[0:v][wm]${watermarkFilter({ position: opts.position, opacity: opts.opacity })}`, io.output];
  }
  return ['-i', io.inputs[0]!, ...vfJoin([watermarkFilter({ ...opts, text: opts.text || 'NeoTools' })]), io.output];
}

export function videoReplaceAudioArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-i', io.inputs[1] ?? io.inputs[0]!, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-shortest', io.output];
}

export function videoSplitArgs(opts: { segmentSec?: number; timestamps?: string }, probe: ProbeResult, io: PresetIo): string[] {
  if (opts.timestamps) {
    const parts = opts.timestamps.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n));
    const start = parts[0] ?? 0;
    const end = parts[1] ?? probe.duration;
    return ['-i', io.inputs[0]!, '-ss', String(start), '-to', String(end), '-c', 'copy', io.output];
  }
  const seg = opts.segmentSec ?? 1;
  return ['-i', io.inputs[0]!, '-c', 'copy', '-f', 'segment', '-segment_time', String(seg), '-reset_timestamps', '1', io.output];
}

export function videoJoinArgs(opts: { forceEncode?: boolean }, probes: ProbeResult[], io: PresetIo): string[] {
  const codecs = new Set(probes.map((p) => primaryVideo(p)?.codec).filter(Boolean));
  if (codecs.size <= 1 && !opts.forceEncode) {
    return io.inputs.flatMap((n) => ['-i', n]).concat(['-filter_complex', `concat=n=${io.inputs.length}:v=1:a=1`, io.output]);
  }
  return io.inputs.flatMap((n) => ['-i', n]).concat(['-filter_complex', `concat=n=${io.inputs.length}:v=1:a=1`, io.output]);
}

export function videoDetectArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return [
    '-i',
    io.inputs[0]!,
    '-filter_complex',
    '[0:v]split=4[v0][v1][v2][v3];[v0]select=gt(scene\\,0.4),showinfo[s];[v1]blackdetect=d=0.15:pix_th=0.10[b];[v2]freezedetect=n=0.001:d=0.5[f];[v3]null[n]',
    '-map',
    '[n]',
    '-f',
    'null',
    '-',
  ];
}

export function audioConvertArgs(
  opts: { container?: string; bitrateKbps?: number; sampleRate?: number },
  _p: ProbeResult,
  io: PresetIo,
): string[] {
  const c = opts.container ?? 'mp3';
  const args = ['-i', io.inputs[0]!];
  if (opts.sampleRate) args.push('-ar', String(opts.sampleRate));
  if (c === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', `${opts.bitrateKbps ?? 192}k`);
  else if (c === 'opus' || c === 'ogg') args.push('-c:a', 'libopus', '-b:a', `${opts.bitrateKbps ?? 96}k`);
  else if (c === 'flac') args.push('-c:a', 'flac');
  else if (c === 'wav') args.push('-c:a', 'pcm_s16le');
  else if (c === 'm4a' || c === 'aac') args.push('-c:a', 'aac', '-b:a', `${opts.bitrateKbps ?? 160}k`);
  else args.push('-c:a', 'aac');
  args.push(io.output);
  return args;
}

export function audioTrimArgs(opts: { startSec?: number; endSec?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const args = ['-ss', String(opts.startSec ?? 0), '-i', io.inputs[0]!];
  if (opts.endSec !== undefined) args.push('-to', String(opts.endSec));
  args.push(io.output);
  return args;
}

export function audioMonoArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-ac', '1', io.output];
}

export function audioVolumeArgs(opts: { db?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const db = opts.db ?? 0;
  return ['-i', io.inputs[0]!, '-af', `volume=${db}dB,alimiter=limit=0.95`, io.output];
}

export function audioFadeArgs(opts: { fadeIn?: number; fadeOut?: number }, probe: ProbeResult, io: PresetIo): string[] {
  const fin = opts.fadeIn ?? 0.2;
  const fout = opts.fadeOut ?? 0.2;
  const st = Math.max(0, (probe.duration || 2) - fout);
  return ['-i', io.inputs[0]!, '-af', `afade=t=in:st=0:d=${fin},afade=t=out:st=${st}:d=${fout}`, io.output];
}

export function audioSilenceArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-af', 'silenceremove=start_periods=1:start_threshold=-40dB:stop_periods=-1:stop_threshold=-40dB:stop_duration=0.4', io.output];
}

export function audioEqArgs(opts: { preset?: string }, _p: ProbeResult, io: PresetIo): string[] {
  const p = opts.preset ?? 'telefon';
  const af =
    p === 'radio'
      ? 'highpass=f=200,lowpass=f=4500,equalizer=f=1000:t=q:w=1:g=3'
      : p === 'club'
        ? 'equalizer=f=80:t=q:w=1:g=8,equalizer=f=10000:t=q:w=1:g=3'
        : 'highpass=f=300,lowpass=f=3400,aemphasis=type=cd';
  return ['-i', io.inputs[0]!, '-af', af, io.output];
}

export function audioLimiterArgs(opts: { dc?: boolean }, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, ...afJoin(['alimiter=limit=0.95:level=false', opts.dc !== false ? 'dcshift=shift=0' : undefined, 'adrc']), io.output];
}

export function audioReplaygainArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-af', 'replaygain', io.output];
}

export function audioDitherArgs(opts: { sampleRate?: number; bitDepth?: string }, _p: ProbeResult, io: PresetIo): string[] {
  const sr = opts.sampleRate ?? 44100;
  const osf = opts.bitDepth === '24' ? 's32' : 's16';
  return ['-i', io.inputs[0]!, '-af', `aresample=${sr}:resampler=soxr:dither_method=triangular,aformat=sample_fmts=${osf}`, io.output];
}

export function audioMidSideArgs(opts: { mode?: string }, _p: ProbeResult, io: PresetIo): string[] {
  const mode = opts.mode ?? 'ms';
  const pan = mode === 'side' ? 'stereo|c0=0.5*c0-0.5*c1|c1=0.5*c0-0.5*c1' : 'stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0-0.5*c1';
  return ['-i', io.inputs[0]!, '-af', `pan=${pan}`, io.output];
}

export function audioCenterRemoveArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-af', 'pan=stereo|c0=c0-c1|c1=c1-c0', io.output];
}

export function audioAnonymizeArgs(opts: { semitones?: number }, _p: ProbeResult, io: PresetIo): string[] {
  const st = opts.semitones ?? 5;
  const factor = 2 ** (st / 12);
  return ['-i', io.inputs[0]!, '-af', `asetrate=48000*${factor.toFixed(4)},aresample=48000,${atempoChain(1 / factor)}`, io.output];
}

export function audioSpectrogramArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-lavfi', 'showspectrumpic=s=640x360:mode=combined', io.output];
}

export function audioWaveformArgs(_o: unknown, _p: ProbeResult, io: PresetIo): string[] {
  return ['-i', io.inputs[0]!, '-lavfi', 'showwavespic=s=1280x240:colors=0x1a2744', io.output];
}

export function audioJoinArgs(opts: { crossfade?: number }, _p: ProbeResult[], io: PresetIo): string[] {
  if (opts.crossfade && opts.crossfade > 0 && io.inputs.length >= 2) {
    const n = io.inputs.length;
    const inputs = io.inputs.flatMap((name) => ['-i', name]);
    let filter = '';
    let last = '[0:a]';
    for (let i = 1; i < n; i++) {
      const out = i === n - 1 ? '[out]' : `[x${i}]`;
      filter += `${last}[${i}:a]acrossfade=d=${opts.crossfade}:c1=tri:c2=tri${out};`;
      last = out;
    }
    return [...inputs, '-filter_complex', filter.replace(/;$/, ''), '-map', '[out]', io.output];
  }
  return io.inputs.flatMap((n) => ['-i', n]).concat(['-filter_complex', `concat=n=${io.inputs.length}:v=0:a=1`, io.output]);
}

export const BACKLOG_PRESET_IDS = [
  'preset-video-mute',
  'preset-video-scale',
  'preset-video-crop',
  'preset-video-reverse',
  'preset-video-boomerang',
  'preset-video-speed',
  'preset-video-brighten',
  'preset-video-denoise-hq',
  'preset-video-vfr-cfr',
  'preset-video-rotation',
  'preset-video-fps',
  'preset-video-gif-palette',
  'preset-audio-stereo-mono',
  'preset-audio-volume',
  'preset-audio-fade',
  'preset-audio-midside',
  'preset-audio-replaygain',
  'preset-audio-gapless',
] as const;
