import { z } from 'zod';
import {
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type NeoFile,
  type ToolResult,
} from '@neotools/engine';
import { IMAGE_OVERLAY_ACCEPT, SUBTITLE_ACCEPT, VIDEO_ACCEPT } from '../accept.js';
import { largeFileWarnings } from '../ffmpeg/capabilities.js';
import { canEncodeAvc, encodeAvcMp4 } from '../ffmpeg/webcodecs-h264.js';
import { loadSubtitleFont } from '../ffmpeg/font.js';
import { parseDetectLog, parseChapterText, parseCropdetect, ffmetadata } from '../ffmpeg/parse-filters.js';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg, requireOutput } from '../ffmpeg/run.js';
import { MEDIA_LICENSES } from '../licenses.js';
import { inputAlias, mimeForExt, outName, stem } from '../names.js';
import { definePresetTool } from '../presets/define-preset-tool.js';
import * as A from '../presets/args.js';
import { applyVideoCutlist, cutlistOutputName, parseKeepJson, parseKeepOption } from './cutlist.js';
import { videoChromaKey } from '../tools/video-chroma-key.js';
import { videoHighlightReel } from '../tools/video-highlight-reel.js';
import { videoSmartReframe } from '../tools/video-smart-reframe.js';
import { video360Reframe } from '../tools/video-360-reframe.js';

const vIn = { accept: VIDEO_ACCEPT, multiple: false, min: 1 };
const vMany = { accept: VIDEO_ACCEPT, multiple: true, min: 2 };

const empty = z.object({});

const convertOpts = z.object({
  container: z.enum(['mp4', 'webm', 'mkv', 'mov', 'gif']).default('mp4'),
  codec: z.enum(['vp9', 'av1', 'h264', 'mpeg4', 'gif']).default('vp9'),
  crf: z.coerce.number().min(0).max(63).default(32),
  bitrateKbps: z.coerce.number().min(0).max(50_000).default(0),
  width: z.coerce.number().min(0).max(7680).default(0),
  height: z.coerce.number().min(0).max(4320).default(0),
  fps: z.coerce.number().min(0).max(120).default(0),
});

const compressOpts = z.object({
  preset: z.enum(['web', 'social', 'archive', 'fit']).default('web'),
  crf: z.coerce.number().min(10).max(50).default(32),
  targetSizeMb: z.coerce.number().min(0).max(4000).default(0),
});

const cropOpts = z.object({
  mode: z.enum(['manual', 'letterbox']).default('manual'),
  cropX: z.coerce.number().min(0).default(0),
  cropY: z.coerce.number().min(0).default(0),
  cropW: z.coerce.number().min(0).default(0),
  cropH: z.coerce.number().min(0).default(0),
});

const burnOpts = z.object({ srtText: z.string().default('') });

const chapterOpts = z.object({
  chapters: z.string().default(''),
  mode: z.enum(['set', 'extract-cover']).default('set'),
});

const tracksOpts = z.object({ mode: z.enum(['extract', 'downmix51', 'dual']).default('extract') });

function wrapResult(id: string, files: NeoFile[], outputs: NeoFile[], warnings: string[], report: Record<string, unknown>, opts: unknown): Promise<ToolResult> {
  return createProvenance(id, opts, files).then((p) => ({
    outputs,
    warnings,
    report: attachProvenance(report, p),
  }));
}

