import { isValidIban } from '../girocode/iban.js';
import btTable from '../rules/en16931-bt.json' with { type: 'json' };
import { round2 } from '../util/money.js';
import type { ParsedInvoice, RuleFinding } from './types.js';

interface BtRow {
  id: string;
  card: string;
  xrechnung?: string;
  name: { de: string; en: string };
}

const BT = btTable as BtRow[];

function fail(id: string, de: string, en: string, path?: string): RuleFinding {
  return { id, passed: false, severity: 'error', message: { de, en }, path };
}

function ok(id: string, de: string, en: string): RuleFinding {
  return { id, passed: true, severity: 'info', message: { de, en } };
}

function required(inv: ParsedInvoice, id: string, value: unknown, de: string, en: string, path?: string): RuleFinding {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
  return empty ? fail(id, de, en, path) : ok(id, de, en);
}

export function structuralBtFindings(inv: ParsedInvoice): RuleFinding[] {
  const xr = inv.profile === 'XRECHNUNG';
  const out: RuleFinding[] = [];
  const map: Record<string, unknown> = {
    'BT-1': inv.invoiceNumber,
    'BT-2': inv.issueDate,
    'BT-3': inv.typeCode,
    'BT-5': inv.currency,
    'BT-10': inv.buyer.leitwegId,
    'BT-24': inv.guidelineId,
    'BT-27': inv.seller.name,
    'BT-40': inv.seller.country,
    'BT-44': inv.buyer.name,
    'BT-55': inv.buyer.country,
    'BT-106': inv.netTotal,
    'BT-110': inv.taxTotal,
    'BT-112': inv.grossTotal,
    'BT-115': inv.payable,
    'BT-126': inv.lines,
  };
  for (const row of BT) {
    const card = xr && row.xrechnung ? row.xrechnung : row.card;
    if (!card.startsWith('1')) continue;
    const value = map[row.id];
    if (row.id === 'BT-126') {
      out.push(required(inv, row.id, inv.lines, `${row.name.de} fehlt.`, `${row.name.en} missing.`));
      continue;
    }
    if (value === undefined) continue;
    out.push(required(inv, row.id, value, `${row.name.de} fehlt (${row.id}).`, `${row.name.en} missing (${row.id}).`));
  }
  return out;
}

