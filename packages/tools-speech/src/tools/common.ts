import {
  attachProvenance,
  createProvenance,
  mimeFromName,
  neoFileFromBytes,
  type NeoFile,
  type ToolContext,
} from '@neotools/engine';
import { decodeSubtitleBytes } from '../captions/encoding.js';
import { parseAs, parseCaptions, parseJson } from '../captions/parse.js';
import type { CaptionDoc, CaptionFormat, Cue, Transcript } from '../captions/types.js';
import { cuesToTranscript } from '../captions/types.js';

export function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'out';
}

export function textFile(name: string, text: string, mime?: string): NeoFile {
  return neoFileFromBytes(name, new TextEncoder().encode(text), mime ?? mimeFromName(name));
}

export async function readText(file: NeoFile): Promise<string> {
  return decodeSubtitleBytes(await file.bytes());
}

export async function loadCaptionDoc(file: NeoFile): Promise<CaptionDoc> {
  const text = await readText(file);
  return parseCaptions(text, file.name);
}

export async function loadTranscript(file: NeoFile): Promise<Transcript> {
  const text = await readText(file);
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.json') || text.trim().startsWith('{')) {
    try {
      const data = JSON.parse(text) as Transcript & { cues?: Cue[] };
      if (Array.isArray(data.segments)) return { language: data.language ?? 'und', segments: data.segments };
      return cuesToTranscript(parseJson(text), data.language ?? 'und');
    } catch {
      // fall through
    }
  }
  const doc = parseCaptions(text, file.name);
  return cuesToTranscript(doc.cues, doc.language ?? 'und');
}

export function parseFormatList(value: string | string[]): CaptionFormat[] {
  const raw = Array.isArray(value) ? value : value.split(/[,\s]+/);
  const allowed: CaptionFormat[] = ['srt', 'vtt', 'ass', 'sbv', 'ttml', 'lrc', 'json', 'txt', 'tsv'];
  const out: CaptionFormat[] = [];
  for (const item of raw) {
    const f = item.trim().toLowerCase() as CaptionFormat;
    if ((allowed as string[]).includes(f) && !out.includes(f)) out.push(f);
  }
  return out.length ? out : ['srt'];
}

export async function provenanceReport(
  toolId: string,
  options: unknown,
  files: readonly NeoFile[],
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return attachProvenance(extra, await createProvenance(toolId, options, [...files]));
}

export function pickCaptionFiles(files: readonly NeoFile[]): NeoFile[] {
  return files.filter((f) => /\.(srt|vtt|ass|ssa|sbv|ttml|xml|lrc|json|txt|tsv)$/i.test(f.name));
}

export function pickAudioFiles(files: readonly NeoFile[]): NeoFile[] {
  return files.filter((f) =>
    /\.(wav|wave|pcm|mp3|ogg|opus|flac|m4a|mp4|m4v|mov|webm|mkv|avi)$/i.test(f.name) ||
    f.mime.startsWith('audio/') ||
    f.mime.startsWith('video/'),
  );
}

export function pickJsonFiles(files: readonly NeoFile[]): NeoFile[] {
  return files.filter((f) => f.name.toLowerCase().endsWith('.json') || f.mime === 'application/json');
}

export function parseAsFormat(text: string, name: string, force?: CaptionFormat): Cue[] {
  if (force) return parseAs(force, text);
  return parseCaptions(text, name).cues;
}

export async function maybeAltText(
  file: NeoFile,
  ctx: ToolContext,
  confirmed: boolean,
): Promise<string | undefined> {
  try {
    const ai = await import('@neotools/tools-image-ai');
    const result = await ai.imageAltText.run(ctx, [file], {
      lang: 'de',
      format: 'json',
      writeExif: false,
      confirmModelDownload: confirmed,
    });
    const jsonFile = result.outputs.find((o) => o.name.endsWith('.json'));
    if (!jsonFile) return undefined;
    const rows = JSON.parse(new TextDecoder().decode(await jsonFile.bytes())) as Array<{ altDe?: string; altEn?: string }>;
    return rows[0]?.altDe || rows[0]?.altEn;
  } catch {
    return undefined;
  }
}
