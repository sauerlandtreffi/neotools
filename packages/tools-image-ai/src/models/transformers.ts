import type { Platform, ToolContext } from '@neotools/engine';
import type { RasterImage } from '../raster.js';
import { encodePng } from '../raster.js';
import { resolveTransformersPath } from './load.js';
import { ModelMissingError } from './errors.js';

type PipelineFn = (
  task: string,
  model: string,
  opts?: Record<string, unknown>,
) => Promise<(input: unknown, opts?: Record<string, unknown>) => Promise<unknown>>;

async function loadTransformers(): Promise<{
  pipeline: PipelineFn;
  env: { allowRemoteModels?: boolean; localModelPath?: string; useBrowserCache?: boolean };
} | null> {
  try {
    const mod = (await import('@huggingface/transformers')) as {
      pipeline: PipelineFn;
      env: { allowRemoteModels?: boolean; localModelPath?: string; useBrowserCache?: boolean };
    };
    return mod;
  } catch {
    return null;
  }
}

function configureEnv(
  env: { allowRemoteModels?: boolean; localModelPath?: string; useBrowserCache?: boolean },
  localPath: string,
): void {
  env.allowRemoteModels = false;
  env.useBrowserCache = true;
  env.localModelPath = localPath.endsWith('/') ? localPath : `${localPath}/`;
}

export async function detectPersons(
  image: RasterImage,
  platform: Platform,
  ctx: ToolContext,
  confirmed = false,
  minScore = 0.5,
): Promise<{ boxes: Array<{ x: number; y: number; w: number; h: number; score: number }>; warning?: string }> {
  try {
    const { entry, localPath } = await resolveTransformersPath('yolos-tiny', platform, { confirmed });
    const tf = await loadTransformers();
    if (!tf) return { boxes: [], warning: 'Transformers.js fehlt — Personen-Detektor übersprungen.' };
    configureEnv(tf.env, localPath.replace(/\/?$/, '/../'));
    ctx.progress(0.2, `Lade ${entry.id}`);
    const det = await tf.pipeline('object-detection', entry.localName, { quantized: true });
    const png = encodePng(image);
    const blob = new Blob([png.slice()], { type: 'image/png' });
    const raw = await det(blob, { threshold: minScore });
    const list = Array.isArray(raw) ? raw : [];
    const boxes: Array<{ x: number; y: number; w: number; h: number; score: number }> = [];
    for (const row of list) {
      const rec = row as {
        label?: string;
        score?: number;
        box?: { xmin: number; ymin: number; xmax: number; ymax: number };
      };
      if ((rec.label ?? '').toLowerCase() !== 'person') continue;
      const b = rec.box;
      if (!b) continue;
      boxes.push({
        x: b.xmin,
        y: b.ymin,
        w: b.xmax - b.xmin,
        h: b.ymax - b.ymin,
        score: rec.score ?? 0,
      });
    }
    return { boxes };
  } catch (err) {
    if (err instanceof ModelMissingError) return { boxes: [], warning: err.message };
    return { boxes: [], warning: err instanceof Error ? err.message : String(err) };
  }
}

export async function captionImage(
  image: RasterImage,
  platform: Platform,
  ctx: ToolContext,
  confirmed = false,
): Promise<{ en: string; warning?: string }> {
  const { entry, localPath } = await resolveTransformersPath('vit-gpt2-caption', platform, { confirmed });
  const tf = await loadTransformers();
  if (!tf) throw new Error('Transformers.js fehlt — Bildbeschreibung nicht möglich.');
  configureEnv(tf.env, localPath.replace(/\/?$/, '/../'));
  ctx.progress(0.25, `Lade ${entry.id}`);
  const cap = await tf.pipeline('image-to-text', entry.localName, { quantized: true });
  const png = encodePng(image);
  const blob = new Blob([png.slice()], { type: 'image/png' });
  const raw = await cap(blob);
  const list = Array.isArray(raw) ? raw : [raw];
  const first = list[0] as { generated_text?: string } | undefined;
  return { en: String(first?.generated_text ?? '').trim() };
}

export async function translateEnDe(
  text: string,
  platform: Platform,
  ctx: ToolContext,
  confirmed = false,
): Promise<{ de: string; warning?: string }> {
  if (!text.trim()) return { de: '' };
  const { entry, localPath } = await resolveTransformersPath('opus-mt-en-de', platform, { confirmed });
  const tf = await loadTransformers();
  if (!tf) return { de: text, warning: 'Übersetzer fehlt — englischer Text belassen.' };
  configureEnv(tf.env, localPath.replace(/\/?$/, '/../'));
  ctx.progress(0.7, `Lade ${entry.id}`);
  const tr = await tf.pipeline('translation', entry.localName, { quantized: true });
  const raw = await tr(text);
  const list = Array.isArray(raw) ? raw : [raw];
  const first = list[0] as { translation_text?: string } | undefined;
  return { de: String(first?.translation_text ?? text).trim() };
}

export async function upscaleTransformers(
  _image: RasterImage,
  _platform: Platform,
  _ctx: ToolContext,
): Promise<null> {
  return null;
}
