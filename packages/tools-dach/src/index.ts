import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { dachBeaErv } from './tools/dach-bea-erv.js';
import { dachHashTimestamp } from './tools/dach-hash-timestamp.js';
import { dachGirocode } from './tools/dach-girocode.js';
import { dachErechnungValidate } from './tools/dach-erechnung-validate.js';
import { dachErechnungGenerate } from './tools/dach-erechnung-generate.js';
import { dachPaperToErechnung } from './tools/dach-paper-to-erechnung.js';
import { dachReceiptSplit } from './tools/dach-receipt-split.js';
import { dachReceiptExport } from './tools/dach-receipt-export.js';
import { dachStatementCamt } from './tools/dach-statement-camt.js';
import { dachGobd } from './tools/dach-gobd.js';
import { dachDeadline } from './tools/dach-deadline.js';
import { dachTeamPresets } from './tools/dach-team-presets.js';

export const dachTools: ToolDefinition[] = [
  dachBeaErv,
  dachHashTimestamp,
  dachGirocode,
  dachErechnungValidate,
  dachErechnungGenerate,
  dachPaperToErechnung,
  dachReceiptSplit,
  dachReceiptExport,
  dachStatementCamt,
  dachGobd,
  dachDeadline,
  dachTeamPresets,
];

export function registerDachTools(registry: Registry): Registry {
  for (const tool of dachTools) registry.register(tool);
  return registry;
}

export function createDachRegistry(): Registry {
  return registerDachTools(new Registry());
}

export {
  dachBeaErv,
  dachHashTimestamp,
  dachGirocode,
  dachErechnungValidate,
  dachErechnungGenerate,
  dachPaperToErechnung,
  dachReceiptSplit,
  dachReceiptExport,
  dachStatementCamt,
  dachGobd,
  dachDeadline,
  dachTeamPresets,
};
export { DACH_LICENSES } from './licenses.js';
export { ervRuleset } from './erv/rules-data.js';
export { checkErvFiles, AUTO_FIX_PIPELINE } from './erv/check.js';
export { buildEpcPayload, parseEpcPayload } from './girocode/epc.js';
export { isValidIban } from './girocode/iban.js';
