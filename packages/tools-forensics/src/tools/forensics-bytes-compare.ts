import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { compareFiles, compareMarkdown } from '../compare/compare.js';
import { FORENSICS_LICENSES, localeOpt, reportFiles } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  locale: localeOpt,
  maxOffsets: z.number().int().min(1).max(256).default(64),
  blockSize: z.number().int().min(512).max(1_048_576).default(4096),
});

export const forensicsBytesCompare = defineTool({
  id: 'forensics-bytes-compare',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Bytes vergleichen', en: 'Compare bytes' },
  description: {
    de: 'Zwei Dateien exakt vergleichen: erste Differenz, 4-KB-Blöcke, Offset-Liste, Längenunterschied.',
    en: 'Exact compare of two files: first difference, 4 KB blocks, offset list, length delta.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 2, max: 2 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['byte compare', 'binary diff', 'dateien vergleichen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (files.length < 2) {
      return { outputs: [], warnings: ['Zwei Dateien nötig.'], report: { error: 'INPUT_MIN' } };
    }
    ctx.progress(0.3, files[0]!.name);
    const result = await compareFiles(files[0]!, files[1]!, {
      maxOffsets: parsed.maxOffsets,
      blockSize: parsed.blockSize,
    });
    ctx.progress(1, 'done');
    return {
      outputs: reportFiles('bytes-compare', result, compareMarkdown(result, parsed.locale)),
      warnings: [],
      report: attachProvenance({ compare: result }, await createProvenance('forensics-bytes-compare', parsed, files)),
    };
  },
});
