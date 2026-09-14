import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function MarkdownOutput({ markdown }: { markdown: string }) {
  const html = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string);
  return (
    <div class="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
