import { defineTool } from '@neotools/engine';
import { identifyFile, identificationMarkdown } from '../identify/identify.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsIdentify = defineTool({
  id: 'forensics-identify',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Datei identifizieren', en: 'Identify file' },
  description: {
    de: 'Magic-Bytes, Encoding und Abgleich Inhalt vs. Endung vs. MIME. Lokal, ohne Upload.',
    en: 'Magic bytes, encoding, and content vs extension vs MIME. Local, no upload.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: {
    keywords: ['datei identifizieren', 'magic bytes', 'mime vs extension', 'forensics identify'],
    faq: [
      {
        q: { de: 'Werden Dateien hochgeladen?', en: 'Are files uploaded?' },
        a: { de: 'Nein. Die Erkennung läuft lokal.', en: 'No. Detection runs locally.' },
      },
    ],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-identify',
      parsed,
      async (file) => ({ json: await identifyFile(file) }),
      (rows, locale) => identificationMarkdown(rows as Awaited<ReturnType<typeof identifyFile>>[], locale),
      'identify-report',
    );
  },
});
