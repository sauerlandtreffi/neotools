export interface XmlNode {
  name: string;
  prefix: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENT: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16) || 0);
    }
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10) || 0);
    return ENT[name] ?? `&${name};`;
  });
}

function splitName(raw: string): { prefix: string; name: string } {
  const i = raw.indexOf(':');
  if (i < 0) return { prefix: '', name: raw };
  return { prefix: raw.slice(0, i), name: raw.slice(i + 1) };
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1]!] = decodeEntities(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Stack-based well-formedness check + tree. Throws on malformed XML. */
export function parseXml(xml: string): XmlNode {
  const src = xml.replace(/^\uFEFF/, '').trim();
  if (!src.startsWith('<')) throw new Error('XML: fehlt Wurzel-Element.');
  let i = 0;
  const stack: XmlNode[] = [];
  const rootWrap: XmlNode = { name: '#doc', prefix: '', attrs: {}, children: [], text: '' };
  stack.push(rootWrap);

  const pushText = (text: string) => {
    const t = decodeEntities(text);
    if (!t) return;
    const cur = stack[stack.length - 1]!;
    if (!cur.children.length) cur.text += t;
    else cur.text += t;
  };

  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) throw new Error('XML: Kommentar nicht geschlossen.');
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end < 0) throw new Error('XML: CDATA nicht geschlossen.');
      pushText(src.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end < 0) throw new Error('XML: PI nicht geschlossen.');
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i)) {
      const end = src.indexOf('>', i);
      if (end < 0) throw new Error('XML: DOCTYPE nicht geschlossen.');
      i = end + 1;
      continue;
    }
    if (src[i] === '<') {
      const gt = src.indexOf('>', i + 1);
      if (gt < 0) throw new Error('XML: Tag nicht geschlossen.');
      const body = src.slice(i + 1, gt);
      if (body.startsWith('/')) {
        const { name } = splitName(body.slice(1).trim());
        const cur = stack.pop();
        if (!cur || cur.name === '#doc') throw new Error(`XML: unerwartetes End-Tag </${name}>.`);
        if (cur.name !== name) throw new Error(`XML: Tag-Mismatch <${cur.name}> vs </${name}>.`);
        stack[stack.length - 1]!.children.push(cur);
        i = gt + 1;
        continue;
      }
      const selfClose = body.endsWith('/');
      const trimmed = selfClose ? body.slice(0, -1).trim() : body.trim();
      const sp = trimmed.search(/\s/);
      const rawName = sp < 0 ? trimmed : trimmed.slice(0, sp);
      const attrRaw = sp < 0 ? '' : trimmed.slice(sp);
      const { prefix, name } = splitName(rawName);
      if (!name) throw new Error('XML: leerer Elementname.');
      const node: XmlNode = { name, prefix, attrs: parseAttrs(attrRaw), children: [], text: '' };
      if (selfClose) stack[stack.length - 1]!.children.push(node);
      else stack.push(node);
      i = gt + 1;
      continue;
    }
    const next = src.indexOf('<', i);
    const end = next < 0 ? src.length : next;
    pushText(src.slice(i, end));
    i = end;
  }
  if (stack.length !== 1) throw new Error(`XML: ungeschlossene Tags (${stack.map((s) => s.name).join(', ')}).`);
  const children = rootWrap.children;
  if (children.length !== 1) throw new Error('XML: genau ein Wurzel-Element erforderlich.');
  return children[0]!;
}

export function local(node: XmlNode): string {
  return node.name;
}

export function findAll(node: XmlNode | undefined, localName: string, acc: XmlNode[] = []): XmlNode[] {
  if (!node) return acc;
  if (node.name === localName) acc.push(node);
  for (const c of node.children) findAll(c, localName, acc);
  return acc;
}

export function findFirst(node: XmlNode | undefined, localName: string): XmlNode | undefined {
  return findAll(node, localName)[0];
}

export function textOf(node: XmlNode | undefined): string {
  if (!node) return '';
  if (node.text.trim()) return node.text.replace(/\s+/g, ' ').trim();
  return node.children.map((c) => textOf(c)).join(' ').replace(/\s+/g, ' ').trim();
}

export function childText(node: XmlNode | undefined, localName: string): string {
  if (!node) return '';
  const direct = node.children.find((c) => c.name === localName);
  if (direct) return textOf(direct);
  return textOf(findFirst(node, localName));
}

export function collectNamespaces(xml: string): string[] {
  const out = new Set<string>();
  const re = /xmlns(?::[A-Za-z0-9]+)?\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.add(m[1]!);
  return [...out];
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
