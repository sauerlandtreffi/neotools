import { xmlAttr, xmlHasTag, xmlTagText, xmlTagTexts } from '../util/xml.js';
import { listZipEntries, readZipText, zipHas } from './zip.js';

export interface OfficeAutopsy {
  kind: 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp' | 'ooxml' | 'zip';
  entries: Array<{ name: string; compressedSize: number; uncompressedSize: number; method: number }>;
  comment?: string;
  bytesAfterEocd: number;
  core?: {
    creator?: string;
    lastModifiedBy?: string;
    created?: string;
    modified?: string;
    revision?: string;
    title?: string;
  };
  app?: {
    company?: string;
    totalTime?: string;
    application?: string;
  };
  comments: number;
  trackChanges: { insertions: number; deletions: number };
  macros: boolean;
  ole: string[];
  externalLinks: string[];
}

export function parseOffice(bytes: Uint8Array): OfficeAutopsy | undefined {
  const zip = listZipEntries(bytes);
  if (!zip.entries.length && zip.eocdOffset < 0) return undefined;
  const names = zip.entries.map((e) => e.name.replace(/\\/g, '/'));
  const has = (p: string) => names.some((n) => n === p || n.startsWith(p));
  let kind: OfficeAutopsy['kind'] = 'zip';
  if (has('[Content_Types].xml') && has('word/')) kind = 'docx';
  else if (has('[Content_Types].xml') && has('xl/')) kind = 'xlsx';
  else if (has('[Content_Types].xml') && has('ppt/')) kind = 'pptx';
  else if (has('mimetype') && names.includes('mimetype')) kind = 'odt';
  else if (has('[Content_Types].xml')) kind = 'ooxml';

  const coreXml = readZipText(bytes, 'docProps/core.xml') ?? readZipText(bytes, 'meta.xml');
  const appXml = readZipText(bytes, 'docProps/app.xml');
  const commentsXml =
    readZipText(bytes, 'word/comments.xml') ??
    readZipText(bytes, 'xl/comments.xml') ??
    readZipText(bytes, 'ppt/comments.xml');
  const documentXml =
    readZipText(bytes, 'word/document.xml') ??
    readZipText(bytes, 'xl/sharedStrings.xml') ??
    readZipText(bytes, 'ppt/slides/slide1.xml') ??
    '';

  const core = coreXml
    ? {
        creator: xmlTagText(coreXml, 'creator') ?? xmlTagText(coreXml, 'initial-creator'),
        lastModifiedBy: xmlTagText(coreXml, 'lastModifiedBy'),
        created: xmlTagText(coreXml, 'created'),
        modified: xmlTagText(coreXml, 'modified'),
        revision: xmlTagText(coreXml, 'revision'),
        title: xmlTagText(coreXml, 'title'),
      }
    : undefined;
  const app = appXml
    ? {
        company: xmlTagText(appXml, 'Company'),
        totalTime: xmlTagText(appXml, 'TotalTime'),
        application: xmlTagText(appXml, 'Application'),
      }
    : undefined;

  const comments = commentsXml ? xmlTagTexts(commentsXml, 't').length || (xmlHasTag(commentsXml, 'comment') ? 1 : 0) : 0;
  const insertions = (documentXml.match(/<w:ins[\s>]/g) ?? []).length;
  const deletions = (documentXml.match(/<w:del[\s>]/g) ?? []).length;
  const macros = zipHas(bytes, (n) => /vbaProject\.bin$/i.test(n) || n.includes('vbaProject'));
  const ole = names.filter((n) => /embeddings\/|oleObject|\.bin$/i.test(n) && !/vbaProject/i.test(n));
  const relsXml = names
    .filter((n) => n.endsWith('.rels'))
    .map((n) => readZipText(bytes, n) ?? '')
    .join('\n');
  const externalLinks = xmlAttr(relsXml, 'Target').filter((_, i, arr) => {
    void arr;
    return true;
  });
  const ext = [...relsXml.matchAll(/TargetMode\s*=\s*["']External["'][^>]*Target\s*=\s*["']([^"']+)/gi)].map((m) => m[1]!);
  const ext2 = [...relsXml.matchAll(/Target\s*=\s*["']([^"']+)["'][^>]*TargetMode\s*=\s*["']External["']/gi)].map((m) => m[1]!);

  return {
    kind,
    entries: zip.entries.map((e) => ({
      name: e.name,
      compressedSize: e.compressedSize,
      uncompressedSize: e.uncompressedSize,
      method: e.method,
    })),
    comment: zip.comment || undefined,
    bytesAfterEocd: zip.bytesAfterEocd,
    core,
    app,
    comments,
    trackChanges: { insertions, deletions },
    macros,
    ole,
    externalLinks: [...new Set([...ext, ...ext2, ...externalLinks.filter((t) => t.startsWith('http') || t.startsWith('file:'))])],
  };
}
