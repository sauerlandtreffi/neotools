import { archiveFormats } from './archive';
import { documentFormats } from './document';
import { imageFormats } from './image';
import { mediaFormats } from './media';
import { formatSchema, type FormatRecord } from './schema';

export const FORMAT_CATALOG: FormatRecord[] = [
  ...imageFormats,
  ...documentFormats,
  ...archiveFormats,
  ...mediaFormats,
];

const byId = new Map<string, FormatRecord>();
for (const format of FORMAT_CATALOG) {
  if (byId.has(format.id)) {
    throw new Error(`Doppelte Format-ID: ${format.id}`);
  }
  byId.set(format.id, formatSchema.parse(format));
}

export function listFormats(): FormatRecord[] {
  return FORMAT_CATALOG;
}

export function getFormat(id: string): FormatRecord | undefined {
  return byId.get(id);
}

export function requireFormat(id: string): FormatRecord {
  const found = getFormat(id);
  if (!found) throw new Error(`Unbekanntes Format: ${id}`);
  return found;
}

export function formatsByFamily(family: FormatRecord['family']): FormatRecord[] {
  return FORMAT_CATALOG.filter((f) => f.family === family);
}

export function validateFormatCatalog(): FormatRecord[] {
  const ids = new Set<string>();
  return FORMAT_CATALOG.map((entry) => {
    const parsed = formatSchema.parse(entry);
    if (ids.has(parsed.id)) throw new Error(`Doppelte Format-ID: ${parsed.id}`);
    ids.add(parsed.id);
    return parsed;
  });
}
