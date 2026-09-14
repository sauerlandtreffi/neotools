import { XMLParser } from 'fast-xml-parser';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parseXml(xml: string): unknown {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: false,
    ignoreDeclaration: true,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  return parser.parse(xml);
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  const rec = node as Record<string, unknown>;
  if (typeof rec['#text'] === 'string') return rec['#text'];
  if (typeof rec['#text'] === 'number') return String(rec['#text']);
  let out = '';
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith('@_')) continue;
    out += textOf(v);
  }
  return out;
}

export function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const rec = node as Record<string, unknown>;
  const direct = rec[`@_${name}`];
  if (typeof direct === 'string') return direct;
  const stripped = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  const alt = rec[`@_${stripped}`];
  return typeof alt === 'string' ? alt : undefined;
}
