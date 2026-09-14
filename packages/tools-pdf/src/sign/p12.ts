import forge from 'node-forge';
import * as pkijs from 'pkijs';
import { ensurePkiEngine, toArrayBuffer } from './engine.js';

export interface LoadedP12 {
  cert: pkijs.Certificate;
  privateKey: CryptoKey;
  subject: string;
  issuer: string;
}

function bytesToBinary(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return s;
}

function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function cnOf(cert: forge.pki.Certificate): string {
  const field = cert.subject.getField('CN');
  return field && 'value' in field ? String(field.value) : '';
}

export async function loadPkcs12(bytes: Uint8Array, password: string): Promise<LoadedP12> {
  ensurePkiEngine();
  const asn1 = forge.asn1.fromDer(bytesToBinary(bytes));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const oidShrouded = forge.pki.oids.pkcs8ShroudedKeyBag ?? '1.2.840.113549.1.12.10.1.2';
  const oidKey = forge.pki.oids.keyBag ?? '1.2.840.113549.1.12.10.1.1';
  const oidCert = forge.pki.oids.certBag ?? '1.2.840.113549.1.12.10.1.3';
  const keyBags = p12.getBags({ bagType: oidShrouded })[oidShrouded];
  const keyBags2 = p12.getBags({ bagType: oidKey })[oidKey];
  const certBags = p12.getBags({ bagType: oidCert })[oidCert];
  const keyBag = keyBags?.[0] ?? keyBags2?.[0];
  const certBag = certBags?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('PKCS#12 enthält keinen Schlüssel oder kein Zertifikat.');
  const forgeKey = keyBag.key;
  const forgeCert = certBag.cert;
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(forgeKey));
  const pkcs8 = binaryToBytes(forge.asn1.toDer(pkcs8Asn1).getBytes());
  const pkcs8Copy = new Uint8Array(pkcs8.byteLength);
  pkcs8Copy.set(pkcs8);
  const privateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8Copy,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const certDer = binaryToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(forgeCert)).getBytes());
  const cert = pkijs.Certificate.fromBER(toArrayBuffer(certDer));
  return {
    cert,
    privateKey,
    subject: cnOf(forgeCert),
    issuer: (() => {
      const f = forgeCert.issuer.getField('CN');
      return f && 'value' in f ? String(f.value) : '';
    })(),
  };
}

export async function makeSelfSignedP12(password: string): Promise<{ p12: Uint8Array; subject: string }> {
  ensurePkiEngine();
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
  const attrs = [{ name: 'commonName', value: 'NeoTools Test' }, { name: 'countryName', value: 'DE' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
    generateLocalKeyId: true,
    friendlyName: 'neotools-test',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return { p12: binaryToBytes(der), subject: 'NeoTools Test' };
}
