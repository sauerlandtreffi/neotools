import { z } from 'zod';
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { loadPdf, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  mode: z.enum(['read', 'fill']).default('read'),
  fillJson: z.string().default(''),
  fillCsv: z.string().default(''),
  flatten: z.boolean().default(false),
});

export interface FormFieldReport {
  name: string;
  type: string;
  value: string | boolean | string[] | null;
  options?: string[];
}

function fieldType(field: unknown): string {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'listbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  return 'other';
}

function readField(field: { getName(): string }): FormFieldReport {
  const name = field.getName();
  const type = fieldType(field);
  if (field instanceof PDFTextField) {
    return { name, type, value: field.getText() ?? '' };
  }
  if (field instanceof PDFCheckBox) {
    return { name, type, value: field.isChecked() };
  }
  if (field instanceof PDFDropdown) {
    return { name, type, value: field.getSelected(), options: field.getOptions() };
  }
  if (field instanceof PDFOptionList) {
    return { name, type, value: field.getSelected(), options: field.getOptions() };
  }
  if (field instanceof PDFRadioGroup) {
    return { name, type, value: field.getSelected() ?? null, options: field.getOptions() };
  }
  return { name, type, value: null };
}

function parseFillMap(json: string, csv: string): Record<string, string> {
  const map: Record<string, string> = {};
  const raw = json.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        if (row && typeof row === 'object' && 'name' in row) {
          const rec = row as { name: string; value?: unknown };
          map[rec.name] = String(rec.value ?? '');
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        map[k] = String(v ?? '');
      }
    }
  }
  const csvRaw = csv.trim();
  if (csvRaw) {
    for (const line of csvRaw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^name\s*,/i.test(trimmed)) continue;
      const comma = trimmed.indexOf(',');
      if (comma < 0) continue;
      map[trimmed.slice(0, comma).trim()] = trimmed.slice(comma + 1).trim();
    }
  }
  return map;
}

function applyValue(field: { getName(): string }, raw: string): void {
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

export const pdfForms = defineTool({
  id: 'pdf-forms',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Formulare', en: 'Forms' },
  description: {
    de: 'Formularfelder lesen (JSON) oder aus JSON/CSV füllen; optional flatten.',
    en: 'Read form fields (JSON) or fill from JSON/CSV; optional flatten.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  presets: [
    { id: 'read', title: { de: 'Nur lesen', en: 'Read only' }, options: { mode: 'read' } },
    { id: 'fill-flat', title: { de: 'Füllen + flatten', en: 'Fill + flatten' }, options: { mode: 'fill', flatten: true } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf formular', 'acroform', 'flatten'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const fill = parsed.mode === 'fill' ? parseFillMap(parsed.fillJson, parsed.fillCsv) : {};
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const form = doc.getForm();
      const fields = form.getFields().map(readField);
      if (parsed.mode === 'read' && !parsed.flatten) {
        const json = neoFileFromBytes(
          `${stem(file.name)}-form.json`,
          new TextEncoder().encode(JSON.stringify({ file: file.name, fields }, null, 2)),
          MIME.json,
        );
        outputs.push(json);
        reports.push({ file: file.name, fields });
        return json;
      }
      if (parsed.mode === 'fill') {
        for (const field of form.getFields()) {
          const value = fill[field.getName()];
          if (value === undefined) continue;
          try {
            applyValue(field, value);
          } catch {
            // skip incompatible value
          }
        }
      }
      if (parsed.flatten) {
        try {
          form.flatten();
        } catch {
          // already flat
        }
      }
      const pdf = await savePdf(doc, `${stem(file.name)}-form.pdf`);
      const after = (() => {
        try {
          return doc.getForm().getFields().map(readField);
        } catch {
          return fields;
        }
      })();
      const json = neoFileFromBytes(
        `${stem(file.name)}-form.json`,
        new TextEncoder().encode(JSON.stringify({ file: file.name, fields: after, filled: Object.keys(fill) }, null, 2)),
        MIME.json,
      );
      outputs.push(pdf, json);
      reports.push({ file: file.name, fields: after });
      return pdf;
    });
    const provenance = await createProvenance('pdf-forms', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
});
