import { useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { addBrowserFiles } from '../../lib/workspace/store';
import { I } from './Icons';

/**
 * Empty canvas of the program shell (pivot §11.2): one generous drop area —
 * "Open file · drag here · paste". Recent sessions live in the bin, the local
 * badge in the status bar; nothing else competes for attention.
 */
export default function EmptyState({ locale }: { locale: Locale }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div class="ws-empty" data-empty-state>
      <input
        ref={input}
        type="file"
        multiple
        class="sr-only"
        data-empty-input
        onChange={(e) => {
          const list = Array.from((e.target as HTMLInputElement).files ?? []);
          (e.target as HTMLInputElement).value = '';
          void addBrowserFiles(list);
        }}
      />
      <button
        type="button"
        class="ws-empty-drop"
        data-over={over}
        data-empty-drop
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addBrowserFiles(Array.from(e.dataTransfer?.files ?? []));
        }}
      >
        <span class="ws-empty-glyph" aria-hidden="true">
          <I.plus size={22} />
        </span>
        <span class="ws-empty-title">
          {w(locale, 'openFileVerb')} <span class="ws-empty-dot">·</span> {w(locale, 'dragHere')} <span class="ws-empty-dot">·</span> {w(locale, 'pasteVerb')}
        </span>
        <span class="ws-empty-lead">{w(locale, 'anyType')}</span>
        <span class="ws-empty-keys" aria-hidden="true">
          <kbd>⌘O</kbd> <kbd>⌘V</kbd>
        </span>
      </button>
    </div>
  );
}
