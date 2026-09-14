import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { ensurePkiEngine, toArrayBuffer } from './engine.js';

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_TST = '1.2.840.113549.1.9.16.2.14';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

export async function createPadesCms(
  data: Uint8Array,
  cert: pkijs.Certificate,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  ensurePkiEngine();
  const messageDigest = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  const certHash = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(new Uint8Array(cert.toSchema().toBER())));
  const essCert = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: OID_SHA256 })],
      }),
      new asn1js.OctetString({ valueHex: certHash }),
    ],
  });
  const ess = new asn1js.Sequence({
    value: [new asn1js.Sequence({ value: [essCert] })],
  });
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
    }),
    digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({
      type: 0,
      attributes: [
        new pkijs.Attribute({
          type: OID_CONTENT_TYPE,
          values: [new asn1js.ObjectIdentifier({ value: OID_DATA })],
        }),
        new pkijs.Attribute({
          type: OID_MESSAGE_DIGEST,
          values: [new asn1js.OctetString({ valueHex: messageDigest })],
        }),
        new pkijs.Attribute({
          type: OID_SIGNING_TIME,
          values: [new asn1js.UTCTime({ valueDate: new Date() })],
        }),
        new pkijs.Attribute({
          type: OID_SIGNING_CERT_V2,
          values: [ess],
        }),
      ],
    }),
  });
  const signed = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_DATA,
    }),
    signerInfos: [signerInfo],
    certificates: [cert],
  });
  await signed.sign(privateKey, 0, 'SHA-256', toArrayBuffer(data));
  const ci = new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signed.toSchema(true),
  });
  return new Uint8Array(ci.toSchema().toBER());
}

export interface CmsVerifyResult {
  valid: boolean;
  reason?: string;
  hashAlgorithm?: string;
  signingTime?: string;
  subject?: string;
  issuer?: string;
  notBefore?: string;
  notAfter?: string;
  keyUsage?: string[];
  hasTimestamp: boolean;
  timestampValid?: boolean;
  hasSigningCertV2: boolean;
}

function rdnString(name: pkijs.RelativeDistinguishedNames): string {
  try {
    return name.typesAndValues
      .map((tv) => {
        const v = 'valueBlock' in tv.value && 'value' in tv.value.valueBlock ? String((tv.value.valueBlock as { value?: string }).value ?? '') : '';
        return v;
      })
      .filter(Boolean)
      .join(', ');
  } catch {
    return '';
  }
}

export async function verifyCmsDetached(cms: Uint8Array, data: Uint8Array): Promise<CmsVerifyResult> {
  ensurePkiEngine();
  let ci: pkijs.ContentInfo;
  try {
    ci = pkijs.ContentInfo.fromBER(toArrayBuffer(cms));
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : String(err), hasTimestamp: false, hasSigningCertV2: false };
  }
  if (ci.contentType !== pkijs.ContentInfo.SIGNED_DATA) {
    return { valid: false, reason: 'Kein SignedData.', hasTimestamp: false, hasSigningCertV2: false };
  }
  const signed = new pkijs.SignedData({ schema: ci.content });
  const signer = signed.signerInfos[0];
  const certs = (signed.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  const cert = certs[0];
  let valid = false;
  let reason: string | undefined;
  try {
    valid = await signed.verify({ signer: 0, data: toArrayBuffer(data), checkChain: false });
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
    valid = false;
  }
  const attrs = signer?.signedAttrs?.attributes ?? [];
  const unsigned = signer?.unsignedAttrs?.attributes ?? [];
  const hasSigningCertV2 = attrs.some((a) => a.type === OID_SIGNING_CERT_V2);
  const tst = unsigned.find((a) => a.type === OID_TST);
  let signingTime: string | undefined;
  for (const a of attrs) {
    if (a.type === OID_SIGNING_TIME && a.values[0]) {
      const v = a.values[0] as { toDate?: () => Date };
      if (typeof v.toDate === 'function') signingTime = v.toDate().toISOString();
    }
  }
  const ku: string[] = [];
  if (cert) {
    const ext = cert.extensions?.find((e) => e.extnID === '2.5.29.15');
    if (ext?.parsedValue && typeof ext.parsedValue === 'object') ku.push('digitalSignature');
  }
  return {
    valid,
    reason,
    hashAlgorithm: signer?.digestAlgorithm.algorithmId,
    signingTime,
    subject: cert ? rdnString(cert.subject) : undefined,
    issuer: cert ? rdnString(cert.issuer) : undefined,
    notBefore: cert?.notBefore.value.toISOString(),
    notAfter: cert?.notAfter.value.toISOString(),
    keyUsage: ku,
    hasTimestamp: Boolean(tst),
    hasSigningCertV2,
  };
}

export { OID_TST };
