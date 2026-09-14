import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { setUi, workspace } from '../../lib/workspace/store';
import { I } from './Icons';

const ROWS: Array<[string, { de: string; en: string }]> = [
  ['⌘K', { de: 'Befehle / Werkzeuge', en: 'Commands / tools' }],
  ['⌘Z / ⇧⌘Z', { de: 'Rückgängig / Wiederholen', en: 'Undo / redo' }],
  ['⌘⏎', { de: 'Anwenden', en: 'Apply' }],
  ['⌘E', { de: 'Exportieren', en: 'Export' }],
  ['⌘O', { de: 'Datei öffnen', en: 'Open file' }],
  ['⌘V', { de: 'Datei aus Zwischenablage', en: 'Paste file' }],
  ['/', { de: 'Im Dokument suchen', en: 'Search document' }],
  ['← → / PgUp PgDn', { de: 'Seite wechseln', en: 'Change page' }],
  ['+ / −', { de: 'Zoom', en: 'Zoom' }],
  ['T / R', { de: 'Schwärzen: Text / Rechteck', en: 'Redact: text / rectangle' }],
  ['⌥↑ / ⌥↓', { de: 'Seite in Miniaturen verschieben', en: 'Move page in thumbnails' }],
  ['⌫', { de: 'Gewählte Seiten löschen', en: 'Delete selected pages' }],
  ['Esc', { de: 'Schließen / Auswahl aufheben', en: 'Close / clear selection' }],
  ['?', { de: 'Diese Hilfe', en: 'This help' }],
];

export default function ShortcutsHelp({ locale }: { locale: Locale }) {
  if (!workspace.value.shortcutsOpen) return null;
  return (
    <div class="ws-modal-backdrop" onClick={() => setUi({ shortcutsOpen: false })}>
      <div class="ws-modal nt-pop" role="dialog" aria-modal="true" aria-label={w(locale, 'shortcuts')} onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="font-medium">{w(locale, 'shortcuts')}</span>
          <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'close')} onClick={() => setUi({ shortcutsOpen: false })}>
            <I.x />
          </button>
        </header>
        <dl class="ws-shortcuts">
          {ROWS.map(([k, l]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{l[locale]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
