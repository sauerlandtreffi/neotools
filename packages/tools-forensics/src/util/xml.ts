export function xmlTagText(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return undefined;
  return decodeXml(m[1] ?? '').trim() || undefined;
}

export function xmlTagTexts(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const t = decodeXml(m[1] ?? '').trim();
    if (t) out.push(t);
  }
  return out;
}

export function xmlHasTag(xml: string, tag: string): boolean {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}(?:\\s|/|>)`, 'i');
  return re.test(xml);
}

export function xmlAttr(xml: string, attr: string): string[] {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? '');
  return out;
}

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}
