import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { money } from '../util/money.js';
import type { ParsedInvoice, ValidationReport } from './types.js';

export function invoiceMarkdown(inv: ParsedInvoice, report?: ValidationReport): string {
  const lines = [
    `# ${inv.invoiceNumber || 'Rechnung'}`,
    '',
    `- Profil: **${inv.profile}** (${inv.syntax})`,
    `- Datum: ${inv.issueDate}`,
    `- Währung: ${inv.currency}`,
    '',
    '## Parteien',
    '',
    `| | Verkäufer | Käufer |`,
    `|---|---|---|`,
    `| Name | ${inv.seller.name} | ${inv.buyer.name} |`,
    `| Adresse | ${inv.seller.street}, ${inv.seller.zip} ${inv.seller.city} | ${inv.buyer.street}, ${inv.buyer.zip} ${inv.buyer.city} |`,
    `| USt-IdNr. | ${inv.seller.vatId} | ${inv.buyer.vatId} |`,
    `| Leitweg-ID | | ${inv.buyer.leitwegId} |`,
    '',
    '## Positionen',
    '',
    '| # | Bezeichnung | Menge | Netto | USt |',
    '|---|---|---:|---:|---:|',
    ...inv.lines.map((l) => `| ${l.id} | ${l.name} | ${l.qty} | ${money(l.net)} | ${l.vatRate}% ${l.vatCategory} |`),
    '',
    `**Netto** ${money(inv.netTotal)} · **Steuer** ${money(inv.taxTotal)} · **Brutto** ${money(inv.grossTotal)} · **Zahlbar** ${money(inv.payable)}`,
    '',
    `IBAN ${inv.iban} · BIC ${inv.bic} · ${inv.paymentTerms}`,
    '',
  ];
  if (report) {
    const bad = [...report.structural, ...report.business, ...report.arithmetic].filter((r) => !r.passed);
    lines.push('## Prüfung', '', report.ok ? '**bestanden**' : `**${bad.length} Befunde**`, '');
    for (const b of bad) lines.push(`- \`${b.id}\`: ${b.message.de}`);
  }
  return lines.join('\n') + '\n';
}

export function invoiceHtml(inv: ParsedInvoice, report?: ValidationReport): string {
  const md = invoiceMarkdown(inv, report);
  const rows = inv.lines
    .map((l) => `<tr><td>${l.id}</td><td>${l.name}</td><td>${l.qty}</td><td>${money(l.net)}</td><td>${l.vatRate}%</td></tr>`)
    .join('');
  const findings = report
    ? [...report.structural, ...report.business, ...report.arithmetic]
        .filter((r) => !r.passed)
        .map((r) => `<li><code>${r.id}</code> ${r.message.de}</li>`)
        .join('')
    : '';
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${inv.invoiceNumber}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;color:#1a2030}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:.4rem;text-align:left}h1{font-size:1.4rem}</style>
</head><body>
<h1>${inv.invoiceNumber || 'Rechnung'} · ${inv.issueDate}</h1>
<p>Profil ${inv.profile} / ${inv.syntax}</p>
<h2>Parteien</h2>
<p><strong>Verkäufer</strong> ${inv.seller.name}, ${inv.seller.street}, ${inv.seller.zip} ${inv.seller.city} (${inv.seller.vatId})</p>
<p><strong>Käufer</strong> ${inv.buyer.name}, ${inv.buyer.street}, ${inv.buyer.zip} ${inv.buyer.city} · Leitweg ${inv.buyer.leitwegId}</p>
<h2>Positionen</h2>
<table><thead><tr><th>#</th><th>Bezeichnung</th><th>Menge</th><th>Netto</th><th>USt</th></tr></thead><tbody>${rows}</tbody></table>
<p>Netto ${money(inv.netTotal)} · Steuer ${money(inv.taxTotal)} · Brutto ${money(inv.grossTotal)} · Zahlbar ${money(inv.payable)}</p>
<p>IBAN ${inv.iban} · ${inv.paymentTerms}</p>
${findings ? `<h2>Prüfung</h2><ul>${findings}</ul>` : ''}
<!-- markdown-source
${md}
-->
</body></html>`;
}

export async function invoiceViewPdf(inv: ParsedInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  let y = 800;
  page.drawText(`Rechnung ${inv.invoiceNumber}`, { x: 48, y, size: 16, font: bold, color: rgb(0.1, 0.15, 0.3) });
  y -= 22;
  page.drawText(`${inv.issueDate}  ${inv.profile}  ${inv.syntax}`, { x: 48, y, size: 10, font });
  y -= 28;
  page.drawText(`Verkäufer: ${inv.seller.name}`, { x: 48, y, size: 10, font });
  y -= 14;
  page.drawText(`Käufer: ${inv.buyer.name}  Leitweg ${inv.buyer.leitwegId}`, { x: 48, y, size: 10, font });
  y -= 22;
  for (const l of inv.lines) {
    page.drawText(`${l.id}  ${l.name.slice(0, 40)}  ${l.qty}  ${money(l.net)}  ${l.vatRate}%`, { x: 48, y, size: 9, font });
    y -= 12;
    if (y < 64) break;
  }
  y -= 16;
  page.drawText(`Netto ${money(inv.netTotal)}  Steuer ${money(inv.taxTotal)}  Brutto ${money(inv.grossTotal)}`, {
    x: 48,
    y,
    size: 11,
    font: bold,
  });
  y -= 16;
  page.drawText(`IBAN ${inv.iban}`, { x: 48, y, size: 9, font });
  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}
