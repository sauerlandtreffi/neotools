import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME, attachProvenance, createProvenance, sha256 } from '@neotools/engine';
import { dHash, hamming, pHash } from '../ops/perceptual.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  hamming: z.coerce.number().min(0).max(32).default(8),
  keep: z.enum(['largest', 'oldest']).default('largest'),
});

export const imageDuplicates = defineTool({
  id: 'image-duplicates',
  pack: 'image',
  category: 'images',
  title: { de: 'Duplikate', en: 'Duplicates' },
  description: {
    de: 'Exakte Duplikate (SHA-256) und perzeptuelle (dHash/pHash + Hamming). Gruppen-Report und Empfehlung (größte/älteste).',
    en: 'Exact duplicates (SHA-256) and perceptual (dHash/pHash + Hamming). Group report and keep recommendation (largest/oldest).',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2 },
  outputs: { mime: [MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['duplikate', 'phash', 'dhash'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const items: Array<{
      name: string;
      size: number;
      sha256: string;
      dhash: string;
      phash: string;
    }> = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress(i / files.length, files[i]!.name);
      const bytes = await files[i]!.bytes();
      const img = await decodeFile(files[i]!);
      items.push({
        name: files[i]!.name,
        size: bytes.length,
        sha256: await sha256(bytes),
        dhash: dHash(img.data, img.width, img.height).toString(16),
        phash: pHash(img.data, img.width, img.height).toString(16),
      });
    }
    const exact = new Map<string, string[]>();
    for (const it of items) {
      const g = exact.get(it.sha256) ?? [];
      g.push(it.name);
      exact.set(it.sha256, g);
    }
    const used = new Set<string>();
    const perceptual: Array<{ members: string[]; keep: string }> = [];
    for (let i = 0; i < items.length; i++) {
      if (used.has(items[i]!.name)) continue;
      const group = [items[i]!];
      const da = BigInt('0x' + items[i]!.dhash);
      const pa = BigInt('0x' + items[i]!.phash);
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(items[j]!.name)) continue;
        const db = BigInt('0x' + items[j]!.dhash);
        const pb = BigInt('0x' + items[j]!.phash);
        if (hamming(da, db) <= parsed.hamming || hamming(pa, pb) <= parsed.hamming) {
          group.push(items[j]!);
          used.add(items[j]!.name);
        }
      }
      if (group.length > 1) {
        used.add(items[i]!.name);
        const keep =
          parsed.keep === 'largest'
            ? [...group].sort((a, b) => b.size - a.size)[0]!.name
            : [...group].sort((a, b) => a.name.localeCompare(b.name))[0]!.name;
        perceptual.push({ members: group.map((g) => g.name), keep });
      }
    }
    const report = {
      exact: [...exact.values()].filter((g) => g.length > 1).map((members) => ({
        members,
        keep: [...items].filter((x) => members.includes(x.name)).sort((a, b) => b.size - a.size)[0]?.name,
      })),
      perceptual,
    };
    const provenance = await createProvenance('image-duplicates', parsed, files);
    return {
      outputs: [neoFileFromBytes('duplicates.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json)],
      warnings: [],
      report: attachProvenance(report, provenance),
    };
  },
});
