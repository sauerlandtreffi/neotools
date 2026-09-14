import QRCode from 'qrcode';

export async function qrPng(payload: string): Promise<Uint8Array> {
  const url = await QRCode.toDataURL(payload, { type: 'image/png', errorCorrectionLevel: 'M', margin: 2, width: 320 });
  const b64 = url.split(',')[1] ?? '';
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}