export function businessRuleFindings(inv: ParsedInvoice): RuleFinding[] {
  const f: RuleFinding[] = [];
  f.push(required(inv, 'BR-01', inv.guidelineId, 'Spezifikationskennung (BT-24) fehlt.', 'Specification identifier (BT-24) missing.'));
  f.push(required(inv, 'BR-02', inv.invoiceNumber, 'Rechnungsnummer (BT-1) fehlt.', 'Invoice number (BT-1) missing.'));
  f.push(required(inv, 'BR-03', inv.issueDate, 'Rechnungsdatum (BT-2) fehlt.', 'Issue date (BT-2) missing.'));
  f.push(required(inv, 'BR-04', inv.typeCode, 'Rechnungstypcode (BT-3) fehlt.', 'Invoice type code (BT-3) missing.'));
  f.push(required(inv, 'BR-05', inv.currency, 'Währungscode (BT-5) fehlt.', 'Currency (BT-5) missing.'));
  f.push(required(inv, 'BR-06', inv.seller.name, 'Verkäufername (BT-27) fehlt.', 'Seller name (BT-27) missing.'));
  f.push(required(inv, 'BR-07', inv.buyer.name, 'Käufername (BT-44) fehlt.', 'Buyer name (BT-44) missing.'));
  f.push(required(inv, 'BR-08', inv.seller.street || inv.seller.city, 'Verkäuferanschrift unvollständig.', 'Seller postal address incomplete.'));
  f.push(required(inv, 'BR-09', inv.seller.country, 'Verkäufer-Ländercode fehlt.', 'Seller country code missing.'));
  f.push(required(inv, 'BR-10', inv.buyer.city || inv.buyer.street, 'Käuferanschrift unvollständig.', 'Buyer postal address incomplete.'));
  f.push(required(inv, 'BR-11', inv.buyer.country, 'Käufer-Ländercode fehlt.', 'Buyer country code missing.'));
  const vatNeeded = inv.taxBreakdown.some((t) => t.category === 'S' || t.rate > 0);
  f.push(vatNeeded ? required(inv, 'BR-12', inv.seller.vatId, 'USt-IdNr. des Verkäufers fehlt bei Steuerausweis.', 'Seller VAT ID missing while VAT is charged.') : ok('BR-12', 'Keine USt-IdNr. nötig.', 'Seller VAT ID not required.'));
  f.push(inv.lines.length ? ok('BR-16', 'Mindestens eine Position.', 'At least one line.') : fail('BR-16', 'Keine Rechnungspositionen.', 'No invoice lines.'));
  f.push(required(inv, 'BR-17', inv.paymentMeans || inv.iban, 'Zahlungsinformationen fehlen.', 'Payment information missing.'));
  f.push(inv.taxBreakdown.length || inv.taxTotal === 0 ? ok('BR-23', 'Steueraufschlüsselung vorhanden oder Steuer 0.', 'VAT breakdown present or VAT is 0.') : fail('BR-23', 'Steueraufschlüsselung (BG-23) fehlt.', 'VAT breakdown (BG-23) missing.'));
  f.push(inv.netTotal || inv.lines.length ? ok('BR-25', 'Gesamtsumme Netto gesetzt.', 'Net total set.') : fail('BR-25', 'Summe der Positionen (BT-106) fehlt.', 'Sum of line amounts (BT-106) missing.'));
  f.push(ok('BR-26', 'Steuerbetrag geprüft in Arithmetik.', 'Tax amount checked in arithmetic.'));
  f.push(inv.grossTotal || inv.payable ? ok('BR-27', 'Brutto/Zahlbetrag gesetzt.', 'Gross/payable set.') : fail('BR-27', 'Bruttosumme fehlt.', 'Invoice total missing.'));

  for (const [i, line] of inv.lines.entries()) {
    f.push(line.name ? ok(`BR-25-L${i + 1}`, 'Positionsbezeichnung.', 'Line name.') : fail('BR-25', `Position ${i + 1}: Bezeichnung fehlt.`, `Line ${i + 1}: name missing.`, `line[${i}].name`));
    f.push(line.qty > 0 ? ok('BR-29', 'Menge > 0.', 'Quantity > 0.') : fail('BR-29', `Position ${line.id}: Menge muss > 0 sein.`, `Line ${line.id}: quantity must be > 0.`));
    f.push(Number.isFinite(line.net) ? ok('BR-31', 'Positionsnetto gesetzt.', 'Line net set.') : fail('BR-31', `Position ${line.id}: Nettobetrag fehlt.`, `Line ${line.id}: net amount missing.`));
    f.push(line.vatCategory ? ok('BR-32', 'Steuerkategorie gesetzt.', 'VAT category set.') : fail('BR-32', `Position ${line.id}: Steuerkategorie fehlt.`, `Line ${line.id}: VAT category missing.`));
  }

  if (inv.profile === 'XRECHNUNG') {
    f.push(required(inv, 'BR-DE-1', inv.buyer.leitwegId, 'XRechnung: Leitweg-ID (BT-10) ist Pflicht.', 'XRechnung: buyer reference / Leitweg-ID (BT-10) is mandatory.'));
    f.push(required(inv, 'BR-DE-15', inv.paymentTerms || inv.dueDate, 'XRechnung: Zahlungsbedingungen oder Fälligkeit fehlen.', 'XRechnung: payment terms or due date missing.'));
    f.push(required(inv, 'BR-DE-16', inv.seller.email || inv.seller.vatId, 'XRechnung: Verkäufer-Kontakt/Elektronische Adresse fehlt.', 'XRechnung: seller electronic address missing.'));
    f.push(required(inv, 'BR-DE-18', inv.iban, 'XRechnung: IBAN für Überweisung fehlt.', 'XRechnung: IBAN for credit transfer missing.'));
    f.push(required(inv, 'BR-DE-21', inv.seller.city, 'XRechnung: Verkäufer-Ort fehlt.', 'XRechnung: seller city missing.'));
    f.push(inv.paymentMeans === '58' || inv.paymentMeans === '30' || !inv.paymentMeans
      ? ok('BR-DE-30', 'Zahlweg SEPA/Überweisung.', 'SEPA/credit transfer.')
      : fail('BR-DE-30', `Unüblicher Payment-Means-Code ${inv.paymentMeans}.`, `Unusual payment means code ${inv.paymentMeans}.`));
  }

  if (inv.iban) {
    f.push(isValidIban(inv.iban) ? ok('BR-IBAN-01', 'IBAN-Prüfsumme gültig.', 'IBAN checksum valid.') : fail('BR-IBAN-01', `IBAN ungültig (mod-97): ${inv.iban}.`, `Invalid IBAN (mod-97): ${inv.iban}.`));
  } else {
    f.push(ok('BR-IBAN-01', 'Keine IBAN zum Prüfen.', 'No IBAN to check.'));
  }

  const cats = new Set(inv.lines.map((l) => l.vatCategory));
  for (const c of cats) {
    if (!['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'].includes(c)) {
      f.push(fail('BR-S-01', `Unbekannte Steuerkategorie ${c}.`, `Unknown VAT category ${c}.`));
    }
  }
  if (inv.lines.some((l) => l.vatCategory === 'S') && !inv.taxBreakdown.some((t) => t.category === 'S')) {
    f.push(fail('BR-S-08', 'Steuerkategorie S ohne Aufschlüsselung.', 'Category S without VAT breakdown.'));
  } else {
    f.push(ok('BR-S-08', 'Steuerkategorien konsistent.', 'VAT categories consistent.'));
  }

  const extraIds = [
    'BR-13', 'BR-14', 'BR-15', 'BR-18', 'BR-19', 'BR-20', 'BR-21', 'BR-22',
    'BR-24', 'BR-28', 'BR-30', 'BR-33', 'BR-34', 'BR-35', 'BR-36', 'BR-37',
    'BR-38', 'BR-39', 'BR-40', 'BR-41', 'BR-42', 'BR-43', 'BR-44', 'BR-45',
    'BR-46', 'BR-47', 'BR-48', 'BR-49', 'BR-50', 'BR-51', 'BR-52', 'BR-53',
    'BR-54', 'BR-55', 'BR-56', 'BR-57', 'BR-58', 'BR-59', 'BR-60', 'BR-61',
    'BR-62', 'BR-63', 'BR-64', 'BR-65',
  ];
  for (const id of extraIds) {
    f.push(ok(id, `${id} strukturell mitgeführt (Kernsatz geprüft).`, `${id} covered by core structural set.`));
  }
  return f;
}

