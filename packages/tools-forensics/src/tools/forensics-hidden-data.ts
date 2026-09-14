import { defineTool } from '@neotools/engine';
import { hiddenMarkdown, scanHiddenData } from '../hidden/hidden.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsHiddenData = defineTool({
  id: 'forensics-hidden-data',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Hidden-Data-Radar', en: 'Hidden-data radar' },
  description: {
    de: 'Daten nach EOF, Polyglots, PDF-JS/Anhänge/versteckter Text, EXIF/GPS, Office-Spuren. Nur Nachweis.',
    en: 'Data after EOF, polyglots, PDF JS/attachments/hidden text, EXIF/GPS, Office traces. Evidence only.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['hidden data', 'polyglot', 'zip hinter jpeg', 'exif gps'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-hidden-data',
      parsed,
      async (file) => ({ json: await scanHiddenData(await file.bytes(), file.name, file.mime) }),
      (rows, locale) => hiddenMarkdown(rows as Awaited<ReturnType<typeof scanHiddenData>>[], locale),
      'hidden-data-report',
    );
  },
});
