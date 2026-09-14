import { marked, type Token, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/common';
import type { Doc, DocBlock, Heading, ListItem, Run, TableBlock } from './model.js';
import { emptyDoc, runText } from './model.js';
import { htmlToDoc } from './html.js';

marked.use({ gfm: true, breaks: false });

function inlineToRuns(tokens: Token[] | undefined): Run[] {
  if (!tokens) return [];
  const runs: Run[] = [];
  const walk = (list: Token[], style: Omit<Run, 'text'>) => {
    for (const t of list) {
      if (t.type === 'text') {
        const text = 'escaped' in t ? (t as Tokens.Text).text : (t as { text?: string }).text ?? '';
        if (text) runs.push({ text, ...style });
      } else if (t.type === 'strong') {
        walk((t as Tokens.Strong).tokens ?? [], { ...style, bold: true });
      } else if (t.type === 'em') {
        walk((t as Tokens.Em).tokens ?? [], { ...style, italic: true });
      } else if (t.type === 'codespan') {
        runs.push({ text: (t as Tokens.Codespan).text, ...style, code: true });
      } else if (t.type === 'link') {
        const link = t as Tokens.Link;
        walk(link.tokens ?? [{ type: 'text', text: link.text } as Token], { ...style, href: link.href });
      } else if (t.type === 'del') {
        walk((t as Tokens.Del).tokens ?? [], { ...style, strike: true });
      } else if (t.type === 'html') {
        const raw = (t as Tokens.HTML).text ?? '';
        if (raw) runs.push({ text: raw.replace(/<[^>]+>/g, ''), ...style });
      } else if (t.type === 'escape' || t.type === 'br') {
        if (t.type === 'br') runs.push({ text: '\n', ...style });
        else runs.push({ text: (t as Tokens.Escape).text, ...style });
      } else if ('tokens' in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
        walk((t as { tokens: Token[] }).tokens, style);
      } else if ('text' in t && typeof (t as { text: string }).text === 'string') {
        runs.push({ text: (t as { text: string }).text, ...style });
      }
    }
  };
  walk(tokens, {});
  return runs.length ? runs : [];
}

function tokensToBlocks(tokens: Token[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const t of tokens) {
    if (t.type === 'space') continue;
    if (t.type === 'heading') {
      const h = t as Tokens.Heading;
      const level = Math.min(6, Math.max(1, h.depth)) as Heading['level'];
      blocks.push({ type: 'heading', level, runs: inlineToRuns(h.tokens) });
    } else if (t.type === 'paragraph') {
      blocks.push({ type: 'paragraph', runs: inlineToRuns((t as Tokens.Paragraph).tokens) });
    } else if (t.type === 'list') {
      const list = t as Tokens.List;
      const items: ListItem[] = list.items.map((item) => ({
        checked: item.task ? Boolean(item.checked) : undefined,
        blocks: tokensToBlocks(item.tokens ?? []),
      }));
      blocks.push({ type: 'list', ordered: list.ordered, items, start: list.start || undefined });
    } else if (t.type === 'code') {
      const code = t as Tokens.Code;
      blocks.push({ type: 'code', language: code.lang, text: code.text });
    } else if (t.type === 'table') {
      const table = t as Tokens.Table;
      const rows: TableBlock['rows'] = [];
      rows.push({
        cells: table.header.map((cell) => ({
          blocks: [{ type: 'paragraph', runs: inlineToRuns(cell.tokens) }],
        })),
      });
      for (const row of table.rows) {
        rows.push({
          cells: row.map((cell) => ({
            blocks: [{ type: 'paragraph', runs: inlineToRuns(cell.tokens) }],
          })),
        });
      }
      blocks.push({ type: 'table', header: true, rows });
    } else if (t.type === 'hr') {
      blocks.push({ type: 'hr' });
    } else if (t.type === 'blockquote') {
      blocks.push(...tokensToBlocks((t as Tokens.Blockquote).tokens ?? []));
    } else if (t.type === 'html') {
      const inner = htmlToDoc((t as Tokens.HTML).text ?? '');
      blocks.push(...inner.blocks);
    } else if (t.type === 'text') {
      const text = t as Tokens.Text;
      if (text.tokens) blocks.push({ type: 'paragraph', runs: inlineToRuns(text.tokens) });
      else if (text.text.trim()) blocks.push({ type: 'paragraph', runs: [{ text: text.text }] });
    }
  }
  return blocks;
}

function extractFootnotes(src: string): { body: string; notes: Array<{ id: string; text: string }> } {
  const notes: Array<{ id: string; text: string }> = [];
  const body = src.replace(/^\[\^([^\]]+)\]:\s*(.+(?:\n[ \t]+.+)*)/gm, (_m, id: string, text: string) => {
    notes.push({ id, text: text.replace(/\n[ \t]+/g, ' ').trim() });
    return '';
  });
  return { body, notes };
}

