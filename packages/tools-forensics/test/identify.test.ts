import { describe, expect, it } from 'vitest';
import { createToolContext } from '@neotools/engine';
import { FORMAT_CATALOG, formatCatalogCount } from '../src/identify/signatures.js';
import { identifyBytes } from '../src/identify/identify.js';
import { assessExtension } from '../src/identify/fake-ext.js';
import { forensicsIdentify } from '../src/tools/forensics-identify.js';
import { forensicsFakeExt } from '../src/tools/forensics-fake-ext.js';
import {
  fileOf,
  htmlAsJpg,
  jpegWithZip,
  minimalDocx,
  peStub,
  tinyJpg,
  tinyPng,
  utf8BomText,
  buildMinimalMp4,
  buildId3Mp3,
} from './fixtures.js';

describe('magic catalog', () => {
  it('covers at least 80 formats', () => {
    expect(formatCatalogCount()).toBeGreaterThanOrEqual(80);
    expect(FORMAT_CATALOG.length).toBeGreaterThanOrEqual(80);
  });
});

describe('identify', () => {
  it('detects JPEG, PNG, MP4, MP3, DOCX, PE, UTF-8 BOM', () => {
    expect(identifyBytes(tinyJpg(), 'a.jpg', 'image/jpeg').primary?.id).toBe('jpeg');
    expect(identifyBytes(tinyPng(), 'a.png').primary?.id).toBe('png');
    expect(identifyBytes(buildMinimalMp4(), 'v.mp4').primary?.id).toBe('mp4');
    expect(identifyBytes(buildId3Mp3(), 't.mp3').primary?.id).toBe('mp3');
    expect(identifyBytes(minimalDocx(), 'd.docx').primary?.id).toBe('docx');
    expect(identifyBytes(peStub(), 'x.exe').primary?.id).toBe('pe');
    const txt = identifyBytes(utf8BomText(), 'n.txt', 'text/plain');
    expect(txt.encoding.encoding).toBe('utf-8-bom');
    expect(txt.encoding.bom).toBe(true);
  });

  it('flags jpeg+zip polyglot and PE named .pdf', () => {
    const poly = identifyBytes(jpegWithZip(), 'pic.jpg', 'image/jpeg');
    expect(poly.primary?.id).toBe('jpeg');
    expect(poly.polyglot).toBe(true);
    expect(poly.additional.some((h) => h.id === 'zip' || h.note?.includes('after-EOF'))).toBe(true);

    const fake = identifyBytes(peStub(), 'invoice.pdf', 'application/pdf');
    expect(fake.primary?.id).toBe('pe');
    expect(fake.extensionMatch).toBe(false);
    expect(fake.mismatches.length).toBeGreaterThan(0);
  });

  it('tool emits json + markdown for a batch', async () => {
    const result = await forensicsIdentify.run(createToolContext(), [fileOf('a.jpg', tinyJpg(), 'image/jpeg')], {
      locale: 'de',
    });
    expect(result.outputs.some((f) => f.name.endsWith('.json'))).toBe(true);
    expect(result.outputs.some((f) => f.name.endsWith('.md'))).toBe(true);
  });
});

describe('fake-ext / assessExtension', () => {
  it('rates PE as .pdf critical and HTML as .jpg high', async () => {
    const pe = await assessExtension({ name: 'invoice.pdf', mime: 'application/pdf', bytes: peStub() });
    expect(pe.severity).toBe('critical');
    expect(pe.dangerous).toBe(true);

    const html = await assessExtension({ name: 'photo.jpg', mime: 'image/jpeg', bytes: htmlAsJpg() });
    expect(['high', 'critical']).toContain(html.severity);
    expect(html.identification.primary?.id).toBe('html');
  });

  it('tool reports severity', async () => {
    const result = await forensicsFakeExt.run(
      createToolContext(),
      [fileOf('invoice.pdf', peStub(), 'application/pdf')],
      { locale: 'en' },
    );
    const json = JSON.parse(new TextDecoder().decode(await result.outputs[0]!.bytes())) as {
      files: Array<{ severity: string }>;
    };
    expect(json.files[0]?.severity).toBe('critical');
  });
});
