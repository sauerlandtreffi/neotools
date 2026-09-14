import { z } from 'zod';

export const presetsFileSchema = z.object({
  version: z.number().int().min(1).default(1),
  organization: z.string().min(1),
  defaults: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  locked: z.record(z.string(), z.array(z.string())).default({}),
  hiddenTools: z.array(z.string()).default([]),
  requiredPipelines: z.record(z.string(), z.array(z.string())).default({}),
  redactPatterns: z.array(z.unknown()).optional(),
  watermarkText: z.string().optional(),
  batesPrefix: z.string().optional(),
});

export type PresetsFile = z.infer<typeof presetsFileSchema>;

export function examplePresets(kind: 'kanzlei' | 'steuerberater' | 'behoerde'): PresetsFile {
  if (kind === 'steuerberater') {
    return {
      version: 1,
      organization: 'Muster-Steuerberatung',
      defaults: {
        'dach-receipt-export': { preset: 'datev', skr: 'SKR04' },
        'dach-erechnung-generate': { profile: 'XRECHNUNG' },
      },
      locked: { 'dach-erechnung-generate': ['profile'] },
      hiddenTools: ['pdf-sign'],
      requiredPipelines: { send: ['pdf-sanitize'] },
      watermarkText: 'Mandant vertraulich',
      batesPrefix: 'STB',
    };
  }
  if (kind === 'behoerde') {
    return {
      version: 1,
      organization: 'Musterbehörde',
      defaults: { 'pdf-a': { profile: '2b' }, 'pdf-ua': { mode: 'check' } },
      locked: { 'pdf-a': ['profile'] },
      hiddenTools: [],
      requiredPipelines: { publish: ['pdf-sanitize', 'pdf-a', 'pdf-ua'] },
      watermarkText: 'Nur für den Dienstgebrauch',
      batesPrefix: 'AZ',
    };
  }
  return {
    version: 1,
    organization: 'Musterkanzlei',
    defaults: { 'pdf-aktenbundler': { batesPrefix: 'K', cover: true }, 'pdf-redact': { mode: 'auto' } },
    locked: { 'pdf-sanitize': ['dropJs'] },
    hiddenTools: [],
    requiredPipelines: { send: ['pdf-sanitize'] },
    watermarkText: 'Anwaltliche Vertraulichkeit',
    batesPrefix: 'K',
  };
}
