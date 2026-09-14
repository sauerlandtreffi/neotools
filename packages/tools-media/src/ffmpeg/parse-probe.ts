import type { ProbeAttachment, ProbeChapter, ProbeResult, ProbeStream, StreamKind } from './types.js';

function parseClock(raw: string): number {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(raw);
  if (!m) return Number(raw) || 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function kindOf(codecType: string | undefined, codec?: string): StreamKind {
  const t = (codecType ?? '').toLowerCase();
  if (t === 'video' || t === 'audio' || t === 'subtitle' || t === 'attachment' || t === 'data') return t;
  const c = (codec ?? '').toLowerCase();
  if (/^(h26|hevc|vp[89]|av1|mpeg|mjpeg|gif|png|theora|prores)/.test(c)) return 'video';
  if (/^(aac|mp3|opus|vorbis|flac|pcm|ac3|eac3|alac|wma)/.test(c)) return 'audio';
  if (/^(subrip|ass|ssa|webvtt|mov_text|hdmv)/.test(c)) return 'subtitle';
  return 'unknown';
}

export function parseFfprobeJson(jsonText: string): ProbeResult {
  const data = JSON.parse(jsonText) as {
    format?: { format_name?: string; duration?: string; bit_rate?: string };
    streams?: Array<Record<string, unknown>>;
    chapters?: Array<Record<string, unknown>>;
  };
  const formatName = data.format?.format_name ?? 'unknown';
  const container = formatName.split(',')[0] ?? 'unknown';
  const streams: ProbeStream[] = (data.streams ?? []).map((s, i) => {
    const tags = (s.tags ?? {}) as Record<string, string>;
    const side = (s.side_data_list as Array<Record<string, unknown>> | undefined) ?? [];
    const rotSide = side.find((x) => typeof x.rotation === 'number');
    const avg = typeof s.avg_frame_rate === 'string' ? s.avg_frame_rate : '';
    const [num, den] = avg.split('/').map(Number);
    const fps = num && den ? num / den : undefined;
    return {
      index: typeof s.index === 'number' ? s.index : i,
      type: kindOf(String(s.codec_type ?? ''), String(s.codec_name ?? '')),
      codec: typeof s.codec_name === 'string' ? s.codec_name : undefined,
      width: typeof s.width === 'number' ? s.width : undefined,
      height: typeof s.height === 'number' ? s.height : undefined,
      fps,
      sampleRate: s.sample_rate ? Number(s.sample_rate) : undefined,
      channels: typeof s.channels === 'number' ? s.channels : undefined,
      bitrate: s.bit_rate ? Number(s.bit_rate) : undefined,
      language: tags.language,
      rotation: typeof rotSide?.rotation === 'number' ? Number(rotSide.rotation) : tags.rotate ? Number(tags.rotate) : undefined,
    };
  });
  const chapters: ProbeChapter[] = (data.chapters ?? []).map((c) => ({
    start: Number(c.start_time ?? 0),
    end: c.end_time !== undefined ? Number(c.end_time) : undefined,
    title: ((c.tags as Record<string, string> | undefined)?.title as string | undefined) ?? undefined,
  }));
  const attachments: ProbeAttachment[] = streams
    .filter((s) => s.type === 'attachment')
    .map((s, i) => ({ name: `att-${s.index ?? i}` }));
  const color = (data.streams ?? [])
    .map((s) => `${s.color_transfer ?? ''} ${s.color_primaries ?? ''} ${s.color_space ?? ''}`)
    .join(' ')
    .toLowerCase();
  const hdr = /smpte2084|arib-std-b67|bt2020|hdr10|dolby/.test(color);
  const rotation = streams.find((s) => s.rotation)?.rotation;
  return {
    container,
    duration: Number(data.format?.duration ?? 0),
    bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : undefined,
    streams,
    ...(rotation !== undefined ? { rotation } : {}),
    hdr,
    chapters,
    attachments,
  };
}

export function parseFfmpegLog(log: string): ProbeResult {
  const containerMatch = /Input #\d+,\s*([^,]+),/.exec(log);
  const container = (containerMatch?.[1] ?? 'unknown').trim();
  const durMatch = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(log);
  const duration = durMatch?.[1] ? parseClock(durMatch[1]) : 0;
  const brMatch = /bitrate:\s*(\d+)\s*kb\/s/.exec(log);
  const streams: ProbeStream[] = [];
  const streamRe =
    /Stream #\d+:(\d+)(?:\[.*?\])?(?:\((\w+)\))?:\s*(Video|Audio|Subtitle|Attachment|Data):\s*([^\n,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(log))) {
    const index = Number(m[1]);
    const language = m[2];
    const type = kindOf(m[3], m[4]);
    const restStart = m.index + m[0].length;
    const rest = log.slice(restStart, restStart + 240);
    const dim = /(\d{2,5})x(\d{2,5})/.exec(rest);
    const fps = /([\d.]+)\s*fps/.exec(rest);
    const hz = /(\d+)\s*Hz/.exec(rest);
    const ch = /\b(mono|stereo|2\.\d|5\.1|7\.1|(\d)\s*channels?)\b/i.exec(rest);
    const bit = /(\d+)\s*kb\/s/.exec(rest);
    let channels: number | undefined;
    if (ch) {
      if (/mono/i.test(ch[0])) channels = 1;
      else if (/stereo/i.test(ch[0])) channels = 2;
      else if (/5\.1/.test(ch[0])) channels = 6;
      else if (/7\.1/.test(ch[0])) channels = 8;
      else if (ch[2]) channels = Number(ch[2]);
    }
    streams.push({
      index,
      type,
      codec: (m[4] ?? '').split(/\s+/)[0]?.toLowerCase(),
      width: dim ? Number(dim[1]) : undefined,
      height: dim ? Number(dim[2]) : undefined,
      fps: fps ? Number(fps[1]) : undefined,
      sampleRate: hz ? Number(hz[1]) : undefined,
      channels,
      bitrate: bit ? Number(bit[1]) * 1000 : undefined,
      language,
    });
  }
  const chapters: ProbeChapter[] = [];
  const chapRe = /Chapter #\d+:\d+:\s*start\s*([\d.]+),\s*end\s*([\d.]+)([\s\S]*?)(?=Chapter #|Stream #|Input #|$)/g;
  while ((m = chapRe.exec(log))) {
    const title = /title\s*:\s*(.+)/.exec(m[3] ?? '');
    chapters.push({ start: Number(m[1]), end: Number(m[2]), title: title?.[1]?.trim() });
  }
  const attachments: ProbeAttachment[] = [];
  const attRe = /filename\s*:\s*(\S+)/g;
  while ((m = attRe.exec(log))) attachments.push({ name: m[1] ?? 'attachment' });
  const rot = /rotation of\s*(-?[\d.]+)|rotate\s*:\s*(-?[\d.]+)/i.exec(log);
  const rotation = rot ? Number(rot[1] ?? rot[2]) : undefined;
  const hdr = /smpte2084|arib-std-b67|bt2020|hdr10|dolby vision/i.test(log);
  return {
    container,
    duration,
    bitrate: brMatch ? Number(brMatch[1]) * 1000 : undefined,
    streams,
    ...(rotation !== undefined && !Number.isNaN(rotation) ? { rotation } : {}),
    hdr,
    chapters,
    attachments,
    rawLog: log,
  };
}

export function primaryVideo(probe: ProbeResult): ProbeStream | undefined {
  return probe.streams.find((s) => s.type === 'video' && s.codec !== 'mjpeg' && s.codec !== 'png');
}

export function primaryAudio(probe: ProbeResult): ProbeStream | undefined {
  return probe.streams.find((s) => s.type === 'audio');
}
