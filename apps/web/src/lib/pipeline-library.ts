import type { PipelineSpec } from '@neotools/engine';
import type { Registry } from '@neotools/engine';

export interface PipelinePresetFile {
  id: string;
  title: { de: string; en: string };
  description: { de: string; en: string };
  steps: PipelineSpec['steps'];
}

export interface ResolvedPipelinePreset extends PipelinePresetFile {
  pending: boolean;
  missing: string[];
}

export const PIPELINE_LIBRARY: PipelinePresetFile[] = [
  {
    id: 'bewerbung',
    title: { de: 'Bewerbungs-Bundle', en: 'Application bundle' },
    description: {
      de: 'Dokumente bereinigen und als ein PDF bündeln.',
      en: 'Sanitize documents and merge into one PDF.',
    },
    steps: [
      { toolId: 'pdf-sanitize', options: {} },
      { toolId: 'pdf-merge', options: {} },
    ],
  },
  {
    id: 'vor-versand',
    title: { de: 'Vor Versand sicher machen', en: 'Safe before sending' },
    description: {
      de: 'Sanitize und Kompression vor der Weitergabe.',
      en: 'Sanitize and compress before sharing.',
    },
    steps: [
      { toolId: 'pdf-sanitize', options: {} },
      { toolId: 'pdf-compress', options: { preset: 'medium' } },
    ],
  },
  {
    id: 'fotos-pdf',
    title: { de: 'Fotos → EXIF weg → PDF → komprimieren → verschlüsseln', en: 'Photos → strip EXIF → PDF → compress → lock' },
    description: {
      de: 'Bilder ohne Metadaten, dann PDF, dann komprimieren und sperren.',
      en: 'Strip image metadata, make a PDF, compress and lock.',
    },
    steps: [
      { toolId: 'image-metadata', options: {}, whenMime: ['image/*'] },
      { toolId: 'images-to-pdf', options: {} },
      { toolId: 'pdf-compress', options: { preset: 'medium' } },
      { toolId: 'pdf-lock', options: {} },
    ],
  },
  {
    id: 'amtlich',
    title: { de: 'Amtliche Veröffentlichung', en: 'Official publication' },
    description: {
      de: 'PDF/A, PDF-UA, Sanitize, Hash+Zeitstempel.',
      en: 'PDF/A, PDF-UA, sanitize, hash+timestamp.',
    },
    steps: [
      { toolId: 'pdf-a', options: {} },
      { toolId: 'pdf-ua', options: {} },
      { toolId: 'pdf-sanitize', options: {} },
      { toolId: 'dach-hash-timestamp', options: {} },
    ],
  },
  {
    id: 'kanzlei-akte',
    title: { de: 'Kanzlei: Akte bundeln + Bates + schwärzen', en: 'Firm: bundle file + Bates + redact' },
    description: {
      de: 'Aktenbundler mit Bates, danach Schwärzung.',
      en: 'Akte bundler with Bates, then redaction.',
    },
    steps: [
      { toolId: 'pdf-aktenbundler', options: {} },
      { toolId: 'pdf-redact', options: {} },
    ],
  },
];

export function resolvePipelineLibrary(registry: Registry): ResolvedPipelinePreset[] {
  const ids = new Set(registry.ids());
  return PIPELINE_LIBRARY.map((preset) => {
    const missing = preset.steps.map((s) => s.toolId).filter((id) => !ids.has(id));
    return { ...preset, pending: missing.length > 0, missing };
  });
}
