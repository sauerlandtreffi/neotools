import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFString,
  degrees,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';

export interface FormValue {
  name: string;
  value: string;
}

export interface PersistAnnot {
  kind: 'highlight' | 'freetext' | 'square';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

function addAnnotRef(page: PDFPage, ref: PDFRef): void {
  const key = PDFName.of('Annots');
  const existing = page.node.lookup(key);
  if (existing instanceof PDFArray) {
    existing.push(ref);
    return;
  }
  page.node.set(key, page.doc.context.obj([ref]));
}

function addAnnotation(page: PDFPage, annot: PersistAnnot): void {
  const { x, y, width, height } = annot;
  const context = page.doc.context;
  const rect = [x, y, x + width, y + height];
  const contents = PDFString.of(annot.text ?? '');

  if (annot.kind === 'highlight') {
    const dict = context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: rect,
      QuadPoints: [x, y + height, x + width, y + height, x, y, x + width, y],
      C: [1, 0.92, 0.2],
      CA: 0.45,
      T: 'NeoTools',
      Contents: contents,
      P: page.ref,
    });
    addAnnotRef(page, context.register(dict));
    return;
  }

  if (annot.kind === 'freetext') {
    const dict = context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      Rect: rect,
      Contents: contents,
      DA: PDFString.of('0 0 0 rg /Helv 12 Tf'),
      C: [0.12, 0.56, 0.45],
      T: 'NeoTools',
      P: page.ref,
    });
    addAnnotRef(page, context.register(dict));
    return;
  }

  const dict = context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: rect,
    C: [0.77, 0.36, 0.15],
    Contents: contents,
    T: 'NeoTools',
    P: page.ref,
    BS: { W: 1.5, S: 'S' },
  });
  addAnnotRef(page, context.register(dict));
}

function applyFormValues(doc: PDFDocument, values: readonly FormValue[]): void {
  if (!values.length) return;
  let form;
  try {
    form = doc.getForm();
  } catch {
    return;
  }
  for (const item of values) {
    try {
      const field = form.getField(item.name);
      if ('setText' in field && typeof field.setText === 'function') {
        (field as { setText: (value: string) => void }).setText(item.value);
        continue;
      }
      if ('check' in field && 'uncheck' in field) {
        const box = field as { check: () => void; uncheck: () => void };
        const on = item.value === 'true' || item.value === 'Yes' || item.value === '1' || item.value === 'On';
        if (on) box.check();
        else box.uncheck();
        continue;
      }
      if ('select' in field && typeof field.select === 'function' && item.value) {
        (field as { select: (value: string) => void }).select(item.value);
      }
    } catch {
      // missing or incompatible field
    }
  }
}

export async function persistPdfEdits(
  bytes: Uint8Array,
  opts: {
    formValues: readonly FormValue[];
    annotations: readonly PersistAnnot[];
    pageRotations?: Readonly<Record<number, number>>;
  },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  applyFormValues(doc, opts.formValues);
  for (const annot of opts.annotations) {
    if (annot.pageIndex < 0 || annot.pageIndex >= doc.getPageCount()) continue;
    addAnnotation(doc.getPage(annot.pageIndex), annot);
  }
  if (opts.pageRotations) {
    for (const [key, extra] of Object.entries(opts.pageRotations)) {
      const index = Number(key);
      if (!extra || Number.isNaN(index) || index < 0 || index >= doc.getPageCount()) continue;
      const page = doc.getPage(index);
      const current = page.getRotation().angle;
      page.setRotation(degrees((((current + extra) % 360) + 360) % 360));
    }
  }
  const saved = await doc.save({ updateFieldAppearances: true });
  return saved;
}

export async function downloadOrSavePicker(name: string, bytes: Uint8Array, mime: string): Promise<void> {
  const w = typeof window !== 'undefined' ? window : undefined;
  if (w && 'showSaveFilePicker' in w && typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await writable.write(copy);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
