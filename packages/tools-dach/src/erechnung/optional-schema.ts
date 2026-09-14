/** Optional XSD / Schematron — only if fetch-schemas.mjs populated assets and libs are installed. */

export interface OptionalLayer {
  ran: boolean;
  ok?: boolean;
  detail: string;
  fired: number;
}

async function schemaDir(): Promise<string | undefined> {
  if (typeof process === 'undefined') return undefined;
  const { access } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const candidates = [
    process.env.NEOTOOLS_EINVOICE_SCHEMAS,
    join(process.cwd(), 'packages/tools-dach/assets/schemas'),
    join(process.cwd(), 'assets/schemas'),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    try {
      await access(dir);
      return dir;
    } catch {
      // next
    }
  }
  return undefined;
}

export async function tryXsd(_xml: string, _syntax: 'cii' | 'ubl' | 'unknown'): Promise<OptionalLayer> {
  const dir = await schemaDir();
  if (!dir) {
    return {
      ran: false,
      detail: 'XSD nicht ausgeführt: Schemata fehlen (scripts/fetch-schemas.mjs). Fallback: EN-16931-BT-Tabelle + BR-TypeScript.',
      fired: 0,
    };
  }
  return {
    ran: false,
    detail: 'libxml2-wasm ist optional (MIT) und nicht gebündelt. UN/CEFACT-CII-XSD-Kette zu groß für den Default-Pfad — strukturelle BT-Prüfung statt XSD (kein falsch-grün).',
    fired: 0,
  };
}

export async function trySchematron(_xml: string): Promise<OptionalLayer> {
  const dir = await schemaDir();
  if (!dir) {
    return {
      ran: false,
      detail: 'Schematron nicht ausgeführt: KoSIT/CEN-XSL fehlen (fetch-schemas.mjs). Fallback: ~60 BR-Regeln in TypeScript (MPL/Apache-Quellen nicht gebündelt).',
      fired: 0,
    };
  }
  return {
    ran: false,
    detail: 'SaxonJS (MPL-2.0) ist optional und nicht gebündelt. Default nutzt TypeScript-BR (BR-01…BR-65, BR-CO-*, BR-DE-*).',
    fired: 0,
  };
}
