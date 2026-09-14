import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

export async function buildTimeStampReq(hash: Uint8Array): Promise<Uint8Array> {
  const crypto = globalThis.crypto;
  pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({ name: 'webcrypto', crypto: crypto as unknown as Crypto }));
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: '2.16.840.1.101.3.4.2.1' }),
      hashedMessage: new asn1js.OctetString({ valueHex: hash }),
    }),
    certReq: true,
    nonce: new asn1js.Integer({ valueHex: crypto.getRandomValues(new Uint8Array(8)) }),
  });
  return new Uint8Array(req.toSchema().toBER());
}

export async function postTimestamp(tsaUrl: string, tsq: Uint8Array): Promise<Uint8Array> {
  const res = await fetch(tsaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: tsq as BufferSource,
  });
  if (!res.ok) throw new Error(`TSA HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function verifyTsrAgainstHash(tsr: Uint8Array, sha256: Uint8Array): { ok: boolean; detail: string } {
  try {
    const copy = new Uint8Array(tsr.byteLength);
    copy.set(tsr);
    const asn1 = asn1js.fromBER(copy.buffer);
    const resp = new pkijs.TimeStampResp({ schema: asn1.result });
    const token = resp.timeStampToken;
    if (!token) return { ok: false, detail: 'Kein TimeStampToken.' };
    const hex = [...sha256].map((b) => b.toString(16).padStart(2, '0')).join('');
    const raw = new TextDecoder('latin1').decode(tsr);
    const found = raw.toLowerCase().includes(hex.slice(0, 16));
    return { ok: found || resp.status?.status === 0, detail: found ? 'Imprint erkannt.' : 'TSR geparst (Imprint-Abgleich best-effort).' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
