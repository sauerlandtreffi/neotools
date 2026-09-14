import { useMemo } from 'preact/hooks';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Locale } from '../lib/i18n';

interface Props {
  locale: Locale;
  toolId: string;
  values: Record<string, unknown>;
  onChangeValues: (next: Record<string, unknown>) => void;
  onGenerate: () => void;
}

export default function DocPreview({ locale, toolId, values, onChangeValues, onGenerate }: Props) {
  const source = String(values.source ?? '');
  const htmlMode = toolId === 'html-to-pdf';
  const preview = useMemo(() => {
    const raw = htmlMode ? source : String(marked.parse(source || '', { async: false }));
    return DOMPurify.sanitize(raw);
  }, [htmlMode, source]);

  return (
    <section class="grid gap-3 md:grid-cols-2" data-editor="doc-preview">
      <label class="grid gap-1">
        <span class="stamp">{htmlMode ? (locale === 'de' ? 'HTML' : 'HTML') : locale === 'de' ? 'Markdown' : 'Markdown'}</span>
        <textarea
          class="min-h-72 w-full rounded border p-2 font-mono text-sm"
          style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
          value={source}
          onInput={(e) => onChangeValues({ ...values, source: (e.target as HTMLTextAreaElement).value })}
        />
      </label>
      <div class="grid gap-1">
        <span class="stamp">{locale === 'de' ? 'Vorschau' : 'Preview'}</span>
        <div
          class="min-h-72 overflow-auto rounded border p-3 text-sm"
          style={{ borderColor: 'var(--line)' }}
          dangerouslySetInnerHTML={{ __html: preview || '<p class="opacity-50">…</p>' }}
        />
        <button
          type="button"
          class="justify-self-start rounded-md px-4 py-2 font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          onClick={onGenerate}
        >
          {locale === 'de' ? 'PDF erzeugen' : 'Generate PDF'}
        </button>
      </div>
    </section>
  );
}
