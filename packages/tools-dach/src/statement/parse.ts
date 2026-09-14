import { parseAmount, round2 } from '../util/money.js';
import { findBankRule, type BankRule } from './banks.js';

export interface StatementEntry {
  date: string;
  valuta: string;
  text: string;
  amount: number;
}

export interface StatementParse {
  bank: string;
  iban: string;
  startBalance?: number;
  endBalance?: number;
  entries: StatementEntry[];
  sum: number;
  balanceOk: boolean | null;
}

function clusterLines(text: string): string[] {
  return text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function parseStatement(text: string, bankId: string): StatementParse {
  const rule: BankRule = findBankRule(bankId);
  const dateRe = new RegExp(rule.date, 'g');
  const amtRe = new RegExp(rule.amount, 'g');
  const skip = rule.skip ? new RegExp(rule.skip, 'i') : null;
  const entries: StatementEntry[] = [];
  for (const line of clusterLines(text)) {
    if (skip?.test(line)) continue;
    const dates = [...line.matchAll(new RegExp(rule.date, 'g'))].map((m) => m[1]!);
    const amounts = [...line.matchAll(new RegExp(rule.amount, 'g'))].map((m) => parseAmount(m[1] ?? m[0]!));
    if (!dates.length || !amounts.length) continue;
    const amount = amounts[amounts.length - 1]!;
    if (!amount) continue;
    const date = dates[0]!;
    const valuta = dates[1] ?? date;
    const textPart = line
      .replace(dateRe, '')
      .replace(amtRe, '')
      .replace(/\s+/g, ' ')
      .trim();
    entries.push({ date, valuta, text: textPart.slice(0, 140), amount });
  }
  const balRe = rule.balance ? new RegExp(rule.balance, 'gi') : null;
  const bals: number[] = [];
  if (balRe) {
    for (const m of text.matchAll(balRe)) bals.push(parseAmount(m[1] ?? ''));
  }
  const startBalance = bals[0];
  const endBalance = bals.length > 1 ? bals[bals.length - 1] : bals[0];
  const sum = round2(entries.reduce((s, e) => s + e.amount, 0));
  let balanceOk: boolean | null = null;
  if (startBalance !== undefined && endBalance !== undefined) {
    balanceOk = Math.abs(round2(startBalance + sum) - endBalance) <= 0.05;
  }
  const iban = /([A-Z]{2}\d{2}[A-Z0-9]{10,30})/.exec(text)?.[1] ?? '';
  return { bank: rule.name, iban, startBalance, endBalance, entries, sum, balanceOk };
}
