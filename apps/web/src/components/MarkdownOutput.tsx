import { marked } from 'marked';
import { sanitizeHtml } from '../lib/sanitize-html';

export default function MarkdownOutput({ markdown }: { markdown: string }) {
  const html = sanitizeHtml(marked.parse(markdown, { async: false }) as string);
  return (
    <div class="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
