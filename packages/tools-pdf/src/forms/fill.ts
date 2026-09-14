import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFDocument,
} from 'pdf-lib';

export function applyFormValue(field: { getName(): string }, raw: string): void {
  if (field instanceof PDFTextField) {
    field.setText(raw);
    return;
  }
  if (field instanceof PDFCheckBox) {
    const on = /^(1|true|yes|ja|on|x)$/i.test(raw);
    if (on) field.check();
    else field.uncheck();
    return;
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    const values = raw.split('|').map((s) => s.trim()).filter(Boolean);
    if (!values.length) return;
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      field.select(values.length === 1 ? values[0]! : values);
      return;
    }
    if (field instanceof PDFRadioGroup) field.select(values[0]!);
  }
}

export function fillAcroForm(
  doc: PDFDocument,
  row: Record<string, string>,
  mapping: Record<string, string>,
): string[] {
  const form = doc.getForm();
  const filled: string[] = [];
  for (const field of form.getFields()) {
    const name = field.getName();
    const key = mapping[name] ?? name;
    const value = row[key];
    if (value === undefined) continue;
    try {
      applyFormValue(field, value);
      filled.push(name);
    } catch {
      // skip incompatible
    }
  }
  return filled;
}

export function parseMapping(json: string): Record<string, string> {
  if (!json.trim()) return {};
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) out[k] = String(v);
  return out;
}
