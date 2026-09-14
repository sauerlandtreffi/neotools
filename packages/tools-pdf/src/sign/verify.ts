import { concatRanges } from './engine.js';
import { findPdfSignatures } from './find.js';
import { verifyCmsDetached, type CmsVerifyResult } from './cms.js';

export type PadesLevel = 'none' | 'B-B' | 'B-T' | 'B-LT' | 'unknown';

export interface SignatureReport {
  index: number;
  valid: boolean;
  modifiedAfter: boolean;
  pades: PadesLevel;
  cms: CmsVerifyResult;
  byteRange: [number, number, number, number];
  note: { de: string; en: string };
}

export interface SignVerifyReport {
  signatures: SignatureReport[];
  valid: boolean;
  hasDss: boolean;
}

function classify(cms: CmsVerifyResult, hasDss: boolean): PadesLevel {
  if (!cms.valid) return 'unknown';
  if (hasDss) return 'B-LT';
  if (cms.hasTimestamp) return 'B-T';
  if (cms.hasSigningCertV2) return 'B-B';
  return 'B-B';
}

export async function verifyPdfSignatures(bytes: Uint8Array): Promise<SignVerifyReport> {
  const latin = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4_000_000)));
  const hasDss = /\/DSS\b/.test(latin) || /\/VRI\b/.test(latin);
  const boxes = findPdfSignatures(bytes);
  const signatures: SignatureReport[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    const signed = concatRanges(bytes, box.byteRange);
    const cms = await verifyCmsDetached(box.contents, signed);
    const modifiedAfter = box.incrementalAfter;
    const valid = cms.valid && !modifiedAfter;
    signatures.push({
      index: i,
      valid,
      modifiedAfter,
      pades: classify(cms, hasDss),
      cms,
      byteRange: box.byteRange,
      note: modifiedAfter
        ? {
            de: 'ByteRange deckt nicht die gesamte Datei — inkrementelle Änderung nach der Signatur.',
            en: 'ByteRange does not cover the whole file — incremental change after signing.',
          }
        : {
            de: cms.valid ? 'Signatur gültig (offline, ohne OCSP-Netzwerk).' : (cms.reason ?? 'Signatur ungültig.'),
            en: cms.valid ? 'Signature valid (offline, no OCSP network).' : (cms.reason ?? 'Signature invalid.'),
          },
    });
  }
  return {
    signatures,
    valid: signatures.length > 0 && signatures.every((s) => s.valid),
    hasDss,
  };
}

export function signVerifyMarkdown(report: SignVerifyReport, locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# PDF-Signaturen' : '# PDF signatures', ''];
  if (!report.signatures.length) {
    lines.push(locale === 'de' ? 'Keine /Sig-Felder gefunden.' : 'No /Sig fields found.');
    return lines.join('\n') + '\n';
  }
  for (const s of report.signatures) {
    lines.push(`## #${s.index + 1}  ${s.valid ? 'OK' : 'FAIL'}  PAdES ${s.pades}`);
    lines.push(`- subject: ${s.cms.subject ?? '—'}`);
    lines.push(`- issuer: ${s.cms.issuer ?? '—'}`);
    lines.push(`- hash: ${s.cms.hashAlgorithm ?? '—'}`);
    lines.push(`- time: ${s.cms.signingTime ?? '—'}`);
    lines.push(`- timestamp: ${s.cms.hasTimestamp ? 'yes' : 'no'} (RFC 3161 unsignedAttrs)`);
    lines.push(`- ${locale === 'de' ? s.note.de : s.note.en}`);
    lines.push('');
  }
  lines.push(locale === 'de' ? 'OCSP/CRL nur offline (DSS/VRI), kein Online-OCSP.' : 'OCSP/CRL offline only (DSS/VRI), no online OCSP.');
  return lines.join('\n') + '\n';
}
