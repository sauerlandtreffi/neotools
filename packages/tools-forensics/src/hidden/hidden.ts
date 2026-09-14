import type { Localized } from '@neotools/engine';
import { identifyBytes, type Identification } from '../identify/identify.js';
import { parseJpeg, jpegThumbnailInfo } from '../parsers/jpeg.js';
import { parsePng } from '../parsers/png.js';
import { parsePdfRaw } from '../parsers/pdf-raw.js';
import { inspectPdfHigh } from '../parsers/pdf-high.js';
import { parseOffice } from '../parsers/office.js';
import { findEocd } from '../parsers/zip.js';
import { hashBytes } from '../util/hashes.js';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface HiddenFinding {
  id: string;
  severity: FindingSeverity;
  title: Localized;
  detail: Localized;
  offset?: number;
  size?: number;
  recommend?: Localized;
}

export interface HiddenReport {
  file: string;
  identify: Identification;
  findings: HiddenFinding[];
  maxSeverity: FindingSeverity;
}

const RANK: Record<FindingSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function recPdf(): Localized {
  return { de: 'Bereinigen mit pdf-sanitize, danach erneut prüfen.', en: 'Sanitize with pdf-sanitize, then re-scan.' };
}
function recImg(): Localized {
  return { de: 'Metadaten entfernen mit image-metadata (Phase 2).', en: 'Strip metadata with image-metadata (phase 2).' };
}
function recOffice(): Localized {
  return { de: 'Nicht teilen; Dokument ohne Markup/Makros neu speichern.', en: 'Do not share; re-save without markup/macros.' };
}