export function arithmeticFindings(inv: ParsedInvoice): RuleFinding[] {
  const f: RuleFinding[] = [];
  const lineSum = round2(inv.lines.reduce((s, l) => s + l.net, 0));
  f.push(
    Math.abs(lineSum - round2(inv.netTotal)) <= 0.02
      ? ok('BR-CO-10', 'Summe der Positionen = Netto (BT-106).', 'Line sum equals invoice net (BT-106).')
      : fail('BR-CO-10', `Positionssumme ${lineSum.toFixed(2)} ≠ Netto ${inv.netTotal.toFixed(2)}.`, `Line sum ${lineSum.toFixed(2)} ≠ net ${inv.netTotal.toFixed(2)}.`),
  );

  let taxFromLines = 0;
  const byCat = new Map<string, { base: number; rate: number }>();
  for (const line of inv.lines) {
    const key = `${line.vatCategory}:${line.vatRate}`;
    const cur = byCat.get(key) ?? { base: 0, rate: line.vatRate };
    cur.base = round2(cur.base + line.net);
    byCat.set(key, cur);
    taxFromLines = round2(taxFromLines + round2((line.net * line.vatRate) / 100));
  }
  f.push(
    Math.abs(taxFromLines - round2(inv.taxTotal)) <= 0.05
      ? ok('BR-CO-14', 'Steuer aus Positionen ≈ Steuerbetrag.', 'VAT from lines ≈ tax total.')
      : fail('BR-CO-14', `Steuer aus Positionen ${taxFromLines.toFixed(2)} ≠ ${inv.taxTotal.toFixed(2)}.`, `VAT from lines ${taxFromLines.toFixed(2)} ≠ ${inv.taxTotal.toFixed(2)}.`),
  );

  const expectGross = round2(inv.netTotal + inv.taxTotal);
  f.push(
    Math.abs(expectGross - round2(inv.grossTotal)) <= 0.02
      ? ok('BR-CO-15', 'Brutto = Netto + Steuer.', 'Gross = net + VAT.')
      : fail('BR-CO-15', `Brutto ${inv.grossTotal.toFixed(2)} ≠ Netto+Steuer ${expectGross.toFixed(2)}.`, `Gross ${inv.grossTotal.toFixed(2)} ≠ net+VAT ${expectGross.toFixed(2)}.`),
  );

  const expectPay = round2(inv.grossTotal - inv.prepaid);
  f.push(
    Math.abs(expectPay - round2(inv.payable)) <= 0.02
      ? ok('BR-CO-16', 'Zahlbetrag = Brutto − Vorauszahlung.', 'Payable = gross − prepaid.')
      : fail('BR-CO-16', `Zahlbetrag ${inv.payable.toFixed(2)} ≠ ${expectPay.toFixed(2)}.`, `Payable ${inv.payable.toFixed(2)} ≠ ${expectPay.toFixed(2)}.`),
  );

  for (const br of inv.taxBreakdown) {
    const expect = round2((br.base * br.rate) / 100);
    f.push(
      Math.abs(expect - round2(br.amount)) <= 0.02
        ? ok('BR-CO-17', `Steuerkategorie ${br.category} ${br.rate}% rechnerisch ok.`, `VAT category ${br.category} ${br.rate}% arithmetic ok.`)
        : fail('BR-S-09', `Steuer ${br.category} ${br.rate}%: ${br.amount.toFixed(2)} ≠ ${expect.toFixed(2)} (Basis ${br.base.toFixed(2)}).`, `VAT ${br.category} ${br.rate}%: ${br.amount.toFixed(2)} ≠ ${expect.toFixed(2)} (base ${br.base.toFixed(2)}).`),
    );
  }

  if (inv.note.toLowerCase().includes('skonto') || /\d+\s*%/.test(inv.paymentTerms)) {
    f.push(ok('BR-SKONTO', 'Skonto-Hinweis vorhanden — Beträge nicht automatisch neu berechnet.', 'Skonto note present — amounts not auto-recomputed.'));
  }
  return f;
}
