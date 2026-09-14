import { formatSchema, type FormatRecord } from './schema';
import type { z } from 'zod';

type BrowserLevel = FormatRecord['browserSupport']['decode']['chrome'];
type FormatInput = z.input<typeof formatSchema>;

const yes: BrowserLevel = 'yes';
const no: BrowserLevel = 'no';
const partial: BrowserLevel = 'partial';

export const BROWSER = {
  allYes: { chrome: yes, firefox: yes, safari: yes },
  allNo: { chrome: no, firefox: no, safari: no },
  decodeCommon: { chrome: yes, firefox: yes, safari: yes },
  encodeCommon: { chrome: yes, firefox: yes, safari: yes },
  avifDecode: { chrome: yes, firefox: yes, safari: yes },
  avifEncode: { chrome: yes, firefox: partial, safari: partial },
  jxl: { chrome: no, firefox: no, safari: no },
  heicDecode: { chrome: no, firefox: no, safari: yes },
  heicEncode: { chrome: no, firefox: no, safari: partial },
  none: { chrome: no, firefox: no, safari: no },
  desktopOnly: { chrome: partial, firefox: partial, safari: no },
} as const;

export function format(entry: FormatInput): FormatRecord {
  return formatSchema.parse(entry);
}