export async function scanHiddenData(bytes: Uint8Array, name: string, mime?: string): Promise<HiddenReport> {
  const identify = identifyBytes(bytes, name, mime);
  const findings: HiddenFinding[] = [];
  const add = (f: HiddenFinding) => findings.push(f);

  for (const extra of identify.additional) {
    if (extra.note?.includes('after-EOF') || extra.note?.includes('embedded')) {
      add({
        id: `polyglot-${extra.id}`,
        severity: extra.id === 'zip' || extra.group === 'executable' ? 'high' : 'medium',
        title: { de: `Zusätzliche Signatur ${extra.id}`, en: `Additional signature ${extra.id}` },
        detail: {
          de: `${extra.label.de} @ Offset ${extra.offset}${extra.note ? ` (${extra.note})` : ''}.`,
          en: `${extra.label.en} at offset ${extra.offset}${extra.note ? ` (${extra.note})` : ''}.`,
        },
        offset: extra.offset,
        recommend: {
          de: 'Nicht teilen — Datei in ein sauberes Format neu exportieren.',
          en: 'Do not share — re-export into a clean format.',
        },
      });
    }
  }
  if (identify.polyglot) {
    add({
      id: 'polyglot',
      severity: 'high',
      title: { de: 'Polyglot-Datei', en: 'Polyglot file' },
      detail: {
        de: 'Mehrere gültige Containersignaturen oder Daten nach EOF.',
        en: 'Multiple valid container signatures or data after EOF.',
      },
      recommend: {
        de: 'Als einzelnes sauberes Format neu erzeugen.',
        en: 'Recreate as a single clean format.',
      },
    });
  }

  const id = identify.primary?.id;
  if (id === 'jpeg') {
    const jpeg = parseJpeg(bytes);
    if (jpeg) {
      if (jpeg.bytesAfterEoi > 0) {
        add({
          id: 'jpeg-after-eoi',
          severity: 'high',
          title: { de: 'Daten nach JPEG-EOI', en: 'Data after JPEG EOI' },
          detail: { de: `${jpeg.bytesAfterEoi} Bytes nach FFD9.`, en: `${jpeg.bytesAfterEoi} bytes after FFD9.` },
          offset: jpeg.eoiOffset + 2,
          size: jpeg.bytesAfterEoi,
          recommend: recImg(),
        });
      }
      if (jpeg.exif?.gps && (jpeg.exif.gps.lat !== undefined || jpeg.exif.gps.lon !== undefined)) {
        add({
          id: 'exif-gps',
          severity: 'medium',
          title: { de: 'GPS in EXIF', en: 'GPS in EXIF' },
          detail: {
            de: `Koordinaten ${jpeg.exif.gps.lat ?? '?'}, ${jpeg.exif.gps.lon ?? '?'}.`,
            en: `Coordinates ${jpeg.exif.gps.lat ?? '?'}, ${jpeg.exif.gps.lon ?? '?'}.`,
          },
          recommend: recImg(),
        });
      }
      if (jpeg.exif?.software) {
        add({
          id: 'exif-software',
          severity: 'low',
          title: { de: 'Software-Tag', en: 'Software tag' },
          detail: { de: jpeg.exif.software, en: jpeg.exif.software },
          recommend: recImg(),
        });
      }
      if (jpeg.exif?.serial) {
        add({
          id: 'exif-serial',
          severity: 'medium',
          title: { de: 'Kameraseriennummer', en: 'Camera serial number' },
          detail: { de: jpeg.exif.serial, en: jpeg.exif.serial },
          recommend: recImg(),
        });
      }
      const thumb = jpegThumbnailInfo(bytes, jpeg);
      if (thumb.present) {
        add({
          id: 'exif-thumbnail',
          severity: thumb.differs ? 'medium' : 'low',
          title: { de: 'EXIF-Thumbnail', en: 'EXIF thumbnail' },
          detail: {
            de: `Thumbnail ${thumb.size} B, Hash ${thumb.hash?.slice(0, 12)}…${thumb.differs ? ' weicht vom Hauptbild ab.' : ''}`,
            en: `Thumbnail ${thumb.size} B, hash ${thumb.hash?.slice(0, 12)}…${thumb.differs ? ' differs from main image.' : ''}`,
          },
          size: thumb.size,
          recommend: recImg(),
        });
      }
      if (jpeg.xmpHistory) {
        add({
          id: 'xmp-history',
          severity: 'medium',
          title: { de: 'XMP-Historie', en: 'XMP history' },
          detail: { de: 'xmpMM:History vorhanden.', en: 'xmpMM:History present.' },
          recommend: recImg(),
        });
      }
      if (jpeg.hasPhotoshop) {
        add({
          id: 'photoshop-8bim',
          severity: 'low',
          title: { de: 'Photoshop 8BIM-Ressourcen', en: 'Photoshop 8BIM resources' },
          detail: { de: 'APP13 / 8BIM gefunden (mögliche Layer).', en: 'APP13 / 8BIM found (possible layers).' },
          recommend: recImg(),
        });
      }
    }
  }

  if (id === 'png') {
    const png = parsePng(bytes);
    if (png) {
      if (png.bytesAfterIend > 0) {
        add({
          id: 'png-after-iend',
          severity: 'high',
          title: { de: 'Daten nach PNG-IEND', en: 'Data after PNG IEND' },
          detail: { de: `${png.bytesAfterIend} Bytes nach IEND.`, en: `${png.bytesAfterIend} bytes after IEND.` },
          offset: png.iendOffset >= 0 ? png.iendOffset + 12 : undefined,
          size: png.bytesAfterIend,
          recommend: recImg(),
        });
      }
      for (const t of png.texts) {
        if (/software|author|comment|copyright|description/i.test(t.key)) {
          add({
            id: `png-text-${t.key}`,
            severity: 'low',
            title: { de: `PNG-Text ${t.key}`, en: `PNG text ${t.key}` },
            detail: { de: t.value.slice(0, 120), en: t.value.slice(0, 120) },
            recommend: recImg(),
          });
        }
      }
    }
  }

  if (id === 'pdf') {
    const raw = parsePdfRaw(bytes);
    const high = await inspectPdfHigh(bytes);
    if (raw) {
      if (raw.bytesAfterLastEof > 0) {
        add({
          id: 'pdf-after-eof',
          severity: 'high',
          title: { de: 'Daten nach %%EOF', en: 'Data after %%EOF' },
          detail: { de: `${raw.bytesAfterLastEof} Bytes nach letztem %%EOF.`, en: `${raw.bytesAfterLastEof} bytes after last %%EOF.` },
          size: raw.bytesAfterLastEof,
          recommend: recPdf(),
        });
      }
      if (raw.incrementalUpdates > 0) {
        add({
          id: 'pdf-incremental',
          severity: 'high',
          title: { de: 'Inkrementelle Updates', en: 'Incremental updates' },
          detail: {
            de: `${raw.eofOffsets.length} × %%EOF — ältere Generationen (auch „gelöschte“ Inhalte) sind rekonstruierbar.`,
            en: `${raw.eofOffsets.length} × %%EOF — older generations (including “deleted” content) are recoverable.`,
          },
          recommend: recPdf(),
        });
      }
      if (raw.catalogHints.javascript) {
        add({
          id: 'pdf-js',
          severity: 'high',
          title: { de: 'PDF-JavaScript', en: 'PDF JavaScript' },
          detail: { de: 'JavaScript / JS im Dokument.', en: 'JavaScript / JS in the document.' },
          recommend: recPdf(),
        });
      }
      if (raw.catalogHints.embeddedFiles) {
        add({
          id: 'pdf-embedded',
          severity: 'high',
          title: { de: 'Eingebettete Dateien', en: 'Embedded files' },
          detail: { de: 'EmbeddedFiles / AF vorhanden.', en: 'EmbeddedFiles / AF present.' },
          recommend: recPdf(),
        });
      }
      if (raw.catalogHints.launch || raw.catalogHints.uri) {
        add({
          id: 'pdf-actions',
          severity: 'high',
          title: { de: 'Launch/URI-Actions', en: 'Launch/URI actions' },
          detail: { de: 'Launch- oder URI-Action gefunden.', en: 'Launch or URI action found.' },
          recommend: recPdf(),
        });
      }
      if (raw.catalogHints.ocg) {
        add({
          id: 'pdf-ocg',
          severity: 'medium',
          title: { de: 'OCG / optionale Inhalte', en: 'OCG / optional content' },
          detail: { de: 'Versteckte Ebenen möglich.', en: 'Hidden layers possible.' },
          recommend: recPdf(),
        });
      }
    }
    if (high) {
      if (high.hasJavaScript && !findings.some((f) => f.id === 'pdf-js')) {
        add({
          id: 'pdf-js',
          severity: 'high',
          title: { de: 'PDF-JavaScript', en: 'PDF JavaScript' },
          detail: { de: 'JavaScript über pdf-lib erkannt.', en: 'JavaScript detected via pdf-lib.' },
          recommend: recPdf(),
        });
      }
      if (high.hasEmbeddedFiles && !findings.some((f) => f.id === 'pdf-embedded')) {
        add({
          id: 'pdf-embedded',
          severity: 'high',
          title: { de: 'Eingebettete Dateien', en: 'Embedded files' },
          detail: { de: `${high.fileAttachmentAnnots} FileAttachment-Annotationen / Names-Tree.`, en: `${high.fileAttachmentAnnots} file-attachment annotations / names tree.` },
          recommend: recPdf(),
        });
      }
      if (high.content.hiddenRuns.length) {
        add({
          id: 'pdf-hidden-text',
          severity: 'high',
          title: { de: 'Versteckter Text', en: 'Hidden text' },
          detail: {
            de: `${high.content.hiddenRuns.length} Textstellen (Tr=3 oder Füllfarbe ≈ weiß). Nachweis, keine Extraktion.`,
            en: `${high.content.hiddenRuns.length} text runs (Tr=3 or fill ≈ white). Evidence only, no extraction.`,
          },
          recommend: recPdf(),
        });
      }
      if (high.info.Author || high.info.Creator || high.info.Producer) {
        add({
          id: 'pdf-author',
          severity: 'low',
          title: { de: 'PDF-Metadaten (Autor/Software)', en: 'PDF metadata (author/software)' },
          detail: {
            de: [high.info.Author, high.info.Creator, high.info.Producer].filter(Boolean).join(' · '),
            en: [high.info.Author, high.info.Creator, high.info.Producer].filter(Boolean).join(' · '),
          },
          recommend: recPdf(),
        });
      }
    }
  }

  if (id && ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'ooxml', 'zip'].includes(id)) {
    const office = parseOffice(bytes);
    if (office) {
      if (office.bytesAfterEocd > 0) {
        add({
          id: 'zip-after-eocd',
          severity: 'high',
          title: { de: 'Daten nach ZIP-EOCD', en: 'Data after ZIP EOCD' },
          detail: { de: `${office.bytesAfterEocd} Bytes nach End-of-Central-Directory.`, en: `${office.bytesAfterEocd} bytes after end-of-central-directory.` },
          size: office.bytesAfterEocd,
          recommend: recOffice(),
        });
      }
      if (office.core?.creator || office.app?.company) {
        add({
          id: 'office-author',
          severity: 'low',
          title: { de: 'Autor / Firma', en: 'Author / company' },
          detail: {
            de: [office.core?.creator, office.app?.company].filter(Boolean).join(' · '),
            en: [office.core?.creator, office.app?.company].filter(Boolean).join(' · '),
          },
          recommend: recOffice(),
        });
      }
      if (office.app?.totalTime || office.core?.revision) {
        add({
          id: 'office-rev',
          severity: 'low',
          title: { de: 'Revision / TotalTime', en: 'Revision / TotalTime' },
          detail: {
            de: `Rev ${office.core?.revision ?? '—'}, Zeit ${office.app?.totalTime ?? '—'}`,
            en: `Rev ${office.core?.revision ?? '—'}, time ${office.app?.totalTime ?? '—'}`,
          },
          recommend: recOffice(),
        });
      }
      if (office.comments > 0) {
        add({
          id: 'office-comments',
          severity: 'medium',
          title: { de: 'Kommentare', en: 'Comments' },
          detail: { de: `${office.comments} Kommentar-Textknoten.`, en: `${office.comments} comment text nodes.` },
          recommend: recOffice(),
        });
      }
      if (office.trackChanges.insertions || office.trackChanges.deletions) {
        add({
          id: 'office-track-changes',
          severity: 'high',
          title: { de: 'Änderungsverfolgung', en: 'Track changes' },
          detail: {
            de: `${office.trackChanges.insertions} Einfügungen (w:ins), ${office.trackChanges.deletions} Löschungen (w:del).`,
            en: `${office.trackChanges.insertions} insertions (w:ins), ${office.trackChanges.deletions} deletions (w:del).`,
          },
          recommend: recOffice(),
        });
      }
      if (office.macros) {
        add({
          id: 'office-macros',
          severity: 'critical',
          title: { de: 'Makros (vbaProject.bin)', en: 'Macros (vbaProject.bin)' },
          detail: { de: 'vbaProject.bin vorhanden — nicht extrahiert.', en: 'vbaProject.bin present — not extracted.' },
          recommend: recOffice(),
        });
      }
      if (office.ole.length) {
        add({
          id: 'office-ole',
          severity: 'high',
          title: { de: 'Eingebettete OLE-Objekte', en: 'Embedded OLE objects' },
          detail: { de: office.ole.slice(0, 8).join(', '), en: office.ole.slice(0, 8).join(', ') },
          recommend: recOffice(),
        });
      }
      if (office.externalLinks.length) {
        add({
          id: 'office-links',
          severity: 'medium',
          title: { de: 'Externe Links', en: 'External links' },
          detail: { de: office.externalLinks.slice(0, 8).join(', '), en: office.externalLinks.slice(0, 8).join(', ') },
          recommend: recOffice(),
        });
      }
    } else {
      const eocd = findEocd(bytes);
      if (eocd >= 0) {
        const commentLen = bytes[eocd + 20]! | (bytes[eocd + 21]! << 8);
        const after = bytes.length - (eocd + 22 + commentLen);
        if (after > 0) {
          add({
            id: 'zip-after-eocd',
            severity: 'high',
            title: { de: 'Daten nach ZIP-EOCD', en: 'Data after ZIP EOCD' },
            detail: { de: `${after} Bytes.`, en: `${after} bytes.` },
            size: after,
          });
        }
      }
    }
  }

  void hashBytes;
  const maxSeverity = findings.reduce<FindingSeverity>((a, f) => (RANK[f.severity] > RANK[a] ? f.severity : a), 'info');
  return { file: name, identify, findings, maxSeverity };
}

export function hiddenMarkdown(reports: HiddenReport[], locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# Hidden-Data-Radar\n' : '# Hidden-data radar\n'];
  for (const r of reports) {
    lines.push(`## ${r.file}\n`);
    lines.push(`- **Max severity:** ${r.maxSeverity}`);
    lines.push(`- **Findings:** ${r.findings.length}\n`);
    for (const f of r.findings) {
      lines.push(`### ${f.title[locale]} (${f.severity})`);
      lines.push(f.detail[locale]);
      if (f.offset !== undefined) lines.push(`- offset: ${f.offset}`);
      if (f.size !== undefined) lines.push(`- size: ${f.size}`);
      if (f.recommend) lines.push(`- **${locale === 'de' ? 'Empfehlung' : 'Recommend'}:** ${f.recommend[locale]}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
