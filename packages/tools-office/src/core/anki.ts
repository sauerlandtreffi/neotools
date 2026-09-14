import { zipBytes, type ZipMap } from '../util/zip.js';
import { utf8 } from '../util/bytes.js';
import { createRequire } from 'node:module';

export interface AnkiNote {
  front: string;
  back: string;
  imageName?: string;
  image?: Uint8Array;
}

export function notesToCsv(notes: AnkiNote[]): string {
  const rows = ['Front,Back', ...notes.map((n) => `${csvEsc(n.front)},${csvEsc(n.back)}`)];
  return rows.join('\n') + '\n';
}

function csvEsc(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function initSql() {
  const initSqlJs = (await import('sql.js')).default;
  const locateFile = (file: string) => {
    try {
      const req = createRequire(import.meta.url);
      return req.resolve(`sql.js/dist/${file}`);
    } catch {
      return file;
    }
  };
  return initSqlJs({ locateFile });
}

function guid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function notesToApkg(notes: AnkiNote[]): Promise<Uint8Array> {
  const SQL = await initSql();
  const db = new SQL.Database();
  const now = Math.floor(Date.now() / 1000);
  const mid = 1607392462;
  const did = 1;
  const models = JSON.stringify({
    [mid]: {
      id: mid,
      name: 'NeoTools Basic',
      type: 0,
      mod: now,
      flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}', ord: 0 }],
      css: '.card { font-family: sans-serif; text-align: center; }',
      req: [[0, 'any', [0]]],
    },
  });
  const decks = JSON.stringify({
    [did]: { id: did, name: 'Default', mod: now, desc: '' },
  });
  db.run(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);`);
  db.run(`CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);`);
  db.run(`CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);`);
  db.run(`CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);`);
  db.run(`CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);`);
  db.run(`INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, '{}', ?, ?, '{}', '')`, [
    now,
    now,
    now,
    models,
    decks,
  ]);
  const media: Record<string, string> = {};
  const zip: ZipMap = {};
  notes.forEach((note, i) => {
    const nid = now + i + 1;
    let front = note.front;
    if (note.image && note.imageName) {
      const idx = String(Object.keys(media).length);
      media[idx] = note.imageName;
      zip[idx] = note.image;
      front = `${front}<br><img src="${note.imageName}" />`;
    }
    const flds = `${front}\x1f${note.back}`;
    db.run(`INSERT INTO notes VALUES (?, ?, ?, ?, 0, '', ?, ?, 0, 0, '')`, [nid, guid(), mid, now, flds, front]);
    db.run(`INSERT INTO cards VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`, [
      nid + 100000,
      nid,
      did,
      now,
      i,
    ]);
  });
  zip['collection.anki2'] = db.export();
  zip['media'] = utf8(JSON.stringify(media));
  return zipBytes(zip);
}
