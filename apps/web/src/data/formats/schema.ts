import { z } from 'zod';

export const formatFamilySchema = z.enum([
  'image',
  'video',
  'audio',
  'document',
  'archive',
  'font',
  'data',
]);

export const browserLevelSchema = z.enum(['yes', 'partial', 'no', 'unknown']);

export const localeTextSchema = z.object({
  de: z.string(),
  en: z.string(),
});

export const browserTripleSchema = z.object({
  chrome: browserLevelSchema,
  firefox: browserLevelSchema,
  safari: browserLevelSchema,
});

export const formatSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  names: localeTextSchema,
  mime: z.array(z.string().min(1)).min(1),
  extensions: z.array(z.string().regex(/^\.[a-z0-9.]+$/)).min(1),
  family: formatFamilySchema,
  container: z.string().optional(),
  codec: z.string().optional(),
  lossy: z.boolean(),
  lossless: z.boolean(),
  alpha: z.boolean(),
  animation: z.boolean(),
  maxDims: z
    .object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
    })
    .optional(),
  colorDepth: z.string().optional(),
  metadataSupport: z.object({
    exif: z.boolean(),
    xmp: z.boolean(),
    icc: z.boolean(),
  }),
  browserSupport: z.object({
    decode: browserTripleSchema,
    encode: browserTripleSchema,
  }),
  typicalUse: localeTextSchema,
  pros: z.object({
    de: z.array(z.string()).min(1),
    en: z.array(z.string()).min(1),
  }),
  cons: z.object({
    de: z.array(z.string()).min(1),
    en: z.array(z.string()).min(1),
  }),
  openStandard: z.boolean(),
  patentNotes: localeTextSchema.optional(),
  year: z.number().int().min(1970).max(2100),
  spec: z.string().url(),
  relatedToolsExtra: z.array(z.string()).default([]),
  faq: z
    .array(
      z.object({
        q: localeTextSchema,
        a: localeTextSchema,
      }),
    )
    .max(5)
    .optional(),
});

export type FormatFamily = z.infer<typeof formatFamilySchema>;
export type BrowserLevel = z.infer<typeof browserLevelSchema>;
export type FormatRecord = z.infer<typeof formatSchema>;

export const FORMAT_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  tif: 'tiff',
  'pdf/a': 'pdfa',
  'pdf-a': 'pdfa',
  htm: 'html',
  markdown: 'md',
  mpeg4: 'mp4',
  'gif-as-video': 'gif-video',
  aac: 'aac',
  mp4a: 'm4a',
  wave: 'wav',
  oga: 'ogg',
  opus: 'opus',
  heif: 'heif',
  heic: 'heic',
};

export function canonicalFormatId(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/^\./, '');
  return FORMAT_ALIASES[key] ?? key;
}
