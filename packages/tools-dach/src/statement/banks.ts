import sparkasse from '../rules/banks/sparkasse.json' with { type: 'json' };
import volksbank from '../rules/banks/volksbank.json' with { type: 'json' };
import deutscheBank from '../rules/banks/deutsche-bank.json' with { type: 'json' };
import commerzbank from '../rules/banks/commerzbank.json' with { type: 'json' };
import ing from '../rules/banks/ing.json' with { type: 'json' };
import dkb from '../rules/banks/dkb.json' with { type: 'json' };
import comdirect from '../rules/banks/comdirect.json' with { type: 'json' };
import n26 from '../rules/banks/n26.json' with { type: 'json' };
import postbank from '../rules/banks/postbank.json' with { type: 'json' };

export interface BankRule {
  id: string;
  name: string;
  date: string;
  amount: string;
  skip?: string;
  balance?: string;
  iban?: string;
}

export const BANK_RULES: BankRule[] = [
  sparkasse,
  volksbank,
  deutscheBank,
  commerzbank,
  ing,
  dkb,
  comdirect,
  n26,
  postbank,
] as BankRule[];

export function findBankRule(id: string): BankRule {
  return BANK_RULES.find((b) => b.id === id) ?? BANK_RULES[0]!;
}
