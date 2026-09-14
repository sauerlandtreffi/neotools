import { defineTool } from '@neotools/engine';
import { assessExtension, assessmentMarkdown } from '../identify/fake-ext.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsFakeExt = defineTool({
  id: 'forensics-fake-ext',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Fake-Extension', en: 'Fake extension' },
  description: {
    de: 'Meldet verdächtige Endungen (z. B. PE als .pdf, HTML als .jpg) mit Schweregrad.',
    en: 'Flags suspicious extensions (e.g. PE as .pdf, HTML as .jpg) with severity.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: {
    keywords: ['fake extension', 'falsche dateiendung', 'pe als pdf'],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-fake-ext',
      parsed,
      async (file) => ({ json: await assessExtension(file) }),
      (rows, locale) => assessmentMarkdown(rows as Awaited<ReturnType<typeof assessExtension>>[], locale),
      'fake-ext-report',
    );
  },
});
