import { useRef, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { fmtBytes, w } from '../../lib/workspace/i18n';
import {
  activateFile,
  addBrowserFiles,
  removeFile,
  toggleSelectFile,
  workspace,
} from '../../lib/workspace/store';
import { currentName } from '../../lib/workspace/step-stack';
import { I } from './Icons';

export default function FileTray({ locale, onClose }: { locale: Locale; onClose?: () => void }) {
  const s = workspace.value;
  const session = s.session;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const files = session?.files ?? [];

  return (
    <aside class="ws-tray" aria-label={w(locale, 'files')} data-tray>
      <header class="ws-panel-head">
        <span class="stamp">{w(locale, 'files')}</span>
        <span class="mono text-xs" style={{ color: 'var(--faint)' }}>
          {files.length}
        </span>
        <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'add')} onClick={() => input.current?.click()}>
          <I.plus />
        </button>
        {onClose && (
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'close')} onClick={onClose}>
            <I.x />
          </button>
        )}
      </header>
      <input
        ref={input}
        type="file"
        multiple
        class="sr-only"
        data-tray-input
        onChange={(e) => {
          const list = Array.from((e.target as HTMLInputElement).files ?? []);
          (e.target as HTMLInputElement).value = '';
          void addBrowserFiles(list);
        }}
      />
      <ul class="ws-tray-list" role="listbox" aria-multiselectable="true">
        {files.map((f) => {
          const active = f.id === session?.activeFileId;
          const selected = s.selectedFileIds.includes(f.id);
          const steps = f.revisions.filter((r) => r.status === 'ok').length;
          const size = f.head < 0 ? f.size : f.revisions[f.head]?.outputSize ?? f.size;
          return (
            <li
              key={f.id}
              class="ws-tray-item"
              role="option"
              aria-selected={active}
              data-active={active}
              data-file-id={f.id}
            >
              <input
                type="checkbox"
                class="ws-tray-check"
                checked={selected}
                aria-label={`${f.name} ${w(locale, 'whatSelected')}`}
                onChange={() => toggleSelectFile(f.id)}
              />
              <button type="button" class="ws-tray-main" onClick={() => void activateFile(f.id)} title={currentName(f)}>
                <span class="ws-tray-icon" data-family={f.family ?? 'other'}>
                  <I.file size={18} />
                </span>
                <span class="min-w-0 flex-1 text-left">
                  <span class="block truncate text-sm font-medium">{currentName(f)}</span>
                  <span class="block truncate text-xs tnum" style={{ color: 'var(--muted)' }}>
                    {fmtBytes(size)}
                    {f.pages ? ` · ${f.pages} S.` : ''}
                    {steps ? ` · ${steps} ${w(locale, 'steps').toLowerCase()}` : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-icon ws-tray-remove"
                aria-label={`${w(locale, 'remove')}: ${f.name}`}
                onClick={() => void removeFile(f.id)}
              >
                <I.x size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        class="ws-dropzone"
        data-over={over}
        data-tray-drop
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
        <I.plus size={18} />
        <span class="text-sm">{w(locale, 'dropHere')}</span>
        <span class="text-xs" style={{ color: 'var(--muted)' }}>
          {w(locale, 'dropHint')} <u>{w(locale, 'chooseFiles')}</u>
        </span>
      </button>
      <footer class="ws-tray-foot">
        <span class="badge-local">
          <span class="dot" /> {w(locale, 'local')}
        </span>
        <span class="tnum text-xs" style={{ color: 'var(--faint)' }}>
          {fmtBytes(session?.bytes ?? 0)}
        </span>
      </footer>
    </aside>
  );
}