export function markdownToDoc(markdown: string, title?: string): Doc {
  const { body, notes } = extractFootnotes(markdown);
  const tokens = marked.lexer(body, { gfm: true });
  const firstHeading = tokens.find((t): t is Tokens.Heading => t.type === 'heading' && t.depth === 1);
  const doc = emptyDoc({
    title: title ?? (firstHeading ? firstHeading.text : undefined),
    blocks: tokensToBlocks(tokens),
    footnotes: notes.map((n) => ({
      id: n.id,
      blocks: [{ type: 'paragraph', runs: [{ text: n.text }] }],
    })),
  });
  return doc;
}

function runsToMd(runs: Run[]): string {
  return runs
    .map((r) => {
      let s = r.text.replace(/\n/g, '  \n');
      if (r.code) s = `\`${s}\``;
      if (r.bold) s = `**${s}**`;
      if (r.italic) s = `*${s}*`;
      if (r.strike) s = `~~${s}~~`;
      if (r.underline) s = `<u>${s}</u>`;
      if (r.href) s = `[${s}](${r.href})`;
      return s;
    })
    .join('');
}

function blocksToMd(blocks: DocBlock[], indent = ''): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        parts.push(`${'#'.repeat(block.level)} ${runsToMd(block.runs)}`);
        break;
      case 'paragraph':
        parts.push(`${indent}${runsToMd(block.runs)}`);
        break;
      case 'list': {
        block.items.forEach((item, i) => {
          const mark = block.ordered ? `${(block.start ?? 1) + i}.` : '-';
          const box = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
          const inner = blocksToMd(item.blocks, `${indent}  `).trim();
          parts.push(`${indent}${mark} ${box}${inner}`);
        });
        break;
      }
      case 'table': {
        if (!block.rows.length) break;
        const cells = (row: (typeof block.rows)[0]) =>
          row.cells.map((c) => blocksToMd(c.blocks).replace(/\n/g, ' ').trim() || ' ');
        const header = cells(block.rows[0]!);
        parts.push(`| ${header.join(' | ')} |`);
        parts.push(`| ${header.map(() => '---').join(' | ')} |`);
        for (const row of block.rows.slice(1)) parts.push(`| ${cells(row).join(' | ')} |`);
        break;
      }
      case 'code':
        parts.push(`\`\`\`${block.language ?? ''}\n${block.text}\n\`\`\``);
        break;
      case 'image':
        parts.push(`![${block.alt ?? ''}](${block.href ?? 'image'})`);
        break;
      case 'page-break':
        parts.push('\\pagebreak');
        break;
      case 'hr':
        parts.push('---');
        break;
    }
  }
  return parts.join('\n\n');
}

export function docToMarkdown(doc: Doc): string {
  const body = blocksToMd(doc.blocks);
  const notes = (doc.footnotes ?? []).map((n) => `[^${n.id}]: ${n.blocks.map((b) => (b.type === 'paragraph' ? runText(b.runs) : '')).join(' ')}`);
  return [body, notes.join('\n')].filter(Boolean).join('\n\n') + '\n';
}

export function highlightCode(text: string, language?: string): { html: string; language?: string } {
  try {
    if (language && hljs.getLanguage(language)) {
      return { html: hljs.highlight(text, { language }).value, language };
    }
    const auto = hljs.highlightAuto(text);
    return { html: auto.value, language: auto.language };
  } catch {
    return { html: text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), language };
  }
}
