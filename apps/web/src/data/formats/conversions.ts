import type { Registry, ToolDefinition } from '@neotools/engine';
import { zodObjectFields } from '@neotools/engine';
import { FORMAT_CATALOG, getFormat } from './catalog';
import { formatsAccepting, formatsEmitting } from './related';
import { canonicalFormatId, type FormatRecord } from './schema';

export type ConversionStatus = 'available' | 'planned';

export interface ConversionEdge {
  from: string;
  to: string;
  status: ConversionStatus;
  toolId?: string;
  presetId?: string;
  options?: Record<string, unknown>;
  note?: { de: string; en: string };
}

const CONVERTER_ID =
  /(^|-)convert$|to-images$|to-pdf$|to-gif$|^gif-to-|^images-to-|^pdf-to-|archive-convert/;

/** Curated pairs that should exist even before the implementing pack is registered. */
export const PLANNED_CONVERSIONS: ConversionEdge[] = [
  { from: 'heic', to: 'jpg', status: 'planned', toolId: 'image-convert', options: { format: 'jpeg' } },
  { from: 'heic', to: 'png', status: 'planned', toolId: 'image-convert', options: { format: 'png' } },
  { from: 'heif', to: 'jpg', status: 'planned', toolId: 'image-convert', options: { format: 'jpeg' } },
  { from: 'png', to: 'webp', status: 'planned', toolId: 'image-convert', options: { format: 'webp' } },
  { from: 'jpg', to: 'webp', status: 'planned', toolId: 'image-convert', options: { format: 'webp' } },
  { from: 'png', to: 'avif', status: 'planned', toolId: 'image-convert', options: { format: 'avif' } },
  { from: 'jpg', to: 'avif', status: 'planned', toolId: 'image-convert', options: { format: 'avif' } },
  { from: 'webp', to: 'jpg', status: 'planned', toolId: 'image-convert', options: { format: 'jpeg' } },
  { from: 'gif', to: 'webp', status: 'planned', toolId: 'image-convert', options: { format: 'webp' } },
  { from: 'svg', to: 'png', status: 'planned', toolId: 'image-convert', options: { format: 'png' } },
  { from: 'tiff', to: 'jpg', status: 'planned', toolId: 'image-convert', options: { format: 'jpeg' } },
  { from: 'pdf', to: 'jpg', status: 'planned', toolId: 'pdf-to-images', options: { format: 'jpg' } },
  { from: 'pdf', to: 'png', status: 'planned', toolId: 'pdf-to-images', options: { format: 'png' } },
  { from: 'jpg', to: 'pdf', status: 'planned', toolId: 'images-to-pdf' },
  { from: 'png', to: 'pdf', status: 'planned', toolId: 'images-to-pdf' },
  { from: 'docx', to: 'pdf', status: 'planned', toolId: 'office-docx' },
  { from: 'md', to: 'pdf', status: 'planned', toolId: 'office-markdown' },
  { from: 'mp4', to: 'webm', status: 'planned', toolId: 'video-convert', options: { format: 'webm' } },
  { from: 'mkv', to: 'mp4', status: 'planned', toolId: 'video-convert', options: { format: 'mp4' } },
  { from: 'mov', to: 'mp4', status: 'planned', toolId: 'video-convert', options: { format: 'mp4' } },
  { from: 'gif-video', to: 'mp4', status: 'planned', toolId: 'gif-to-video' },
  { from: 'mp4', to: 'gif-video', status: 'planned', toolId: 'video-to-gif' },
  { from: 'wav', to: 'mp3', status: 'planned', toolId: 'audio-convert', options: { format: 'mp3' } },
  { from: 'flac', to: 'mp3', status: 'planned', toolId: 'audio-convert', options: { format: 'mp3' } },
  { from: 'mp3', to: 'wav', status: 'planned', toolId: 'audio-convert', options: { format: 'wav' } },
  { from: 'zip', to: '7z', status: 'planned', toolId: 'archive-convert', options: { format: '7z' } },
];

function isConverter(tool: ToolDefinition): boolean {
  if (tool.category === 'convert') return true;
  return CONVERTER_ID.test(tool.id);
}

function formatEnumValues(tool: ToolDefinition): string[] {
  const fields = zodObjectFields(tool.options);
  const field = fields.find((item) => item.name === 'format' && item.enumValues?.length);
  if (field?.enumValues?.length) return field.enumValues;
  const fromPresets = new Set<string>();
  for (const preset of tool.presets ?? []) {
    const value = (preset.options as { format?: unknown }).format;
    if (typeof value === 'string') fromPresets.add(value);
  }
  return [...fromPresets];
}

