import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { pdfPageTexts, isPdfName } from '../pdf/text.js';
import { extractDates, resolveHits, toIcs } from '../deadline/extract.js';
import { toCsv } from '../util/csv.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  land: z.enum(['DE', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']).default('DE'),
  alarmHours: z.coerce.number().int().min(0).max(168).default(24),
});

export const dachDeadline = defineTool({
  id: 'dach-deadline',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Fristen / Daten → ICS', en: 'Deadlines / dates → ICS' },
  description: {
    de: 'Datumsangaben und relative Fristen (§§ 187–193 BGB, Feiertage) aus Schriftstücken, ICS/CSV/Markdown mit Fundstellen.',
    en: 'Dates and relative deadlines (§§ 187–193 BGB, holidays) from documents, ICS/CSV/Markdown with citations.',
  },
  inputs: { accept: [MIME.pdf, MIME.txt], multiple: true, min: 1 },
  outputs: { mime: [MIME.ics, MIME.csv, MIME.md, MIME.json] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['frist', 'bgb', 'ics'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const pages: string[] = [];
    for (const file of files) {
      ctx.progress(0.3, file.name);
      if (isPdfName(file.name, file.mime)) pages.push(...(await pdfPageTexts(await file.bytes())));
      else pages.push(new TextDecoder().decode(await file.bytes()));
    }
    const hits = resolveHits(extractDates(pages), parsed.land);
    const md = [
      '# Fristen',
      '',
      ...hits.map((h) => `- S. ${h.page} · ${h.kind} · ${h.iso ?? ''} → ${h.deadline ?? ''} — „${h.quote}“`),
      '',
    ].join('\n');
    const csv = toCsv(
      ['page', 'kind', 'iso', 'deadline', 'quote'],
      hits.map((h) => ({ page: h.page, kind: h.kind, iso: h.iso ?? '', deadline: h.deadline ?? '', quote: h.quote })),
    );
    return {
      outputs: [
        neoFileFromBytes('fristen.ics', utf8(toIcs(hits, parsed.alarmHours)), MIME.ics),
        neoFileFromBytes('fristen.csv', utf8(csv), MIME.csv),
        neoFileFromBytes('fristen.md', utf8(md), MIME.md),
        neoFileFromBytes('fristen.json', utf8(JSON.stringify(hits, null, 2)), MIME.json),
      ],
      warnings: [],
      report: attachProvenance({ hits: hits.length }, await createProvenance('dach-deadline', parsed, files)),
    };
  },
});
