import type { FormField } from '@neotools/engine';

interface Props {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /** Team-Preset locked option names — rendered read-only with a lock icon. */
  locked?: string[];
}

function LockIcon() {
  return (
    <svg class="ml-1 inline-block align-[-2px]" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V11a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z"
      />
    </svg>
  );
}

const ACRONYMS = new Set(['dpi', 'ocr', 'pdf', 'id', 'url', 'json', 'xml', 'iban', 'crf', 'mb', 'kb', 'ner', 'a']);

/** `targetSizeMb` → "Target size MB", `stripMetadata` → "Strip metadata". */
export function humanizeFieldName(name: string): string {
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) && word.length <= 4 ? word.toUpperCase() : word.toLowerCase()));
  if (!words.length) return name;
  const first = words[0]!;
  words[0] = first === first.toUpperCase() ? first : first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(' ');
}

function isPasswordField(field: FormField): boolean {
  const hint = `${field.description ?? ''} ${field.name}`.toLowerCase();
  return hint.includes('password');
}

function FieldInput({
  field,
  value,
  onChange,
  idPrefix,
  disabled,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const id = `${idPrefix}-${field.name}`;
  if (field.kind === 'boolean') {
    return (
      <input
        id={id}
        class="ml-2 align-middle"
        type="checkbox"
        disabled={disabled}
        checked={Boolean(value ?? field.defaultValue)}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
    );
  }
  if (field.kind === 'enum') {
    return (
      <select
        id={id}
        class="mt-1 w-full rounded border px-2 py-2"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        disabled={disabled}
        value={String(value ?? field.defaultValue ?? field.enumValues?.[0] ?? '')}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        {(field.enumValues ?? []).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'number') {
    return (
      <input
        id={id}
        class="mt-1 w-full rounded border px-2 py-2"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        type="number"
        disabled={disabled}
        value={String(value ?? field.defaultValue ?? '')}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
    );
  }
  if (field.kind === 'object' && field.fields?.length) {
    const obj = (value && typeof value === 'object' && !Array.isArray(value) ? value : (field.defaultValue as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    return (
      <fieldset class="mt-1 grid gap-2 rounded border p-2 sm:col-span-2" style={{ borderColor: 'var(--line)' }}>
        <legend class="label" title={field.name}>{humanizeFieldName(field.name)}</legend>
        {field.fields.map((child) => (
          <label key={child.name} class="block text-sm">
            <span class="label" title={child.name}>
              {humanizeFieldName(child.name)}
            </span>
            <FieldInput
              field={child}
              value={obj[child.name]}
              idPrefix={`${id}`}
              disabled={disabled}
              onChange={(v) => onChange({ ...obj, [child.name]: v })}
            />
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.kind === 'array' && field.itemKind === 'object' && field.fields?.length) {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : Array.isArray(field.defaultValue) ? (field.defaultValue as Record<string, unknown>[]) : [];
    return (
      <div class="mt-1 grid gap-2 sm:col-span-2">
        {rows.map((row, i) => (
          <fieldset key={i} class="grid gap-2 rounded border p-2" style={{ borderColor: 'var(--line)' }}>
            <legend class="mono text-xs">
              {field.name}[{i}]
            </legend>
            {field.fields!.map((child) => (
              <label key={child.name} class="block text-sm">
                <span class="label" title={child.name}>
                  {humanizeFieldName(child.name)}
                </span>
                <FieldInput
                  field={child}
                  value={row[child.name]}
                  idPrefix={`${id}-${i}`}
                  disabled={disabled}
                  onChange={(v) => {
                    const next = rows.map((r, j) => (j === i ? { ...r, [child.name]: v } : r));
                    onChange(next);
                  }}
                />
              </label>
            ))}
            <button type="button" class="stamp text-left" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              −
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          class="stamp"
          onClick={() => {
            const blank: Record<string, unknown> = {};
            for (const child of field.fields ?? []) blank[child.name] = child.defaultValue ?? '';
            onChange([...rows, blank]);
          }}
        >
          + {field.name}
        </button>
      </div>
    );
  }
  if (field.kind === 'array') {
    return (
      <input
        id={id}
        class="mt-1 w-full rounded border px-2 py-2"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        disabled={disabled}
        value={Array.isArray(value) ? (value as unknown[]).join(',') : String(value ?? '')}
        onInput={(e) =>
          onChange(
            (e.target as HTMLInputElement).value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }
  return (
    <input
      id={id}
      class="mt-1 w-full rounded border px-2 py-2"
      style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
      type={isPasswordField(field) ? 'password' : 'text'}
      autocomplete={isPasswordField(field) ? 'off' : undefined}
      disabled={disabled}
      value={String(value ?? field.defaultValue ?? '')}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  );
}

export default function ZodForm({ fields, values, onChange, locked = [] }: Props) {
  const lockedSet = new Set(locked);
  const set = (name: string, value: unknown) => {
    if (lockedSet.has(name)) return;
    onChange({ ...values, [name]: value });
  };
  return (
    <div class="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const isLocked = lockedSet.has(field.name);
        return (
          <label key={field.name} class={field.kind === 'object' || (field.kind === 'array' && field.itemKind === 'object') ? 'block text-sm sm:col-span-2' : 'block text-sm'} htmlFor={`opt-${field.name}`}>
            <span class="label" style={{ color: 'var(--muted)' }} title={field.description ? `${field.name} — ${field.description}` : field.name}>
              {humanizeFieldName(field.name)}
              {isLocked ? <LockIcon /> : null}
            </span>
            <FieldInput
              field={field}
              value={values[field.name]}
              idPrefix="opt"
              disabled={isLocked}
              onChange={(v) => set(field.name, v)}
            />
          </label>
        );
      })}
    </div>
  );
}
