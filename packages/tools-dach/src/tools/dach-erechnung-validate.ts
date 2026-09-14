import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { validateInvoiceXml, loadInvoiceXml } from '../erechnung/validate.js';
import { invoiceHtml, invoiceMarkdown, invoiceViewPdf } from '../erechnung/view.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  locale: z.enum(['de', 'en']).default('de'),
});

export const dachErechnungValidate = defineTool({
  id: 'dach-erechnung-validate',
  pack: 'dach',
  category: 'dach',
  title: { de: 'E-Rechnung prüfen & anzeigen', en: 'Validate & view e-invoice' },
  description: {
    de: 'XRechnung/ZUGFeRD/Factur-X prüfen (Wohlgeformtheit, Profil, EN-16931-BT, ~60 BR-Regeln, Arithmetik) und als HTML/PDF/Markdown anzeigen.',
    en: 'Validate XRechnung/ZUGFeRD/Factur-X (well-formed, profile, EN 16931 BT, ~60 BR rules, arithmetic) and render HTML/PDF/Markdown.',
  },
  inputs: { accept: [MIME.xml, 'text/xml', MIME.pdf, MIME.json], multiple: true, min: 1 },
  outputs: { mime: [MIME.json, MIME.md, MIME.html, MIME.pdf] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['xrechnung', 'zugferd', 'factur-x', 'e-rechnung'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const warnings: string[] = [];
    const reports = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / files.length, file.name);
      const bytes = await file.bytes();
      const loaded = await loadInvoiceXml(bytes, file.name);
      if (loaded.warning) warnings.push(`${file.name}: ${loaded.warning}`);
      if (!loaded.xml) continue;
      const report = await validateInvoiceXml(loaded.xml, file.name);
      reports.push(report);
      const stem = file.name.replace(/\.[^.]+$/, '') || 'invoice';
      outputs.push(neoFileFromBytes(`${stem}-report.json`, utf8(JSON.stringify(report, null, 2)), MIME.json));
      outputs.push(neoFileFromBytes(`${stem}.md`, utf8(invoiceMarkdown(report.invoice, report)), MIME.md));
      outputs.push(neoFileFromBytes(`${stem}.html`, utf8(invoiceHtml(report.invoice, report)), MIME.html));
      outputs.push(neoFileFromBytes(`${stem}-view.pdf`, await invoiceViewPdf(report.invoice), MIME.pdf));
    }
    void parsed;
    return {
      outputs,
      warnings,
      report: attachProvenance(
        { files: reports.map((r) => ({ ok: r.ok, profile: r.profile, syntax: r.syntax, guidelineId: r.guidelineId })) },
        await createProvenance('dach-erechnung-validate', parsed, files),
      ),
    };
  },
});
