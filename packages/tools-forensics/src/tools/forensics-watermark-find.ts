import { defineTool } from '@neotools/engine';
import { findWatermarks, watermarkMarkdown } from '../watermark/watermark.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsWatermarkFind = defineTool({
  id: 'forensics-watermark-find',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Wasserzeichen finden', en: 'Find watermarks' },
  description: {
    de: 'Nur Erkennung: rotierter/großer/halbtransparenter Text, Watermark-Annotationen. Kein Entfernen.',
    en: 'Detection only: rotated/large/faint text, watermark annotations. No removal.',
  },
  inputs: { accept: ['*/*', 'application/pdf', '.pdf', 'image/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['wasserzeichen finden', 'pdf watermark detect'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-watermark-find',
      parsed,
      async (file) => ({ json: await findWatermarks(await file.bytes(), file.name, file.mime) }),
      (rows, locale) => watermarkMarkdown(rows as Awaited<ReturnType<typeof findWatermarks>>[], locale),
      'watermark-find-report',
    );
  },
});
