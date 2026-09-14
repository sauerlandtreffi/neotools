import type { Identification } from '../identify/identify.js';
import { identifyBytes } from '../identify/identify.js';
import { scanHiddenData, type HiddenFinding, type HiddenReport } from '../hidden/hidden.js';
import { inspectPdfHigh } from '../parsers/pdf-high.js';

export type TrafficLight = 'green' | 'yellow' | 'red';

export interface ChecklistItem {
  id: string;
  label: { de: string; en: string };
  present: boolean;
  severity: 'ok' | 'warn' | 'block';
  evidence?: string;
  tool?: string;
}

export interface ShareSafeReport {
  file: string;
  light: TrafficLight;
  identify: Identification;
  checklist: ChecklistItem[];
  findings: HiddenFinding[];
  sanitizeHint: { de: string; en: string };
}

function lightOf(items: ChecklistItem[]): TrafficLight {
  if (items.some((i) => i.present && i.severity === 'block')) return 'red';
  if (items.some((i) => i.present && i.severity === 'warn')) return 'yellow';
  return 'green';
}

export async function shareSafeBytes(bytes: Uint8Array, name: string, mime?: string): Promise<ShareSafeReport> {
  const identify = identifyBytes(bytes, name, mime);
  const hidden: HiddenReport = await scanHiddenData(bytes, name, mime);
  const has = (id: string) => hidden.findings.some((f) => f.id === id || f.id.startsWith(id));
  const ev = (id: string) => hidden.findings.find((f) => f.id === id || f.id.startsWith(id))?.detail.de;

  let pdfLite: Awaited<ReturnType<typeof inspectPdfHigh>> | undefined;
  if (identify.primary?.id === 'pdf') {
    try {
      pdfLite = await inspectPdfHigh(bytes);
    } catch {
      pdfLite = undefined;
    }
  }

  const checklist: ChecklistItem[] = [
    {
      id: 'gps',
      label: { de: 'GPS', en: 'GPS' },
      present: has('exif-gps'),
      severity: 'warn',
      evidence: ev('exif-gps'),
      tool: 'image-metadata',
    },
    {
      id: 'author',
      label: { de: 'Autor', en: 'Author' },
      present: has('office-author') || has('pdf-author'),
      severity: 'warn',
      evidence: ev('office-author') ?? ev('pdf-author'),
      tool: identify.primary?.id === 'pdf' ? 'pdf-sanitize' : 'image-metadata',
    },
    {
      id: 'software',
      label: { de: 'Software', en: 'Software' },
      present: has('exif-software') || Boolean(pdfLite?.producer || pdfLite?.creator),
      severity: 'warn',
      evidence: ev('exif-software') ?? pdfLite?.producer ?? pdfLite?.creator,
      tool: identify.primary?.id === 'pdf' ? 'pdf-sanitize' : 'image-metadata',
    },
    {
      id: 'serial',
      label: { de: 'Seriennummer', en: 'Serial number' },
      present: has('exif-serial'),
      severity: 'warn',
      evidence: ev('exif-serial'),
      tool: 'image-metadata',
    },
    {
      id: 'comments',
      label: { de: 'Kommentare', en: 'Comments' },
      present: has('office-comments') || (pdfLite !== undefined && pdfLite.annotationCount > 0),
      severity: 'warn',
      evidence: ev('office-comments'),
      tool: identify.primary?.id === 'pdf' ? 'pdf-sanitize' : undefined,
    },
    {
      id: 'track-changes',
      label: { de: 'Änderungsverfolgung', en: 'Track changes' },
      present: has('office-track-changes'),
      severity: 'block',
      evidence: ev('office-track-changes'),
    },
    {
      id: 'attachments',
      label: { de: 'Anhänge', en: 'Attachments' },
      present: has('pdf-embedded') || has('office-ole'),
      severity: 'block',
      evidence: ev('pdf-embedded') ?? ev('office-ole'),
      tool: 'pdf-sanitize',
    },
    {
      id: 'js',
      label: { de: 'JavaScript', en: 'JavaScript' },
      present: has('pdf-js') || Boolean(pdfLite?.hasJavaScript),
      severity: 'block',
      evidence: ev('pdf-js'),
      tool: 'pdf-sanitize',
    },
    {
      id: 'hidden-text',
      label: { de: 'Versteckter Text', en: 'Hidden text' },
      present: has('pdf-hidden-text'),
      severity: 'block',
      evidence: ev('pdf-hidden-text'),
      tool: 'pdf-sanitize',
    },
    {
      id: 'thumbnail',
      label: { de: 'EXIF-Thumbnail', en: 'EXIF thumbnail' },
      present: has('exif-thumbnail'),
      severity: 'warn',
      evidence: ev('exif-thumbnail'),
      tool: 'image-metadata',
    },
    {
      id: 'polyglot',
      label: { de: 'Polyglot / Daten nach EOF', en: 'Polyglot / data after EOF' },
      present: identify.polyglot || has('polyglot') || has('jpeg-after-eoi') || has('png-after-iend') || has('pdf-after-eof') || has('zip-after-eocd'),
      severity: 'block',
      evidence: ev('polyglot') ?? ev('jpeg-after-eoi') ?? ev('png-after-iend'),
    },
    {
      id: 'macros',
      label: { de: 'Makros', en: 'Macros' },
      present: has('office-macros'),
      severity: 'block',
      evidence: ev('office-macros'),
    },
  ];

  const light = lightOf(checklist);
  const pdf = identify.primary?.id === 'pdf';
  const sanitizeHint =
    light === 'green'
      ? { de: 'Keine kritischen Teilungsrisiken erkannt.', en: 'No critical sharing risks detected.' }
      : pdf
        ? { de: 'PDF: pdf-sanitize ausführen, danach erneut „Sicher teilen?“.', en: 'PDF: run pdf-sanitize, then re-check “Safe to share?”.' }
        : {
            de: 'Bild/Office: künftig image-metadata bzw. neu speichern ohne Metadaten/Markup.',
            en: 'Image/Office: use image-metadata (upcoming) or re-save without metadata/markup.',
          };

  return { file: name, light, identify, checklist, findings: hidden.findings, sanitizeHint };
}

export function shareSafeMarkdown(reports: ShareSafeReport[], locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# Sicher teilen?\n' : '# Safe to share?\n'];
  for (const r of reports) {
    const lamp = r.light === 'green' ? '🟢' : r.light === 'yellow' ? '🟡' : '🔴';
    lines.push(`## ${r.file} ${lamp} ${r.light}\n`);
    lines.push(r.sanitizeHint[locale], '');
    for (const c of r.checklist) {
      const mark = c.present ? (c.severity === 'block' ? '✗' : '!') : '✓';
      lines.push(`- [${mark}] ${c.label[locale]}${c.present && c.tool ? ` → ${c.tool}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
