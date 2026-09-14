import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { archiveExtract } from './archive-extract.js';

const options = z.object({
  password: z.string().default(''),
  glob: z.string().default('*.txt'),
});

export const archiveExtractSelected = defineTool({
  ...archiveExtract,
  id: 'archive-extract-selected',
  title: { de: 'Einzelne Einträge entpacken', en: 'Extract selected entries' },
  description: {
    de: 'Wie archive-extract, aber mit Glob (Standard *.txt).',
    en: 'Like archive-extract, with a glob (default *.txt).',
  },
  options,
  async run(ctx, files, opts) {
    return archiveExtract.run(ctx, files, options.parse(opts));
  },
});
