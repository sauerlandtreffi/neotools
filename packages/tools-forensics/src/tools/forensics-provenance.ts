import { z } from 'zod';
import { attachProvenance, defineTool, MIME, neoFileFromBytes } from '@neotools/engine';
import {
  createForensicsProvenance,
  parseProvenanceJson,
  provenanceMarkdown,
  verifyForensicsProvenance,
} from '../provenance/provenance.js';
import { FORENSICS_LICENSES, localeOpt, reportFiles } from './common.js';
import { utf8 } from '../util/bytes.js';

const options = z.object({
  locale: localeOpt,
  mode: z.enum(['create', 'verify']).default('create'),
});

export const forensicsProvenance = defineTool({
  id: 'forensics-provenance',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Provenance-Manifest', en: 'Provenance manifest' },
  description: {
    de: 'Erzeugt oder prüft ein Provenance-JSON (Hashes, Größe, Erkennung, Zeit). Keine Inhalts-PII.',
    en: 'Creates or verifies a provenance JSON (hashes, size, identification, time). No content PII.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  presets: [
    { id: 'create', title: { de: 'Erzeugen', en: 'Create' }, options: { mode: 'create' } },
    { id: 'verify', title: { de: 'Prüfen', en: 'Verify' }, options: { mode: 'verify' } },
  ],
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['provenance', 'herkunft', 'hash manifest'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (parsed.mode === 'verify') {
      const man = files.find((f) => /\.json$/i.test(f.name)) ?? files[0]!;
      const others = files.filter((f) => f !== man);
      ctx.progress(0.3, man.name);
      const manifest = parseProvenanceJson(new TextDecoder().decode(await man.bytes()));
      const verify = await verifyForensicsProvenance(others.length ? others : files.filter((f) => f !== man), manifest);
      const payload = { verify, manifest };
      return {
        outputs: reportFiles('provenance-verify', payload, provenanceMarkdown(parsed.locale, undefined, verify)),
        warnings: verify.ok ? [] : ['Provenance weicht ab.'],
        report: attachProvenance(payload, manifest),
      };
    }
    ctx.progress(0.4, 'create');
    const created = await createForensicsProvenance(files);
    return {
      outputs: [
        neoFileFromBytes('provenance.json', utf8(JSON.stringify(created, null, 2)), MIME.json),
        ...reportFiles('provenance', created, provenanceMarkdown(parsed.locale, created)).filter((f) =>
          f.name.endsWith('.md'),
        ),
      ],
      warnings: [],
      report: attachProvenance({ created }, created),
    };
  },
});
