import { z } from 'zod';

export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'unknown';

export interface FormField {
  name: string;
  kind: FieldKind;
  optional: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  description?: string;
  /** Nested object fields or array-of-object item shape. */
  fields?: FormField[];
  itemKind?: FieldKind;
}

function unwrap(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
} {
  let inner = schema;
  let optional = false;
  let defaultValue: unknown;
  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      optional = true;
      inner = inner.unwrap();
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      defaultValue = inner._def.defaultValue();
      inner = inner._def.innerType;
      continue;
    }
    if (inner instanceof z.ZodEffects) {
      inner = inner._def.schema;
      continue;
    }
    break;
  }
  return { inner, optional, defaultValue };
}

function kindOf(schema: z.ZodTypeAny): { kind: FieldKind; enumValues?: string[] } {
  if (schema instanceof z.ZodString) return { kind: 'string' };
  if (schema instanceof z.ZodNumber) return { kind: 'number' };
  if (schema instanceof z.ZodBoolean) return { kind: 'boolean' };
  if (schema instanceof z.ZodEnum) return { kind: 'enum', enumValues: [...schema.options] };
  if (schema instanceof z.ZodNativeEnum) {
    return { kind: 'enum', enumValues: Object.values(schema.enum).map(String) };
  }
  if (schema instanceof z.ZodObject) return { kind: 'object' };
  if (schema instanceof z.ZodArray) return { kind: 'array' };
  if (schema instanceof z.ZodLiteral) {
    return { kind: 'enum', enumValues: [String(schema.value)] };
  }
  if (schema instanceof z.ZodUnion) {
    const literals = schema.options
      .filter((o: z.ZodTypeAny) => o instanceof z.ZodLiteral)
      .map((o: z.ZodLiteral<any>) => String(o.value));
    if (literals.length === schema.options.length && literals.length) {
      return { kind: 'enum', enumValues: literals };
    }
  }
  return { kind: 'unknown' };
}

function describeField(name: string, field: z.ZodTypeAny): FormField {
  const u = unwrap(field);
  const k = kindOf(u.inner);
  const out: FormField = {
    name,
    kind: k.kind,
    optional: u.optional,
    defaultValue: u.defaultValue,
    enumValues: k.enumValues,
    description: field.description ?? u.inner.description,
  };
  if (u.inner instanceof z.ZodObject) {
    out.fields = zodObjectFields(u.inner);
  }
  if (u.inner instanceof z.ZodArray) {
    const item = unwrap(u.inner.element as z.ZodTypeAny);
    const itemKind = kindOf(item.inner);
    out.itemKind = itemKind.kind;
    if (item.inner instanceof z.ZodObject) {
      out.fields = zodObjectFields(item.inner);
    }
  }
  return out;
}

export function zodObjectFields(schema: z.ZodTypeAny): FormField[] {
  const { inner } = unwrap(schema);
  if (!(inner instanceof z.ZodObject)) return [];
  return Object.entries(inner.shape).map(([name, value]) => describeField(name, value as z.ZodTypeAny));
}

export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
