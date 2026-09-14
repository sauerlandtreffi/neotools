import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
} from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { buildEpcPayload, parseEpcPayload, parseGiroCsv } from '../girocode/epc.js';
import { qrPng, qrSvg } from '../girocode/qr.js';
import { decodeGiroFromImage } from '../girocode/read.js';

const options = z.object({
  mode: z.enum(['create', 'read']).default('create'),
  name: z.string().default(''),
  iban: z.string().default(''),
  bic: z.string().default(''),
  amount: z.string().default(''),
  purpose: z.string().default(''),
  reference: z.string().default(''),
  unstructured: z.string().default(''),
  hint: z.string().default(''),
  format: z.enum(['png', 'svg', 'both']).default('both'),
});

export const dachGirocode = defineTool({
  id: 'dach-girocode',
  pack: 'dach',
  category: 'dach',
  title: { de: 'GiroCode / EPC-QR', en: 'GiroCode / EPC QR' },
  description: {
    de: 'EPC069-12 GiroCode erzeugen (PNG/SVG, Batch-CSV) oder aus Bild lesen (zxing-wasm).',
    en: 'Create EPC069-12 GiroCode (PNG/SVG, CSV batch) or read from an image (zxing-wasm).',
  },
  inputs: {
    accept: [MIME.png, MIME.jpeg, 'image/jpg', 'text/csv', 'text/plain', MIME.pdf],
    multiple: true,
    min: 0,
  },
  outputs: { mime: [MIME.png, 'image/svg+xml', MIME.json] },
  options,
  presets: [
    { id: 'create', title: { de: 'Erzeugen', en: 'Create' }, options: { mode: 'create' } },
    { id: 'read', title: { de: 'Lesen', en: 'Read' }, options: { mode: 'read' } },
  ],
  licenses: DACH_LICENSES,
  seo: { keywords: ['girocode', 'epc-qr', 'sepa'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const warnings: string[] = [];
    const payloads: string[] = [];

    if (parsed.mode === 'read') {
      for (const file of files) {
        ctx.progress(0.4, file.name);
        const decoded = await decodeGiroFromImage(await file.bytes());
        if (!decoded) {
          warnings.push(`${file.name}: kein GiroCode erkannt (zxing-wasm).`);
          continue;
        }
        outputs.push(
          neoFileFromBytes(
            `${file.name}.giro.json`,
            new TextEncoder().encode(JSON.stringify(decoded, null, 2)),
            MIME.json,
          ),
        );
      }
      const provenance = await createProvenance('dach-girocode', parsed, files);
      return { outputs, warnings, report: attachProvenance({ decoded: outputs.length }, provenance) };
    }

    const jobs = [];
    if (parsed.name && parsed.iban) {
      jobs.push({
        name: parsed.name,
        iban: parsed.iban,
        bic: parsed.bic || undefined,
        amount: parsed.amount || undefined,
        purpose: parsed.purpose || undefined,
        reference: parsed.reference || undefined,
        unstructured: parsed.unstructured || undefined,
        hint: parsed.hint || undefined,
      });
    }
    for (const file of files) {
      if (/\.csv$/i.test(file.name) || file.mime === 'text/csv' || file.mime === 'text/plain') {
        jobs.push(...parseGiroCsv(new TextDecoder().decode(await file.bytes())));
      }
    }
    if (!jobs.length) {
      return { outputs: [], warnings: ['Keine SEPA-Felder und keine CSV.'], report: {} };
    }
    const created = [];
    for (let i = 0; i < jobs.length; i++) {
      ctx.progress(i / jobs.length, 'QR');
      const payload = buildEpcPayload(jobs[i]!);
      payloads.push(payload);
      const stem = `girocode-${i + 1}`;
      if (parsed.format === 'png' || parsed.format === 'both') {
        outputs.push(neoFileFromBytes(`${stem}.png`, await qrPng(payload), MIME.png));
      }
      if (parsed.format === 'svg' || parsed.format === 'both') {
        outputs.push(
          neoFileFromBytes(`${stem}.svg`, new TextEncoder().encode(await qrSvg(payload)), 'image/svg+xml'),
        );
      }
      created.push({ payload, fields: jobs[i] });
    }
    outputs.push(
      neoFileFromBytes('girocode.json', new TextEncoder().encode(JSON.stringify({ created }, null, 2)), MIME.json),
    );
    const provenance = await createProvenance('dach-girocode', parsed, files);
    return {
      outputs,
      warnings,
      report: attachProvenance({ count: jobs.length, payloads }, provenance),
    };
  },
});

export { buildEpcPayload, parseEpcPayload };
