export interface VCard {
  version: '2.1' | '3.0' | '4.0';
  fn?: string;
  n?: string;
  tel: string[];
  email: string[];
  adr: string[];
  org?: string;
  photo?: { mime: string; bytes: Uint8Array };
  raw: Record<string, string[]>;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseVersion(v: string): VCard['version'] {
  if (v.startsWith('2.1')) return '2.1';
  if (v.startsWith('4')) return '4.0';
  return '3.0';
}

export function parseVCards(text: string): VCard[] {
  const cards: VCard[] = [];
  let cur: string[] = [];
  for (const line of unfold(text)) {
    if (/^BEGIN:VCARD/i.test(line)) cur = [line];
    else if (/^END:VCARD/i.test(line)) {
      cur.push(line);
      cards.push(parseOne(cur.join('\n')));
      cur = [];
    } else if (cur.length) cur.push(line);
  }
  return cards;
}

function parseOne(text: string): VCard {
  const raw: Record<string, string[]> = {};
  const card: VCard = { version: '3.0', tel: [], email: [], adr: [], raw };
  for (const line of unfold(text)) {
    const m = /^([^:;]+)(;[^:]+)?:(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toUpperCase();
    const params = m[2] ?? '';
    const value = m[3] ?? '';
    (raw[key] ??= []).push(value);
    if (key === 'VERSION') card.version = parseVersion(value);
    if (key === 'FN') card.fn = value;
    if (key === 'N') card.n = value;
    if (key === 'TEL') card.tel.push(value);
    if (key === 'EMAIL') card.email.push(value);
    if (key === 'ADR') card.adr.push(value);
    if (key === 'ORG') card.org = value;
    if (key === 'PHOTO') {
      const mime = /TYPE=([^;:]+)/i.exec(params)?.[1] ?? 'image/jpeg';
      const b64 = value.replace(/\s+/g, '');
      try {
        const bin = Buffer.from(b64, 'base64');
        card.photo = { mime, bytes: new Uint8Array(bin) };
      } catch {
        // ignore
      }
    }
  }
  return card;
}

export function serializeVCard(card: VCard): string {
  const lines = ['BEGIN:VCARD', `VERSION:${card.version}`];
  if (card.fn) lines.push(`FN:${card.fn}`);
  if (card.n) lines.push(`N:${card.n}`);
  if (card.org) lines.push(`ORG:${card.org}`);
  for (const t of unique(card.tel)) lines.push(`TEL:${t}`);
  for (const e of unique(card.email)) lines.push(`EMAIL:${e}`);
  for (const a of unique(card.adr)) lines.push(`ADR:${a}`);
  if (card.photo) {
    const b64 = Buffer.from(card.photo.bytes).toString('base64');
    lines.push(`PHOTO;ENCODING=b;TYPE=${card.photo.mime}:${b64}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

function unique(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.replace(/\s+/g, '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function keyOf(card: VCard): string {
  const mail = card.email[0]?.toLowerCase().trim();
  const tel = card.tel[0]?.replace(/\D/g, '');
  const name = (card.fn ?? card.n ?? '').toLowerCase().trim();
  return mail || tel || name || JSON.stringify(card.raw);
}

export function mergeVCards(cards: VCard[]): VCard[] {
  const map = new Map<string, VCard>();
  for (const c of cards) {
    const k = keyOf(c);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...c, tel: [...c.tel], email: [...c.email], adr: [...c.adr], raw: { ...c.raw } });
      continue;
    }
    prev.fn = prev.fn || c.fn;
    prev.n = prev.n || c.n;
    prev.org = prev.org || c.org;
    prev.tel = unique([...prev.tel, ...c.tel]);
    prev.email = unique([...prev.email, ...c.email]);
    prev.adr = unique([...prev.adr, ...c.adr]);
    if (!prev.photo && c.photo) prev.photo = c.photo;
    prev.version = c.version === '4.0' || prev.version === '4.0' ? '4.0' : prev.version;
  }
  return [...map.values()];
}

export function vcardsFromOcrText(text: string): VCard {
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const tel = text.match(/(?:\+|00)?[\d\s/().-]{7,}\d/)?.[0]?.trim();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const fn = lines[0];
  const adr = lines.filter((l) => /\d/.test(l) && /[A-Za-zÄÖÜäöüß]/.test(l) && l !== fn && l !== email && l !== tel).slice(0, 2);
  return {
    version: '3.0',
    fn,
    email: email ? [email] : [],
    tel: tel ? [tel] : [],
    adr,
    raw: {},
  };
}
