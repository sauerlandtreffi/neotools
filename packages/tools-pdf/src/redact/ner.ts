import type { PatternMatch } from './patterns.js';

export interface NerEntity {
  text: string;
  label: string;
  start: number;
  end: number;
}

export type NerFn = (text: string) => Promise<NerEntity[]>;

let override: NerFn | null = null;

export function setNerOverride(fn: NerFn | null): void {
  override = fn;
}

const PERSON_LABELS = new Set(['PER', 'PERSON', 'I-PER', 'B-PER', 'LOC', 'ORG', 'I-LOC', 'B-LOC', 'I-ORG', 'B-ORG']);

async function dynamicImport(name: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(name)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runNer(
  text: string,
  modelPath?: string,
): Promise<{ entities: NerEntity[]; warning?: string }> {
  if (override) {
    return { entities: await override(text) };
  }
  if (!text.trim()) return { entities: [] };

  const mod =
    (await dynamicImport('@xenova/transformers')) ?? (await dynamicImport('@huggingface/transformers'));
  if (!mod) {
    return { entities: [], warning: 'NER-Modell nicht verfügbar (Transformers.js fehlt).' };
  }

  try {
    const pipeline = mod['pipeline'] as
      | ((task: string, model: string, opts?: Record<string, unknown>) => Promise<(t: string) => Promise<unknown>>)
      | undefined;
    if (typeof pipeline !== 'function') {
      return { entities: [], warning: 'NER-Modell: pipeline() fehlt.' };
    }
    const env = mod['env'] as { allowRemoteModels?: boolean; localModelPath?: string } | undefined;
    if (env) {
      env.allowRemoteModels = false;
      if (modelPath) env.localModelPath = modelPath;
    }
    const model = modelPath || 'Xenova/bert-base-multilingual-cased-ner-hrl';
    const ner = await pipeline('token-classification', model, { aggregation_strategy: 'simple' });
    const raw = await ner(text);
    const list = Array.isArray(raw) ? raw : [];
    const entities: NerEntity[] = [];
    for (const row of list) {
      const rec = row as { entity_group?: string; entity?: string; word?: string; start?: number; end?: number };
      const label = String(rec.entity_group ?? rec.entity ?? '');
      if (!PERSON_LABELS.has(label.toUpperCase())) continue;
      const word = String(rec.word ?? '').replace(/^##/, '').trim();
      if (!word) continue;
      entities.push({
        text: word,
        label,
        start: Number(rec.start ?? 0),
        end: Number(rec.end ?? 0),
      });
    }
    return { entities };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { entities: [], warning: `NER-Modell nicht ladbar: ${msg}` };
  }
}

export function nerToMatches(entities: NerEntity[]): PatternMatch[] {
  return entities
    .filter((e) => e.text.trim().length >= 2)
    .map((e) => ({
      pattern: 'ner' as const,
      text: e.text,
      start: e.start,
      end: e.end > e.start ? e.end : e.start + e.text.length,
    }));
}
