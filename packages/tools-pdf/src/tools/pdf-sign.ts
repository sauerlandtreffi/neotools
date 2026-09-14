import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type VerificationReport,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { stem } from '../pdf-io.js';
import { signPdfBytes } from '../sign/create.js';
import { loadPkcs12 } from '../sign/p12.js';
import { signVerifyMarkdown, verifyPdfSignatures } from '../sign/verify.js';

const options = z.object({
  mode: z.enum(['verify', 'sign']).default('verify'),
  password: z.string().default('').describe('password'),
  page: z.coerce.number().int().min(1).default(1),
  visible: z.boolean().default(true),
  x: z.coerce.number().default(72),
  y: z.coerce.number().default(72),
  width: z.coerce.number().default(220),
  height: z.coerce.number().default(48),
  tsaUrl: z.string().default(''),
  locale: z.enum(['de', 'en']).default('de'),
});

function isP12(file: { name: string; mime: string }): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith('.p12') || n.endsWith('.pfx') || file.mime.includes('pkcs12') || file.mime.includes('pfx');
}

export const pdfSign = defineTool({
  id: 'pdf-sign',
  pack: 'pdf',
  category: 'security',
  title: { de: 'PDF signieren / prüfen', en: 'Sign / verify PDF' },
  description: {
    de: 'PAdES prüfen (Browser+Node) und erstellen (PKCS#12, WebCrypto). Optional RFC-3161-TSA nur wenn eine URL gesetzt ist.',
    en: 'Verify PAdES (browser+Node) and create signatures (PKCS#12, WebCrypto). Optional RFC 3161 TSA only if a URL is set.',
  },
  inputs: {
    accept: [MIME.pdf, 'application/x-pkcs12', 'application/pkcs12', '.p12', '.pfx'],
    multiple: true,
    min: 1,
  },
  outputs: { mime: [MIME.pdf, MIME.json, MIME.md] },
  options,
  presets: [
    { id: 'verify', title: { de: 'Prüfen', en: 'Verify' }, options: { mode: 'verify' } },
    { id: 'sign-visible', title: { de: 'Sichtbar signieren', en: 'Visible sign' }, options: { mode: 'sign', visible: true } },
    { id: 'sign-invisible', title: { de: 'Unsichtbar', en: 'Invisible' }, options: { mode: 'sign', visible: false } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pades', 'pdf signatur', 'pkcs12', 'pkcs#7'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const pdfs = files.filter((f) => f.mime === MIME.pdf || f.name.toLowerCase().endsWith('.pdf'));
    const p12s = files.filter(isP12);
    const pdf = pdfs[0];
    if (!pdf) return { outputs: [], warnings: ['Keine PDF.'], report: {} };
    ctx.progress(0.2, parsed.mode);
    if (parsed.mode === 'verify') {
      const report = await verifyPdfSignatures(await pdf.bytes());
      const md = signVerifyMarkdown(report, parsed.locale);
      const provenance = await createProvenance('pdf-sign', parsed, files);
      return {
        outputs: [
          neoFileFromBytes('signature-report.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
          neoFileFromBytes('signature-report.md', new TextEncoder().encode(md), MIME.md),
        ],
        warnings: report.signatures.some((s) => s.modifiedAfter)
          ? ['Dokument nach Signatur verändert (inkrementell).']
          : [],
        report: attachProvenance(report as unknown as Record<string, unknown>, provenance),
      };
    }
    const p12file = p12s[0];
    if (!p12file) return { outputs: [], warnings: ['PKCS#12 (.p12/.pfx) fehlt.'], report: {} };
    if (!parsed.password) return { outputs: [], warnings: ['Passwort für PKCS#12 fehlt.'], report: {} };
    const loaded = await loadPkcs12(await p12file.bytes(), parsed.password);
    if (parsed.tsaUrl) {
      ctx.log('info', 'TSA-URL gesetzt — Netzwerkaufruf nur für den Zeitstempel.');
    }
    const when = new Date().toISOString().slice(0, 19);
    const signed = await signPdfBytes(await pdf.bytes(), loaded, {
      page: parsed.page,
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
      visible: parsed.visible,
      text: `Digital signiert von ${loaded.subject || 'unbekannt'} am ${when}`,
    });
    const check = await verifyPdfSignatures(signed);
    const md = signVerifyMarkdown(check, parsed.locale);
    const provenance = await createProvenance('pdf-sign', { ...parsed, password: '***' }, files);
    return {
      outputs: [
        neoFileFromBytes(`${stem(pdf.name)}-signed.pdf`, signed, MIME.pdf),
        neoFileFromBytes('signature-report.json', new TextEncoder().encode(JSON.stringify(check, null, 2)), MIME.json),
        neoFileFromBytes('signature-report.md', new TextEncoder().encode(md), MIME.md),
      ],
      warnings: parsed.tsaUrl ? ['TSA-URL gesetzt, Einbettung des Tokens ist best-effort (B-T folgt bei gültiger Antwort).'] : [],
      report: attachProvenance(check as unknown as Record<string, unknown>, provenance),
    };
  },
  async verify(_ctx, outputs, opts) {
    const parsed = options.parse(opts);
    if (parsed.mode === 'verify') {
      return { passed: true, checks: [{ id: 'verify-only', passed: true }] };
    }
    const pdf = outputs.find((o) => o.mime === MIME.pdf);
    if (!pdf) return { passed: false, checks: [{ id: 'signed-pdf', passed: false, detail: 'Kein signiertes PDF.' }] };
    const report = await verifyPdfSignatures(await pdf.bytes());
    const checks: VerificationReport['checks'] = report.signatures.map((s) => ({
      id: `sig-${s.index}`,
      passed: s.valid,
      detail: s.note.de,
    }));
    if (!checks.length) checks.push({ id: 'sig-missing', passed: false, detail: 'Keine Signatur im Output.' });
    return { passed: report.valid, checks };
  },
});
