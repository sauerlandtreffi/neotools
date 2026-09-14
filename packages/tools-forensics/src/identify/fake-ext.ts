import type { Localized, NeoFile } from '@neotools/engine';
import { containsScript } from '../util/text.js';
import { identifyBytes, identifyFile, type Identification } from './identify.js';

export type Severity = 'ok' | 'low' | 'medium' | 'high' | 'critical';

export interface ExtensionAssessment {
  file: string;
  extension: string;
  identification: Identification;
  mismatch: boolean;
  severity: Severity;
  reasons: Localized[];
  dangerous: boolean;
}

export type Assessable = NeoFile | { name: string; mime?: string; bytes: Uint8Array };

const DOC_EXTS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.rtf',
  '.txt',
  '.csv',
]);
const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.avif',
  '.svg',
]);
const EXEC_IDS = new Set(['pe', 'elf', 'macho-32le', 'macho-32be', 'macho-64le', 'macho-64be', 'macho-fat', 'wasm', 'class', 'dex']);
const SCRIPT_IDS = new Set(['html', 'javascript', 'python', 'php', 'shell', 'powershell', 'svg']);

function worse(a: Severity, b: Severity): Severity {
  const order: Severity[] = ['ok', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function assessIdentification(id: Identification, extra?: { script?: boolean }): ExtensionAssessment {
  const reasons: Localized[] = [];
  let severity: Severity = 'ok';
  const prim = id.primary;
  const ext = id.extension;

  if (!prim) {
    if (ext && DOC_EXTS.has(ext)) {
      reasons.push({
        de: 'Dokumentendung, Inhalt nicht erkannt.',
        en: 'Document extension, content not recognized.',
      });
      severity = worse(severity, 'low');
    }
  } else {
    if (!id.extensionMatch && ext) {
      reasons.push({
        de: `Endung ${ext} passt nicht zu erkanntem Typ ${prim.id} (${prim.mime}).`,
        en: `Extension ${ext} does not match detected type ${prim.id} (${prim.mime}).`,
      });
      severity = worse(severity, 'medium');
    }
    if (!id.mimeMatch && id.claimedMime && id.claimedMime !== 'application/octet-stream') {
      reasons.push({
        de: `Übergebenes MIME ${id.claimedMime} weicht von ${prim.mime} ab.`,
        en: `Provided MIME ${id.claimedMime} differs from ${prim.mime}.`,
      });
      severity = worse(severity, 'medium');
    }
    if (EXEC_IDS.has(prim.id) && (DOC_EXTS.has(ext) || IMAGE_EXTS.has(ext) || ext === '.pdf')) {
      reasons.push({
        de: `Ausführbare Datei (${prim.id}) hinter Dokument-/Bildendung ${ext}.`,
        en: `Executable (${prim.id}) behind document/image extension ${ext}.`,
      });
      severity = worse(severity, 'critical');
    }
    if ((prim.id === 'html' || prim.id === 'svg' || extra?.script) && (IMAGE_EXTS.has(ext) || ext === '.pdf')) {
      reasons.push({
        de: `${prim.id.toUpperCase()}${extra?.script ? ' mit Script' : ''} als ${ext}.`,
        en: `${prim.id.toUpperCase()}${extra?.script ? ' with script' : ''} served as ${ext}.`,
      });
      severity = worse(severity, extra?.script ? 'high' : 'medium');
    }
    if (SCRIPT_IDS.has(prim.id) && IMAGE_EXTS.has(ext) && ext !== '.svg') {
      reasons.push({
        de: `Skript/Markup als Bildendung ${ext}.`,
        en: `Script/markup with image extension ${ext}.`,
      });
      severity = worse(severity, 'high');
    }
    if (id.polyglot) {
      reasons.push({
        de: 'Mehrere gültige Containersignaturen (Polyglot / Daten nach EOF).',
        en: 'Multiple valid container signatures (polyglot / data after EOF).',
      });
      severity = worse(severity, 'high');
    }
  }

  for (const extraHit of id.additional) {
    if (extraHit.note?.includes('after-EOF') && (extraHit.id === 'zip' || extraHit.id === 'pdf' || EXEC_IDS.has(extraHit.id))) {
      reasons.push({
        de: `Nach EOF zusätzlich ${extraHit.id} @ Offset ${extraHit.offset}.`,
        en: `After EOF additional ${extraHit.id} at offset ${extraHit.offset}.`,
      });
      severity = worse(severity, extraHit.id === 'zip' || EXEC_IDS.has(extraHit.id) ? 'high' : 'medium');
    }
  }

  const dangerous = severity === 'high' || severity === 'critical';
  return {
    file: id.name,
    extension: ext,
    identification: id,
    mismatch: !id.extensionMatch || !id.mimeMatch || id.polyglot || dangerous,
    severity,
    reasons,
    dangerous,
  };
}

export async function assessExtension(file: Assessable): Promise<ExtensionAssessment> {
  let bytes: Uint8Array;
  let name: string;
  let mime: string;
  if ('bytes' in file && typeof file.bytes !== 'function') {
    bytes = file.bytes;
    name = file.name;
    mime = file.mime ?? 'application/octet-stream';
  } else {
    const nf = file as NeoFile;
    bytes = await nf.bytes();
    name = nf.name;
    mime = nf.mime;
  }
  const id = identifyBytes(bytes, name, mime);
  const script = containsScript(bytes);
  return assessIdentification(id, { script });
}

export async function assessFile(file: NeoFile): Promise<ExtensionAssessment> {
  const id = await identifyFile(file);
  const script = containsScript(await file.bytes());
  return assessIdentification(id, { script });
}

export function assessmentMarkdown(items: ExtensionAssessment[], locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# Fake-Extension\n' : '# Fake extension\n'];
  for (const it of items) {
    lines.push(`## ${it.file}\n`);
    lines.push(`- **Severity:** ${it.severity}`);
    lines.push(
      locale === 'de'
        ? `- **Erkannt:** ${it.identification.primary?.label.de ?? 'unbekannt'} (\`${it.identification.primary?.id ?? '?'}\`)`
        : `- **Detected:** ${it.identification.primary?.label.en ?? 'unknown'} (\`${it.identification.primary?.id ?? '?'}\`)`,
    );
    if (it.reasons.length) {
      lines.push(locale === 'de' ? `- **Gründe:**` : `- **Reasons:**`);
      for (const r of it.reasons) lines.push(`  - ${r[locale]}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
