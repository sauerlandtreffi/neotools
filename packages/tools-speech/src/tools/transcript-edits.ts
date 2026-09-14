import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { buildCutlist, writeEdl, writeFcpxml, writeMarkerCsv } from '../transcript/edits.js';
import { SPEECH_LICENSES, TRANSCRIPT_ACCEPT } from '../licenses.js';
import { loadTranscript, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  languages: z.enum(['de', 'en', 'both']).default('both'),
  extraFillers: z.string().default(''),
  pauseSec: z.coerce.number().min(0.3).max(10).default(1.6),
});

export const transcriptEdits = defineTool({
  id: 'transcript-edits',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Schnittliste aus Transkript', en: 'Cutlist from transcript' },
  description: {
    de: 'Füllwörter, Pausen, Wiederholungen → EDL/CSV/JSON-Cutlist, Premiere/Resolve-Marker, FCPXML-light. Schnitt später über video-cutlist.',
    en: 'Fillers, pauses, repeats → EDL/CSV/JSON cutlist, Premiere/Resolve markers, FCPXML-light. Cutting later via video-cutlist.',
  },
  inputs: { accept: TRANSCRIPT_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/json', 'text/csv', 'text/plain', 'application/xml'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['füllwörter', 'jump cut', 'edl', 'cutlist'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) throw new Error('Kein Transkript.');
    ctx.progress(0.2, file.name);
    const t = await loadTranscript(file);
    const langs = parsed.languages === 'both' ? (['de', 'en'] as const) : ([parsed.languages] as Array<'de' | 'en'>);
    const extra = parsed.extraFillers
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cut = buildCutlist(t, { languages: [...langs], extra, pauseSec: parsed.pauseSec });
    const base = stem(file.name);
    return {
      outputs: [
        textFile(`${base}-cutlist.json`, `${JSON.stringify(cut, null, 2)}\n`, 'application/json'),
        textFile(`${base}-markers.csv`, writeMarkerCsv(cut.remove), 'text/csv'),
        textFile(`${base}.edl`, writeEdl(cut), 'text/plain'),
        textFile(`${base}.fcpxml`, writeFcpxml(cut, base), 'application/xml'),
      ],
      warnings: [],
      report: await provenanceReport('transcript-edits', parsed, files, {
        cut,
        videoCutlist: 'Media-Pack video-cutlist konsumiert { keep: [[start,end],…] }',
      }),
    };
  },
});
