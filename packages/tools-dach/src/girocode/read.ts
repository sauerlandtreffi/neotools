import { parseEpcPayload, type GiroFields } from './epc.js';

export async function decodeGiroFromImage(bytes: Uint8Array): Promise<GiroFields | null> {
  try {
    const { readBarcodes } = await import('zxing-wasm');
    const results = await readBarcodes(bytes);
    const text = results[0]?.text;
    if (!text) return null;
    return parseEpcPayload(text);
  } catch {
    return null;
  }
}
