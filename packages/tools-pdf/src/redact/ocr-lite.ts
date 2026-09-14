/** Minimal OCR adapter. Prefers `../ocr.js` (Agent B) and otherwise tesseract.js. */

async function dynamicImport(name: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(name)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function ocrPng(png: Uint8Array, langs = 'deu+eng'): Promise<{ text: string; warning?: string }> {
  const local = await dynamicImport('../ocr.js');
  if (local && typeof local['recognize'] === 'function') {
    const text = await (local['recognize'] as (d: Uint8Array, l: string) => Promise<string>)(png, langs);
    return { text };
  }

  const tess = await dynamicImport('tesseract.js');
  if (!tess) {
    return { text: '', warning: 'OCR nicht verfügbar (weder ocr.ts noch tesseract.js).' };
  }
  const recognize = tess['recognize'] as
    | ((img: Uint8Array, langs: string) => Promise<{ data: { text: string } }>)
    | undefined;
  if (!recognize) return { text: '', warning: 'tesseract.js recognize() fehlt.' };
  const result = await recognize(png, langs);
  return { text: result.data.text };
}
