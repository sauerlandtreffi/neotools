import { z } from 'zod';
import { attachProvenance, createProvenance, defineTool } from '@neotools/engine';
import {
  compareFingerprints,
  fingerprintBytes,
  fingerprintMarkdown,
} from '../fingerprint/fingerprint.js';
import { FORENSICS_LICENSES, localeOpt, reportFiles } from './common.js';

const options = z.object({
  locale: localeOpt,
  mode: z.enum(['create', 'compare']).default('create'),
});

export const forensicsFingerprint = defineTool({
  id: 'forensics-fingerprint',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Dokument-Fingerabdruck', en: 'Document fingerprint' },
  description: {
    de: 'SHA-256, Text-SimHash, Fonts/Producer; pHash/dHash nur mit Canvas. Vergleich zweier Dateien.',
    en: 'SHA-256, text SimHash, fonts/producer; pHash/dHash only with canvas. Compare two files.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  presets: [
    { id: 'create', title: { de: 'Erzeugen', en: 'Create' }, options: { mode: 'create' } },
    { id: 'compare', title: { de: 'Vergleichen', en: 'Compare' }, options: { mode: 'compare' } },
  ],
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['fingerprint', 'phash', 'simhash', 'dokument vergleich'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const fps = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress((i + 0.4) / files.length, files[i]!.name);
      fps.push(await fingerprintBytes(await files[i]!.bytes(), files[i]!.name, ctx.platform, files[i]!.mime));
    }
    const compare =
      parsed.mode === 'compare' && fps.length >= 2 ? compareFingerprints(fps[0]!, fps[1]!) : undefined;
    const payload = { fingerprints: fps, compare };
    return {
      outputs: reportFiles('fingerprint', payload, fingerprintMarkdown(fps, parsed.locale, compare)),
      warnings: fps.filter((f) => f.perceptual.skipped).map((f) => `${f.file}: ${f.perceptual.skipped}`),
      report: attachProvenance(payload, await createProvenance('forensics-fingerprint', parsed, files)),
    };
  },
});
