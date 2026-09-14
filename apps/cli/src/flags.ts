import type { Command } from 'commander';
import { kebab, zodObjectFields, type FormField } from '@neotools/engine';

export function addZodOptions(cmd: Command, schema: import('zod').ZodTypeAny): FormField[] {
  const fields = zodObjectFields(schema);
  for (const field of fields) {
    const flag = kebab(field.name);
    if (field.kind === 'boolean') {
      cmd.option(`--${flag}`, field.description ?? field.name);
      cmd.option(`--no-${flag}`);
      continue;
    }
    if (field.kind === 'enum' && field.enumValues?.length) {
      cmd.option(`--${flag} <value>`, `${field.description ?? field.name} (${field.enumValues.join('|')})`);
      continue;
    }
    cmd.option(`--${flag} <value>`, field.description ?? field.name);
  }
  return fields;
}

export function optionsFromFlags(
  fields: FormField[],
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = flags[field.name];
    if (raw === undefined) continue;
    out[field.name] = coerce(field, raw);
  }
  return out;
}

function coerce(field: FormField, raw: unknown): unknown {
  if (field.kind === 'boolean') return Boolean(raw);
  if (field.kind === 'number') return Number(raw);
  if (field.kind === 'array') {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          return JSON.parse(trimmed) as unknown;
        } catch {
          // fall through to comma-separated
        }
      }
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return raw;
}
