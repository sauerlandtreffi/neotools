import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { dachBeaErv } from './tools/dach-bea-erv.js';
import { dachHashTimestamp } from './tools/dach-hash-timestamp.js';
import { dachGirocode } from './tools/dach-girocode.js';

export const dachTools: ToolDefinition[] = [dachBeaErv, dachHashTimestamp, dachGirocode];

export function registerDachTools(registry: Registry): Registry {
  for (const tool of dachTools) registry.register(tool);
  return registry;
}

export function createDachRegistry(): Registry {
  return registerDachTools(new Registry());
}

export { dachBeaErv, dachHashTimestamp, dachGirocode };
export { DACH_LICENSES } from './licenses.js';
export { ervRuleset } from './erv/rules-data.js';
export { checkErvFiles, AUTO_FIX_PIPELINE } from './erv/check.js';
export { buildEpcPayload, parseEpcPayload } from './girocode/epc.js';
export { isValidIban } from './girocode/iban.js';