function mapOptionToFormatId(value: string): string | undefined {
  const id = canonicalFormatId(value);
  return getFormat(id) ? id : undefined;
}

function pairKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function addEdge(map: Map<string, ConversionEdge>, edge: ConversionEdge): void {
  if (edge.from === edge.to) return;
  if (!getFormat(edge.from) || !getFormat(edge.to)) return;
  const key = pairKey(edge.from, edge.to);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, edge);
    return;
  }
  if (existing.status === 'planned' && edge.status === 'available') {
    map.set(key, edge);
  }
}

function edgesFromTool(tool: ToolDefinition): ConversionEdge[] {
  if (!isConverter(tool)) return [];
  const inputs = formatsAccepting(tool.inputs.accept);
  const formatValues = formatEnumValues(tool);
  const mappedOutputs = formatValues
    .map((value) => ({ value, id: mapOptionToFormatId(value) }))
    .filter((row): row is { value: string; id: string } => Boolean(row.id));

  if (mappedOutputs.length) {
    const edges: ConversionEdge[] = [];
    for (const from of inputs) {
      for (const out of mappedOutputs) {
        if (from.id === out.id) continue;
        const preset = tool.presets?.find((p) => (p.options as { format?: string }).format === out.value);
        edges.push({
          from: from.id,
          to: out.id,
          status: 'available',
          toolId: tool.id,
          presetId: preset?.id,
          options: { format: out.value },
        });
      }
    }
    return edges;
  }

  const outputs = formatsEmitting(tool.outputs?.mime);
  if (!inputs.length || !outputs.length) return [];
  const sameFamilyOnly =
    inputs.every((f) => f.family === inputs[0]?.family) &&
    outputs.every((f) => f.family === outputs[0]?.family) &&
    inputs[0]?.family === outputs[0]?.family &&
    inputs.every((f) => outputs.some((o) => o.id === f.id));
  if (sameFamilyOnly) return [];

  const edges: ConversionEdge[] = [];
  for (const from of inputs) {
    for (const to of outputs) {
      if (from.id === to.id) continue;
      edges.push({
        from: from.id,
        to: to.id,
        status: 'available',
        toolId: tool.id,
      });
    }
  }
  return edges;
}

export function buildConversionMatrix(registry: Registry): ConversionEdge[] {
  const map = new Map<string, ConversionEdge>();
  for (const planned of PLANNED_CONVERSIONS) addEdge(map, planned);
  for (const tool of registry.list()) {
    if (!isConverter(tool)) continue;
    for (const edge of edgesFromTool(tool)) addEdge(map, edge);
  }
  return [...map.values()].sort((a, b) => pairKey(a.from, a.to).localeCompare(pairKey(b.from, b.to)));
}

export function conversionPairId(edge: Pick<ConversionEdge, 'from' | 'to'>): string {
  return `${edge.from}-to-${edge.to}`;
}

export function parseConversionPair(pair: string): { from: string; to: string } | undefined {
  const match = /^([a-z0-9-]+)-to-([a-z0-9-]+)$/.exec(pair);
  if (!match) return undefined;
  return { from: match[1]!, to: match[2]! };
}

export function conversionsFrom(fromId: string, edges: readonly ConversionEdge[]): ConversionEdge[] {
  return edges.filter((edge) => edge.from === fromId);
}

export function findConversion(
  edges: readonly ConversionEdge[],
  from: string,
  to: string,
): ConversionEdge | undefined {
  return edges.find((edge) => edge.from === from && edge.to === to);
}

export function conversionFormats(edge: ConversionEdge): { from: FormatRecord; to: FormatRecord } | undefined {
  const from = getFormat(edge.from);
  const to = getFormat(edge.to);
  if (!from || !to) return undefined;
  return { from, to };
}

export function catalogFormatCount(): number {
  return FORMAT_CATALOG.length;
}

/** Image formats that get a dedicated /convert page. Exotic I/O stays on the tool page. */
const SEO_IMAGE_CONVERT = new Set([
  'jpg',
  'png',
  'webp',
  'avif',
  'gif',
  'apng',
  'tiff',
  'heic',
  'heif',
  'svg',
  'bmp',
  'ico',
  'jxl',
]);

export function seoConversionEdges(edges: readonly ConversionEdge[]): ConversionEdge[] {
  return edges.filter((edge) => {
    if (edge.status === 'planned') return true;
    if (edge.toolId !== 'image-convert') return true;
    return SEO_IMAGE_CONVERT.has(edge.from) && SEO_IMAGE_CONVERT.has(edge.to);
  });
}
