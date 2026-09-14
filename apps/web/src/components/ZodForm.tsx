import type { FormField } from '@neotools/engine';

interface Props {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

/** Zod `.describe('password')` or a field name containing "password". */
function isPasswordField(field: FormField): boolean {
  const hint = `${field.description ?? ''} ${field.name}`.toLowerCase();
  return hint.includes('password');
}

export default function ZodForm({ fields, values, onChange }: Props) {
  const set = (name: string, value: unknown) => onChange({ ...values, [name]: value });

  return (
    <div class="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <label key={field.name} class="block text-sm">
          <span class="mono text-xs" style={{ color: 'var(--muted)' }}>
            {field.name}
          </span>
          {field.kind === 'boolean' ? (
            <input
              class="ml-2 align-middle"
              type="checkbox"
              checked={Boolean(values[field.name] ?? field.defaultValue)}
              onChange={(e) => set(field.name, (e.target as HTMLInputElement).checked)}
            />
          ) : field.kind === 'enum' ? (
            <select
              class="mt-1 w-full rounded border px-2 py-2"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
              value={String(values[field.name] ?? field.defaultValue ?? field.enumValues?.[0] ?? '')}
              onChange={(e) => set(field.name, (e.target as HTMLSelectElement).value)}
            >
              {(field.enumValues ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : field.kind === 'number' ? (
            <input
              class="mt-1 w-full rounded border px-2 py-2"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
              type="number"
              value={String(values[field.name] ?? field.defaultValue ?? '')}
              onInput={(e) => set(field.name, Number((e.target as HTMLInputElement).value))}
            />
          ) : field.kind === 'array' ? (
            <input
              class="mt-1 w-full rounded border px-2 py-2"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
              value={
                Array.isArray(values[field.name])
                  ? (values[field.name] as unknown[]).join(',')
                  : String(values[field.name] ?? '')
              }
              onInput={(e) =>
                set(
                  field.name,
                  (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          ) : (
            <input
              class="mt-1 w-full rounded border px-2 py-2"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
              type={isPasswordField(field) ? 'password' : 'text'}
              autocomplete={isPasswordField(field) ? 'off' : undefined}
              value={String(values[field.name] ?? field.defaultValue ?? '')}
              onInput={(e) => set(field.name, (e.target as HTMLInputElement).value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}
