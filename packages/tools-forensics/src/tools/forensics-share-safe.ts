import { defineTool } from '@neotools/engine';
import { shareSafeBytes, shareSafeMarkdown } from '../share-safe/share-safe.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsShareSafe = defineTool({
  id: 'forensics-share-safe',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Sicher teilen?', en: 'Safe to share?' },
  description: {
    de: 'Checkliste (GPS, Autor, JS, Anhänge, Polyglot, …) mit Ampel. Kein eigenes Bereinigen.',
    en: 'Checklist (GPS, author, JS, attachments, polyglot, …) with traffic light. Does not sanitize.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['sicher teilen', 'share safe', 'privacy check'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-share-safe',
      parsed,
      async (file) => ({ json: await shareSafeBytes(await file.bytes(), file.name, file.mime) }),
      (rows, locale) => shareSafeMarkdown(rows as Awaited<ReturnType<typeof shareSafeBytes>>[], locale),
      'share-safe-report',
    );
  },
});
