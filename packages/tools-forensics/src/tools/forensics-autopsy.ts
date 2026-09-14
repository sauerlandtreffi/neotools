import { defineTool } from '@neotools/engine';
import { autopsyBytes, autopsyMarkdown } from '../autopsy/autopsy.js';
import { FORENSICS_LICENSES, forensicsOptions, withBatchReports } from './common.js';

const options = forensicsOptions({});

export const forensicsAutopsy = defineTool({
  id: 'forensics-autopsy',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'File-Autopsy', en: 'File autopsy' },
  description: {
    de: 'Strukturierter Container-Baum: PDF, ZIP/OOXML, JPEG, PNG, MP4, Matroska, MP3, WAV.',
    en: 'Structured container tree: PDF, ZIP/OOXML, JPEG, PNG, MP4, Matroska, MP3, WAV.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['file autopsy', 'pdf objekte', 'mp4 boxes', 'zip einträge'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return withBatchReports(
      ctx,
      files,
      'forensics-autopsy',
      parsed,
      async (file) => ({ json: await autopsyBytes(await file.bytes(), file.name, file.mime) }),
      (rows, locale) => autopsyMarkdown(rows as Awaited<ReturnType<typeof autopsyBytes>>[], locale),
      'autopsy-report',
    );
  },
});