export const videoConvert = defineTool({
  id: 'video-convert',
  pack: 'media',
  category: 'video',
  title: { de: 'Video konvertieren', en: 'Convert video' },
  description: {
    de: 'MP4/WebM/MKV/MOV/GIF lokal wandeln. VP9/AV1/MPEG-4; H.264 im Browser über WebCodecs + mp4-muxer.',
    en: 'Convert MP4/WebM/MKV/MOV/GIF locally. VP9/AV1/MPEG-4; H.264 in the browser via WebCodecs + mp4-muxer.',
  },
  inputs: { accept: VIDEO_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['video/mp4', 'video/webm', 'video/x-matroska', 'image/gif'] },
  options: convertOpts,
  presets: [
    { id: 'preset-video-vfr-cfr', title: { de: 'VFR → CFR', en: 'VFR → CFR' }, options: { fps: 30 } },
    { id: 'preset-video-fps', title: { de: '30 fps', en: '30 fps' }, options: { fps: 30 } },
    { id: 'webm-vp9', title: { de: 'WebM VP9', en: 'WebM VP9' }, options: { container: 'webm', codec: 'vp9' } },
  ],
  licenses: MEDIA_LICENSES,
  seo: { keywords: ['video converter', 'mp4', 'webm', 'vp9'] },
  async run(ctx, files, options) {
    const opts = convertOpts.parse(options);
    const warnings = largeFileWarnings(files, ctx);
    const outputs: NeoFile[] = [];
    for (const file of files) {
      const p = await probe(file, ctx);
      const ext = opts.container;
      const name = outName(file.name, ext);
      if (opts.codec === 'h264' && opts.container === 'mp4' && (await canEncodeAvc())) {
        const raw = 'frames.rgba';
        const w = opts.width || p.streams.find((s) => s.type === 'video')?.width || 320;
        const h = opts.height || p.streams.find((s) => s.type === 'video')?.height || 240;
        const fps = opts.fps || p.streams.find((s) => s.type === 'video')?.fps || 25;
        const alias = inputAlias(0, file.name);
        const dumped = await runFfmpeg(ctx, {
          args: ['-i', alias, '-vf', `fps=${fps},scale=${w}:${h},format=rgba`, '-f', 'rawvideo', raw],
          inputs: [{ name: alias, data: await file.bytes() }],
          outputs: [raw],
          durationHint: p.duration,
        });
        const rgba = requireOutput(dumped, raw);
        const stride = w * h * 4;
        const frames: Array<{ data: Uint8Array; width: number; height: number }> = [];
        for (let i = 0; i + stride <= rgba.byteLength; i += stride) {
          frames.push({ data: rgba.subarray(i, i + stride), width: w, height: h });
        }
        const mp4 = await encodeAvcMp4(frames, { fps, bitrate: (opts.bitrateKbps || 1000) * 1000 }, ctx);
        outputs.push(neoFileFromBytes(name, mp4, 'video/mp4'));
        warnings.push('H.264 über WebCodecs (avc1.*) + mp4-muxer, nicht über libx264.');
        continue;
      }
      if (opts.codec === 'h264' && !(await canEncodeAvc())) {
        warnings.push('H.264-WebCodecs fehlt — Fallback MPEG-4/VP9 (kein libx264 im geplanten LGPL-Build).');
      }
      const codec = opts.codec === 'h264' ? 'mpeg4' : opts.codec;
      const io = { inputs: [inputAlias(0, file.name)], output: name };
      const args = A.videoConvertArgs({ ...opts, codec }, p, io);
      const result = await runFfmpeg(ctx, {
        args,
        inputs: [{ name: io.inputs[0]!, data: await file.bytes() }],
        outputs: [name],
        durationHint: p.duration,
      });
      outputs.push(neoFileFromBytes(name, requireOutput(result, name), mimeForExt(ext)));
    }
    return wrapResult('video-convert', files, outputs, warnings, {}, opts);
  },
});

export const videoCompress = defineTool({
  id: 'video-compress',
  pack: 'media',
  category: 'video',
  title: { de: 'Video komprimieren', en: 'Compress video' },
  description: {
    de: 'CRF/Bitrate-Presets oder Make-it-fit: Binärsuche über Bitrate/Auflösung auf Zielgröße MB.',
    en: 'CRF/bitrate presets or make-it-fit: binary search bitrate/resolution to a target size.',
  },
  inputs: vIn,
  options: compressOpts,
  presets: [
    { id: 'web', title: { de: 'Web VP9', en: 'Web VP9' }, options: { preset: 'web', crf: 32 } },
    { id: 'fit-8mb', title: { de: 'Max. 8 MB', en: 'Max 8 MB' }, options: { preset: 'fit', targetSizeMb: 8 } },
  ],
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = compressOpts.parse(options);
    const file = files[0]!;
    const warnings = largeFileWarnings(files, ctx);
    const p = await probe(file, ctx);
    const target = opts.targetSizeMb > 0 ? opts.targetSizeMb * 1024 * 1024 : 0;
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    const encode = async (bitrate: number, scale = 1) => {
      const w = Math.max(2, Math.round(((p.streams.find((s) => s.width)?.width ?? 320) * scale) / 2) * 2);
      const name = 'fit.webm';
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-vf', `scale=${w}:-2`, '-c:v', 'libvpx-vp9', '-b:v', `${Math.round(bitrate)}k`, '-c:a', 'libopus', '-b:a', '64k', name],
        inputs: [{ name: alias, data }],
        outputs: [name],
        durationHint: p.duration,
      });
      return requireOutput(result, name);
    };
    let out: Uint8Array;
    if (opts.preset === 'fit' && target > 0) {
      let lo = 80;
      let hi = Math.max(400, Math.round(((p.bitrate ?? 1_500_000) / 1000) * 1.2));
      let best: Uint8Array | undefined;
      let scale = 1;
      for (let i = 0; i < 6; i++) {
        ctx.progress(0.15 + i * 0.12, `fit ${i + 1}/6`);
        const mid = (lo + hi) / 2;
        const bytes = await encode(mid, scale);
        if (bytes.byteLength <= target) {
          best = bytes;
          lo = mid;
        } else {
          hi = mid;
          if (i >= 3 && scale > 0.45) scale *= 0.75;
        }
      }
      out = best ?? (await encode(lo, scale));
      if (out.byteLength > target) warnings.push('Zielgröße knapp verfehlt — niedrigste getestete Bitrate verwendet.');
    } else {
      const name = outName(file.name, 'webm');
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(opts.crf), '-c:a', 'libopus', name],
        inputs: [{ name: alias, data }],
        outputs: [name],
        durationHint: p.duration,
      });
      out = requireOutput(result, name);
    }
    return wrapResult('video-compress', files, [neoFileFromBytes(outName(file.name, 'webm'), out, 'video/webm')], warnings, { targetSizeMb: opts.targetSizeMb }, opts);
  },
});

export const videoTrim = definePresetTool({
  id: 'video-trim',
  category: 'video',
  title: { de: 'Video trimmen', en: 'Trim video' },
  description: { de: 'In/Out-Marker, Stream-Copy wenn möglich.', en: 'In/out markers, stream-copy when possible.' },
  inputs: vIn,
  options: z.object({
    startSec: z.coerce.number().min(0).default(0),
    endSec: z.coerce.number().min(0).default(0),
    copy: z.boolean().default(true),
  }),
  ui: { editor: 'media-trim' },
  ffmpeg: (opts, probes, io) => A.videoTrimArgs({ ...opts, endSec: opts.endSec || undefined }, probes[0]!, io),
  outputName: (opts, files) => outName(files[0]!.name, 'mp4'),
});

export const videoMute = definePresetTool({
  id: 'video-mute',
  category: 'video',
  title: { de: 'Video stumm', en: 'Mute video' },
  description: { de: 'Tonspur entfernen (-an).', en: 'Remove audio (-an).' },
  inputs: vIn,
  options: empty,
  presets: [{ id: 'preset-video-mute', title: { de: 'Stumm', en: 'Mute' }, options: {} }],
  ffmpeg: A.adapt(A.videoMuteArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoResize = definePresetTool({
  id: 'video-resize',
  category: 'video',
  title: { de: 'Video skalieren', en: 'Resize video' },
  description: { de: 'scale=-Filter, eine Seite 0 = auto.', en: 'scale= filter, 0 = auto.' },
  inputs: vIn,
  options: z.object({ width: z.coerce.number().min(0).max(7680).default(640), height: z.coerce.number().min(0).max(4320).default(0) }),
  presets: [{ id: 'preset-video-scale', title: { de: '640 breit', en: '640 wide' }, options: { width: 640, height: 0 } }],
  ffmpeg: A.adapt(A.videoResizeArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoCrop = defineTool({
  id: 'video-crop',
  pack: 'media',
  category: 'video',
  title: { de: 'Video croppen', en: 'Crop video' },
  description: { de: 'Manuell oder Letterbox via cropdetect.', en: 'Manual or letterbox via cropdetect.' },
  inputs: vIn,
  options: cropOpts,
  presets: [{ id: 'preset-video-crop', title: { de: 'Letterbox erkennen', en: 'Detect letterbox' }, options: { mode: 'letterbox' } }],
  ui: { editor: 'media-trim' },
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = cropOpts.parse(options);
    const file = files[0]!;
    const p = await probe(file, ctx);
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    let crop = A.videoCropArgs(opts, p, { inputs: [alias], output: 'out.mp4' });
    if (opts.mode === 'letterbox') {
      const detect = await runFfmpeg(ctx, {
        args: ['-i', alias, '-vf', 'cropdetect=24:16:0', '-t', String(Math.min(p.duration || 2, 4)), '-f', 'null', '-'],
        inputs: [{ name: alias, data }],
        outputs: [],
        durationHint: p.duration,
      });
      const box = parseCropdetect(detect.log);
      if (!box) throw new Error('cropdetect fand keinen Letterbox-Schnitt.');
      crop = ['-i', alias, '-vf', `crop=${box}`, 'out.mp4'];
    }
    const result = await runFfmpeg(ctx, { args: crop, inputs: [{ name: alias, data }], outputs: ['out.mp4'], durationHint: p.duration });
    return wrapResult('video-crop', files, [neoFileFromBytes(outName(file.name, 'mp4'), requireOutput(result, 'out.mp4'), 'video/mp4')], largeFileWarnings(files, ctx), {}, opts);
  },
});

export const videoSplit = definePresetTool({
  id: 'video-split',
  category: 'video',
  title: { de: 'Video splitten', en: 'Split video' },
  description: { de: 'Segmentlänge oder Zeitmarken, Copy wenn möglich.', en: 'Segment length or timestamps, copy when possible.' },
  inputs: vIn,
  options: z.object({
    segmentSec: z.coerce.number().min(0.2).max(3600).default(1),
    timestamps: z.string().default(''),
  }),
  ffmpeg: (opts, probes, io) => {
    if (opts.timestamps.trim()) return A.videoSplitArgs(opts, probes[0]!, io);
    return ['-i', io.inputs[0]!, '-c', 'copy', '-f', 'segment', '-segment_time', String(opts.segmentSec), '-reset_timestamps', '1', 'seg_%03d.mp4'];
  },
  outputName: (opts) => (opts.timestamps.trim() ? 'clip.mp4' : 'seg_%03d.mp4'),
  outputPrefix: (opts) => (opts.timestamps.trim() ? undefined : 'seg_'),
  mapOutputs: (_o, files) => {
    const segs = Object.entries(files).filter(([n, b]) => n.startsWith('seg_') && b.byteLength);
    const src = segs.length ? segs : Object.entries(files).filter(([, b]) => b.byteLength);
    return src.map(([n, b]) => neoFileFromBytes(n, b, mimeForExt(n.split('.').pop() ?? 'mp4')));
  },
});

export const videoJoin = definePresetTool({
  id: 'video-join',
  category: 'video',
  title: { de: 'Videos verbinden', en: 'Join videos' },
  description: { de: 'Concat-Filter; bei Codec-Mismatch Re-Encode.', en: 'Concat filter; re-encode on codec mismatch.' },
  inputs: vMany,
  options: z.object({ forceEncode: z.boolean().default(false) }),
  ffmpeg: (opts, probes, io) => A.videoJoinArgs(opts, probes, io),
  outputName: () => 'joined.mp4',
});

export const videoReplaceAudio = definePresetTool({
  id: 'video-replace-audio',
  category: 'video',
  title: { de: 'Audio ersetzen', en: 'Replace audio' },
  description: { de: 'Zweites File = neue Tonspur.', en: 'Second file becomes the soundtrack.' },
  inputs: { accept: [...VIDEO_ACCEPT, ...['audio/mpeg', 'audio/wav', 'audio/mp4', '.mp3', '.wav', '.m4a']], multiple: true, min: 2 },
  options: empty,
  ffmpeg: A.adapt(A.videoReplaceAudioArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoReverse = definePresetTool({
  id: 'video-reverse',
  category: 'video',
  title: { de: 'Video rückwärts', en: 'Reverse video' },
  description: { de: 'reverse + areverse.', en: 'reverse + areverse.' },
  inputs: vIn,
  options: empty,
  presets: [{ id: 'preset-video-reverse', title: { de: 'Rückwärts', en: 'Reverse' }, options: {} }],
  ffmpeg: A.adapt(A.videoReverseArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoBoomerang = definePresetTool({
  id: 'video-boomerang',
  category: 'video',
  title: { de: 'Boomerang', en: 'Boomerang' },
  description: { de: 'Vorwärts+Rückwärts hintereinander.', en: 'Forward plus reverse concat.' },
  inputs: vIn,
  options: empty,
  presets: [{ id: 'preset-video-boomerang', title: { de: 'Boomerang', en: 'Boomerang' }, options: {} }],
  ffmpeg: A.adapt(A.videoBoomerangArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoSpeed = definePresetTool({
  id: 'video-speed',
  category: 'video',
  title: { de: 'Video-Tempo', en: 'Video speed' },
  description: { de: 'setpts + atempo-Kette, kein Chipmunk.', en: 'setpts + atempo chain, no chipmunk.' },
  inputs: vIn,
  options: z.object({ rate: z.coerce.number().min(0.1).max(8).default(2) }),
  presets: [{ id: 'preset-video-speed', title: { de: '2×', en: '2×' }, options: { rate: 2 } }],
  ffmpeg: A.adapt(A.videoSpeedArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoWatermark = definePresetTool({
  id: 'video-watermark',
  category: 'video',
  title: { de: 'Video-Wasserzeichen', en: 'Video watermark' },
  description: { de: 'Bild oder Text, Position, Opazität.', en: 'Image or text, position, opacity.' },
  inputs: { accept: [...VIDEO_ACCEPT, ...IMAGE_OVERLAY_ACCEPT], multiple: true, min: 1 },
  options: z.object({
    text: z.string().default(''),
    position: z.enum(['nw', 'ne', 'sw', 'se', 'center']).default('se'),
    opacity: z.coerce.number().min(0).max(1).default(0.6),
  }),
  ffmpeg: A.adapt(A.videoWatermarkArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoSubtitlesBurn = defineTool({
  id: 'video-subtitles-burn',
  pack: 'media',
  category: 'video',
  title: { de: 'Untertitel einbrennen', en: 'Burn subtitles' },
  description: { de: 'SRT/ASS via libass, gebündelte OFL-Font.', en: 'SRT/ASS via libass, bundled OFL font.' },
  inputs: { accept: [...VIDEO_ACCEPT, ...SUBTITLE_ACCEPT], multiple: true, min: 1 },
  options: burnOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = burnOpts.parse(options);
    const video = files.find((f) => !/\.(srt|vtt|ass|ssa)$/i.test(f.name)) ?? files[0]!;
    const sub = files.find((f) => /\.(srt|vtt|ass|ssa)$/i.test(f.name));
    const font = await loadSubtitleFont();
    const extra: Record<string, Uint8Array> = {};
    if (font) extra[font.name] = font.data;
    extra['subs.srt'] = sub ? await sub.bytes() : new TextEncoder().encode(opts.srtText || '1\n00:00:00,000 --> 00:00:02,000\nNeoTools\n');
    const alias = inputAlias(0, video.name);
    const fontsdir = font ? ':fontsdir=.' : '';
    const result = await runFfmpeg(ctx, {
      args: ['-i', alias, '-vf', `subtitles=subs.srt${fontsdir}`, 'burn.mp4'],
      inputs: [{ name: alias, data: await video.bytes() }],
      outputs: ['burn.mp4'],
      cwdExtra: extra,
    });
    return wrapResult('video-subtitles-burn', files, [neoFileFromBytes(outName(video.name, 'mp4'), requireOutput(result, 'burn.mp4'), 'video/mp4')], [], {}, opts);
  },
});

export const videoSubtitlesExtract = definePresetTool({
  id: 'video-subtitles-extract',
  category: 'video',
  title: { de: 'Untertitel extrahieren', en: 'Extract subtitles' },
  description: { de: 'Textspuren nach SRT/VTT.', en: 'Text tracks to SRT/VTT.' },
  inputs: vIn,
  options: z.object({ format: z.enum(['srt', 'vtt']).default('srt') }),
  ffmpeg: (opts, _p, io) => ['-i', io.inputs[0]!, '-map', '0:s:0?', '-c:s', opts.format === 'vtt' ? 'webvtt' : 'srt', io.output],
  outputName: (opts, files) => outName(files[0]!.name, opts.format),
});

export const videoToGif = definePresetTool({
  id: 'video-to-gif',
  category: 'video',
  title: { de: 'Video → GIF', en: 'Video → GIF' },
  description: { de: 'palettegen/paletteuse, Größen-Deckel.', en: 'palettegen/paletteuse, size cap.' },
  inputs: vIn,
  options: z.object({ fps: z.coerce.number().min(1).max(30).default(12), width: z.coerce.number().min(32).max(720).default(320) }),
  presets: [{ id: 'preset-video-gif-palette', title: { de: 'Smart-Palette', en: 'Smart palette' }, options: { fps: 12, width: 320 } }],
  ffmpeg: A.adapt(A.videoGifArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'gif'),
});

export const gifToVideo = definePresetTool({
  id: 'gif-to-video',
  category: 'video',
  title: { de: 'GIF → Video', en: 'GIF → Video' },
  description: { de: 'Animiertes GIF nach MP4/WebM.', en: 'Animated GIF to MP4/WebM.' },
  inputs: { accept: ['image/gif', '.gif'], multiple: false, min: 1 },
  options: z.object({ container: z.enum(['mp4', 'webm']).default('mp4') }),
  ffmpeg: (opts, _p, io) => ['-i', io.inputs[0]!, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', io.output],
  outputName: (opts, files) => outName(files[0]!.name, opts.container),
});

export const videoToFrames = definePresetTool({
  id: 'video-to-frames',
  category: 'video',
  title: { de: 'Video → Einzelbilder', en: 'Video → frames' },
  description: { de: 'Intervall oder Anzahl Standbilder.', en: 'Interval or count of stills.' },
  inputs: vIn,
  options: z.object({
    intervalSec: z.coerce.number().min(0.04).max(60).default(0.5),
    count: z.coerce.number().min(0).max(400).default(0),
  }),
  ffmpeg: (opts, probes, io) => {
    const every = Math.max(1, Math.round(((probes[0]?.duration || 2) * 25) / Math.max(opts.count, 1)));
    const vf = opts.count > 0 ? `fps=25,select=not(mod(n\\,${every}))` : `fps=1/${opts.intervalSec}`;
    return ['-i', io.inputs[0]!, '-vf', vf, 'frame_%03d.png'];
  },
  outputName: () => 'frame_%03d.png',
  outputPrefix: () => 'frame_',
  mapOutputs: (_o, files) =>
    Object.entries(files)
      .filter(([n, b]) => n.startsWith('frame_') && b.byteLength)
      .map(([n, b]) => neoFileFromBytes(n, b, 'image/png')),
});

export const videoUnpack = defineTool({
  id: 'video-unpack',
  pack: 'media',
  category: 'video',
  title: { de: 'Video entpacken', en: 'Unpack video' },
  description: { de: 'Spuren, Poster, Untertitel als Dateien.', en: 'Tracks, poster, subtitles as files.' },
  inputs: vIn,
  options: empty,
  licenses: MEDIA_LICENSES,
  async run(ctx, files) {
    const file = files[0]!;
    const p = await probe(file, ctx);
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    const outputs: NeoFile[] = [];
    const warnings = largeFileWarnings(files, ctx);
    let vi = 0;
    let ai = 0;
    let si = 0;
    for (const s of p.streams) {
      const name =
        s.type === 'video' ? `video-${vi++}.mkv` : s.type === 'audio' ? `audio-${ai++}.mka` : s.type === 'subtitle' ? `sub-${si++}.srt` : `stream-${s.index}.bin`;
      try {
        const result = await runFfmpeg(ctx, {
          args: ['-i', alias, '-map', `0:${s.index}`, '-c', 'copy', name],
          inputs: [{ name: alias, data }],
          outputs: [name],
        });
        const bytes = result.files[name];
        if (bytes?.byteLength) outputs.push(neoFileFromBytes(name, bytes, mimeForExt(name.split('.').pop() ?? 'bin')));
      } catch (err) {
        warnings.push(`${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    return wrapResult('video-unpack', files, outputs, warnings, { streams: p.streams.length }, {});
  },
});

export const videoRepair = definePresetTool({
  id: 'video-repair',
  category: 'video',
  title: { de: 'Video reparieren', en: 'Repair video' },
  description: { de: 'Remux, ignore_err, genpts.', en: 'Remux, ignore_err, genpts.' },
  inputs: vIn,
  options: empty,
  ffmpeg: A.adapt(A.videoRepairArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoContactSheet = definePresetTool({
  id: 'video-contact-sheet',
  category: 'video',
  title: { de: 'Kontaktbogen (Video)', en: 'Video contact sheet' },
  description: { de: 'Kacheln via tile-Filter.', en: 'Tiles via the tile filter.' },
  inputs: vIn,
  options: z.object({ cols: z.coerce.number().min(1).max(10).default(4), rows: z.coerce.number().min(1).max(10).default(4) }),
  ffmpeg: A.adapt(A.videoContactSheetArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'png'),
});

export const videoRestore = definePresetTool({
  id: 'video-restore',
  category: 'video',
  title: { de: 'Video restaurieren', en: 'Restore video' },
  description: { de: 'Deinterlace, Denoise, Stabilise, Sharpen — Presets, kein Wunder.', en: 'Deinterlace, denoise, stabilize, sharpen presets.' },
  inputs: vIn,
  options: z.object({ preset: z.enum(['deinterlace', 'denoise', 'stabilize', 'sharpen', 'brighten']).default('denoise') }),
  presets: [
    { id: 'preset-video-denoise-hq', title: { de: 'Entrauschen', en: 'Denoise' }, options: { preset: 'denoise' } },
    { id: 'preset-video-brighten', title: { de: 'Aufhellen', en: 'Brighten' }, options: { preset: 'brighten' } },
  ],
  ffmpeg: A.adapt(A.videoRestoreArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoBrightenDenoise = definePresetTool({
  id: 'video-brighten-denoise',
  category: 'video',
  title: { de: 'Aufhellen + entrauschen', en: 'Brighten + denoise' },
  description: { de: 'eq + hqdn3d.', en: 'eq + hqdn3d.' },
  inputs: vIn,
  options: empty,
  ffmpeg: (_o, _p, io) => ['-i', io.inputs[0]!, '-vf', 'eq=brightness=0.1:contrast=1.06,hqdn3d=3:2:6:4', io.output],
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoRemux = definePresetTool({
  id: 'video-remux',
  category: 'video',
  title: { de: 'Remux', en: 'Remux' },
  description: { de: 'Container ohne Re-Encode.', en: 'Container change without re-encode.' },
  inputs: vIn,
  options: z.object({ container: z.enum(['mp4', 'mkv', 'mov', 'webm']).default('mp4') }),
  ffmpeg: A.adapt(A.videoRemuxArgs),
  outputName: (opts, files) => outName(files[0]!.name, opts.container),
});

export const videoFps = definePresetTool({
  id: 'video-fps',
  category: 'video',
  title: { de: 'Framerate', en: 'Framerate' },
  description: { de: 'VFR→CFR oder fps mit Audio-Tempo.', en: 'VFR→CFR or fps with audio tempo.' },
  inputs: vIn,
  options: z.object({ mode: z.enum(['vfr-cfr', 'set']).default('vfr-cfr'), fps: z.coerce.number().min(1).max(120).default(30) }),
  ffmpeg: A.adapt(A.videoFpsArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoFlags = definePresetTool({
  id: 'video-flags',
  category: 'video',
  title: { de: 'Color-Range / Rotation / HDR-Flags', en: 'Color range / rotation / HDR flags' },
  description: { de: 'Flags setzen/entfernen, HDR-Metadaten strippen.', en: 'Set/clear flags, strip HDR metadata.' },
  inputs: vIn,
  options: z.object({
    action: z.enum(['keep', 'clear-rotate', 'strip-hdr']).default('clear-rotate'),
    colorRange: z.enum(['keep', 'tv', 'pc']).default('keep'),
  }),
  presets: [{ id: 'preset-video-rotation', title: { de: 'Rotation-Flag weg', en: 'Clear rotation flag' }, options: { action: 'clear-rotate' } }],
  ffmpeg: A.adapt(A.videoFlagsArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoHdrToSdr = definePresetTool({
  id: 'video-hdr-to-sdr',
  category: 'video',
  title: { de: 'HDR → SDR', en: 'HDR → SDR' },
  description: { de: 'Tonemap (hable / zscale).', en: 'Tonemap (hable / zscale).' },
  inputs: vIn,
  options: empty,
  ffmpeg: A.adapt(A.videoHdrArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoDetect = defineTool({
  id: 'video-detect',
  pack: 'media',
  category: 'video',
  title: { de: 'Video erkennen', en: 'Detect video events' },
  description: {
    de: 'Szenen, Schwarzbild, Freeze, Clipping, Blitz/Epilepsie-Check → JSON.',
    en: 'Scenes, black frames, freeze, clipping, flash/epilepsy check → JSON.',
  },
  inputs: vIn,
  options: empty,
  licenses: MEDIA_LICENSES,
  async run(ctx, files) {
    const file = files[0]!;
    const p = await probe(file, ctx);
    const alias = inputAlias(0, file.name);
    const result = await runFfmpeg(ctx, {
      args: A.videoDetectArgs({}, p, { inputs: [alias], output: '-' }),
      inputs: [{ name: alias, data: await file.bytes() }],
      outputs: [],
      durationHint: p.duration,
    });
    const report = parseDetectLog(result.log, p.duration || 1);
    const json = new TextEncoder().encode(JSON.stringify(report, null, 2));
    return wrapResult('video-detect', files, [neoFileFromBytes(`${stem(file.name)}-detect.json`, json, 'application/json')], [], report as unknown as Record<string, unknown>, {});
  },
});

export const videoChapters = defineTool({
  id: 'video-chapters',
  pack: 'media',
  category: 'video',
  title: { de: 'Kapitel / Cover', en: 'Chapters / cover' },
  description: { de: 'Kapitel aus Text/JSON, Cover einbetten oder extrahieren.', en: 'Chapters from text/JSON, embed or extract cover art.' },
  inputs: { accept: [...VIDEO_ACCEPT, ...IMAGE_OVERLAY_ACCEPT], multiple: true, min: 1 },
  options: chapterOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = chapterOpts.parse(options);
    const video = files.find((f) => !/^image\//.test(f.mime) && !/\.(png|jpe?g|webp)$/i.test(f.name)) ?? files[0]!;
    const cover = files.find((f) => f !== video);
    const p = await probe(video, ctx);
    const alias = inputAlias(0, video.name);
    if (opts.mode === 'extract-cover') {
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-map', '0:v:1?', '-map', '0:v:0', '-frames:v', '1', 'cover.jpg'],
        inputs: [{ name: alias, data: await video.bytes() }],
        outputs: ['cover.jpg'],
      });
      const bytes = result.files['cover.jpg'];
      if (!bytes) throw new Error('Kein Cover gefunden.');
      return wrapResult('video-chapters', files, [neoFileFromBytes('cover.jpg', bytes, 'image/jpeg')], [], {}, opts);
    }
    const chapters = parseChapterText(opts.chapters || `0 Intro\n${Math.max(0.5, (p.duration || 2) / 2)} Mitte`);
    const meta = ffmetadata(chapters, p.duration || 2);
    const extra: Record<string, Uint8Array> = { 'chap.txt': new TextEncoder().encode(meta) };
    const args = ['-i', alias, '-i', 'chap.txt', '-map_metadata', '1', '-c', 'copy'];
    if (cover) {
      extra['cover.jpg'] = await cover.bytes();
      args.push('-i', 'cover.jpg', '-map', '0', '-map', '2', '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic');
    }
    args.push('chap.mp4');
    const result = await runFfmpeg(ctx, {
      args,
      inputs: [{ name: alias, data: await video.bytes() }],
      outputs: ['chap.mp4'],
      cwdExtra: extra,
    });
    return wrapResult('video-chapters', files, [neoFileFromBytes(outName(video.name, 'mp4'), requireOutput(result, 'chap.mp4'), 'video/mp4')], [], { chapters }, opts);
  },
});

export const videoAudioTracks = defineTool({
  id: 'video-audio-tracks',
  pack: 'media',
  category: 'video',
  title: { de: 'Audiospuren', en: 'Audio tracks' },
  description: { de: 'Alle Audiospuren, Dual-Audio, 5.1→Stereo.', en: 'All audio tracks, dual audio, 5.1→stereo.' },
  inputs: vIn,
  options: tracksOpts,
  licenses: MEDIA_LICENSES,
  async run(ctx, files, options) {
    const opts = tracksOpts.parse(options);
    const file = files[0]!;
    const p = await probe(file, ctx);
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    const audios = p.streams.filter((s) => s.type === 'audio');
    const outputs: NeoFile[] = [];
    if (opts.mode === 'downmix51') {
      const result = await runFfmpeg(ctx, {
        args: ['-i', alias, '-c:v', 'copy', '-ac', '2', 'stereo.mp4'],
        inputs: [{ name: alias, data }],
        outputs: ['stereo.mp4'],
      });
      outputs.push(neoFileFromBytes(outName(file.name, 'mp4'), requireOutput(result, 'stereo.mp4'), 'video/mp4'));
    } else {
      let i = 0;
      for (const s of audios.length ? audios : [{ index: 0, type: 'audio' as const }]) {
        const name = `track-${i++}.m4a`;
        const result = await runFfmpeg(ctx, {
          args: ['-i', alias, '-map', `0:${s.index}`, '-vn', name],
          inputs: [{ name: alias, data }],
          outputs: [name],
        });
        const bytes = result.files[name];
        if (bytes?.byteLength) outputs.push(neoFileFromBytes(name, bytes, 'audio/mp4'));
      }
    }
    return wrapResult('video-audio-tracks', files, outputs, [], { tracks: audios.length }, opts);
  },
});

export const videoLoop = definePresetTool({
  id: 'video-loop',
  category: 'video',
  title: { de: 'Video loopen', en: 'Loop video' },
  description: { de: 'Nahtlos, optional Crossfade.', en: 'Seamless, optional crossfade.' },
  inputs: vIn,
  options: z.object({ times: z.coerce.number().min(1).max(20).default(2), crossfade: z.boolean().default(false) }),
  ffmpeg: A.adapt(A.videoLoopArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoPip = definePresetTool({
  id: 'video-pip',
  category: 'video',
  title: { de: 'PiP-Layout', en: 'PiP layout' },
  description: { de: 'Zweites Video als Bild-in-Bild.', en: 'Second video as picture-in-picture.' },
  inputs: { accept: VIDEO_ACCEPT, multiple: true, min: 1 },
  options: z.object({
    position: z.enum(['nw', 'ne', 'sw', 'se']).default('se'),
    scale: z.coerce.number().min(0.1).max(0.6).default(0.28),
  }),
  ffmpeg: A.adapt(A.videoPipArgs),
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoThumbnails = definePresetTool({
  id: 'video-thumbnails',
  category: 'video',
  title: { de: 'Thumbnails', en: 'Thumbnails' },
  description: { de: 'Peak-Frames (thumbnail-Filter) + Title-Safe-Overlay.', en: 'Peak frames (thumbnail filter) + title-safe overlay.' },
  inputs: vIn,
  options: empty,
  ffmpeg: A.adapt(A.videoThumbnailsArgs),
  outputName: (_o, files) => `${stem(files[0]!.name)}-thumb.png`,
});

const cutlistOpts = z.object({
  keepJson: z.string().default(''),
  copy: z.boolean().default(true),
});

export const videoCutlist = defineTool({
  id: 'video-cutlist',
  pack: 'media',
  category: 'video',
  title: { de: 'Cutlist anwenden', en: 'Apply cutlist' },
  description: {
    de: 'Video + {keep:[[start,end],…]} aus transcript-edits → geschnittenes Video. Stream-Copy wenn Keyframes es erlauben, sonst Re-Encode.',
    en: 'Video + {keep:[[start,end],…]} from transcript-edits → cut video. Stream-copy when keyframes allow, otherwise re-encode.',
  },
  inputs: { accept: [...VIDEO_ACCEPT, 'application/json', '.json'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options: cutlistOpts,
  licenses: MEDIA_LICENSES,
  seo: { keywords: ['cutlist', 'jump cut', 'edl', 'transcript-edits'] },
  async run(ctx, files, options) {
    const opts = cutlistOpts.parse(options);
    const video = files.find((f) => !/\.json$/i.test(f.name) && f.mime !== 'application/json') ?? files[0];
    if (!video) throw new Error('Kein Video.');
    const jsonFile = files.find((f) => /\.json$/i.test(f.name) || f.mime === 'application/json');
    let keep = opts.keepJson ? parseKeepOption(opts.keepJson) : [];
    if (!keep.length && jsonFile) keep = parseKeepJson(new TextDecoder().decode(await jsonFile.bytes()));
    const result = await applyVideoCutlist(ctx, video, keep, opts.copy);
    return wrapResult(
      'video-cutlist',
      files,
      [neoFileFromBytes(cutlistOutputName(video.name), result.bytes, 'video/mp4')],
      [...largeFileWarnings([video]), ...result.warnings],
      { keep, mode: result.mode, windows: keep.length },
      opts,
    );
  },
});

export const videoEdit = definePresetTool({
  id: 'video-edit',
  category: 'video',
  title: { de: 'Video-Filterkern', en: 'Video filter core' },
  description: { de: 'Träger der FFmpeg-Presets (mute, scale, crop, reverse, tempo, …).', en: 'Carrier for FFmpeg presets (mute, scale, crop, reverse, speed, …).' },
  inputs: vIn,
  options: z.object({
    preset: z.enum(['mute', 'scale', 'reverse', 'boomerang', 'speed', 'brighten', 'denoise']).default('mute'),
    rate: z.coerce.number().min(0.25).max(4).default(2),
    width: z.coerce.number().min(0).max(7680).default(640),
  }),
  presets: [
    { id: 'preset-video-mute', title: { de: 'Stumm', en: 'Mute' }, options: { preset: 'mute' } },
    { id: 'preset-video-scale', title: { de: 'Skalieren', en: 'Scale' }, options: { preset: 'scale' } },
    { id: 'preset-video-reverse', title: { de: 'Rückwärts', en: 'Reverse' }, options: { preset: 'reverse' } },
    { id: 'preset-video-boomerang', title: { de: 'Boomerang', en: 'Boomerang' }, options: { preset: 'boomerang' } },
    { id: 'preset-video-speed', title: { de: 'Tempo', en: 'Speed' }, options: { preset: 'speed' } },
    { id: 'preset-video-brighten', title: { de: 'Aufhellen', en: 'Brighten' }, options: { preset: 'brighten' } },
    { id: 'preset-video-denoise-hq', title: { de: 'Entrauschen', en: 'Denoise' }, options: { preset: 'denoise' } },
  ],
  ffmpeg: (opts, probes, io) => {
    if (opts.preset === 'mute') return A.videoMuteArgs(opts, probes[0]!, io);
    if (opts.preset === 'scale') return A.videoResizeArgs({ width: opts.width, height: 0 }, probes[0]!, io);
    if (opts.preset === 'reverse') return A.videoReverseArgs(opts, probes[0]!, io);
    if (opts.preset === 'boomerang') return A.videoBoomerangArgs(opts, probes[0]!, io);
    if (opts.preset === 'speed') return A.videoSpeedArgs({ rate: opts.rate }, probes[0]!, io);
    if (opts.preset === 'brighten') return A.videoRestoreArgs({ preset: 'brighten' }, probes[0]!, io);
    return A.videoRestoreArgs({ preset: 'denoise' }, probes[0]!, io);
  },
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});

export const videoTools = [
  videoConvert,
  videoCutlist,
  videoEdit,
  videoCompress,
  videoTrim,
  videoMute,
  videoResize,
  videoCrop,
  videoSplit,
  videoJoin,
  videoReplaceAudio,
  videoReverse,
  videoBoomerang,
  videoSpeed,
  videoWatermark,
  videoSubtitlesBurn,
  videoSubtitlesExtract,
  videoToGif,
  gifToVideo,
  videoToFrames,
  videoUnpack,
  videoRepair,
  videoContactSheet,
  videoRestore,
  videoBrightenDenoise,
  videoRemux,
  videoFps,
  videoFlags,
  videoHdrToSdr,
  videoDetect,
  videoChapters,
  videoAudioTracks,
  videoLoop,
  videoPip,
  videoThumbnails,
  videoChromaKey,
  videoHighlightReel,
  videoSmartReframe,
  video360Reframe,
];
