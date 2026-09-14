import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { downloadBytes, zipDownload } from '../../lib/worker-client';
import { fmtBytes, w } from '../../lib/workspace/i18n';
import { activeFile, activeName, busy, collectExport, runStep, setUi, shareSafeChecklist, shareSafeState, toast, tools, workspace } from '../../lib/workspace/store';
import type { ExportSpec } from '../../lib/workspace/types';
import { I } from './Icons';
import VerifySeal from './VerifySeal';

export default function ExportDrawer({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const file = activeFile.value;
  const [spec, setSpec] = useState<ExportSpec>({
    what: 'head',
    format: 'original',
    name: activeName.value ?? 'export.pdf',
    includeProvenance: false,
    target: 'download',
  });
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSpec((p) => ({ ...p, name: activeName.value ?? p.name }));
  }, [activeName.value]);

  if (!s.exportOpen || !file) return null;
  const safe = shareSafeState(file);
  const checklist = shareSafeChecklist(file).filter((c) => c.present);
  const canCheck = tools.value.some((t) => t.view.id === 'forensics-share-safe');
  const selectedCount = s.selectedFileIds.length;
  const total = s.session?.files.length ?? 0;
  const multi = spec.what !== 'head' || spec.includeProvenance;
  const headSize = file.head < 0 ? file.size : file.revisions[file.head]?.outputSize ?? file.size;

  const run = async () => {
    setRunning(true);
    try {
      const items = await collectExport(spec);
      if (!items.length) {
        toast('warn', locale === 'de' ? 'Nichts zu exportieren.' : 'Nothing to export.');
        return;
      }
      if (spec.target === 'picker' && s.desktop) {
        const { getDesktop } = await import('../../lib/desktop');
        const desktop = await getDesktop();
        for (const it of items) {
          const path = await desktop.pickSavePath(it.name);
          if (path) await desktop.saveFile(path, it.data);
        }
      } else if (spec.format === 'zip' || items.length > 1) {
        await zipDownload(items, `${spec.name.replace(/\.[^.]+$/, '') || 'neotools'}.zip`);
      } else {
        const it = items[0]!;
        downloadBytes(spec.name || it.name, it.data, it.mime);
      }
      toast('ok', locale === 'de' ? 'Export gestartet.' : 'Export started.');
      setUi({ exportOpen: false });
    } catch (err) {
      toast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div class="ws-drawer-backdrop" onClick={() => setUi({ exportOpen: false })}>
      <aside class="ws-drawer nt-slide-up" role="dialog" aria-modal="true" aria-label={w(locale, 'exportTitle')} data-export-drawer onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="font-medium">{w(locale, 'exportTitle')}</span>
          <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'close')} onClick={() => setUi({ exportOpen: false })}>
            <I.x />
          </button>
        </header>
        <div class="grid gap-4 p-4">
          <div class="ws-sharesafe" data-safe={safe} data-sharesafe-light={safe}>
            <div class="flex items-center gap-2">
              <span class="ws-light" data-light={safe} aria-hidden="true" />
              <VerifySeal locale={locale} verification={file.head >= 0 ? file.revisions[file.head]?.verification : undefined} compact={false} />
              {canCheck && (
                <button
                  type="button"
                  class="btn btn-sm ml-auto"
                  disabled={busy.value}
                  data-sharesafe-check
                  onClick={() => void runStep('forensics-share-safe', {}, { selection: {}, label: w(locale, 'shareSafeCheck') })}
                >
                  {busy.value ? <I.spinner size={13} /> : <I.eye size={13} />} {w(locale, 'shareSafeCheck')}
                </button>
              )}
            </div>
            <p class="text-xs" style={{ color: 'var(--muted)' }}>
              {w(locale, 'shareSafe')}: {safe === 'yes' ? w(locale, 'shareSafeYes') : safe === 'no' ? w(locale, 'shareSafeNo') : w(locale, 'shareSafeUnknown')}
            </p>
            {checklist.length > 0 && (
              <ul class="ws-checklist" data-sharesafe-list>
                {checklist.map((c) => (
                  <li key={c.id} data-severity={c.severity}>
                    <I.warn size={12} /> {c.label[locale] ?? c.label.de}
                  </li>
                ))}
              </ul>
            )}
            {safe === 'no' && (
              <p class="text-xs" role="status" style={{ color: 'var(--warn-text)' }}>
                {w(locale, 'shareSafeBanner')}
              </p>
            )}
          </div>

          <div class="grid gap-1" role="radiogroup" aria-label={w(locale, 'export')}>
            {(
              [
                ['head', w(locale, 'whatHead'), 1],
                ['selected', `${w(locale, 'whatSelected')} (${selectedCount})`, selectedCount],
                ['all', `${w(locale, 'whatAll')} (${total})`, total],
              ] as Array<[ExportSpec['what'], string, number]>
            ).map(([what, label, n]) => (
              <label key={what} class="flex items-center gap-2 text-sm" data-disabled={n === 0}>
                <input type="radio" name="what" checked={spec.what === what} disabled={n === 0} onChange={() => setSpec({ ...spec, what })} />
                {label}
              </label>
            ))}
          </div>

          <label class="grid gap-1">
            <span class="label">{w(locale, 'fileName')}</span>
            <input class="field" value={spec.name} disabled={spec.what !== 'head'} data-export-name onInput={(e) => setSpec({ ...spec, name: (e.target as HTMLInputElement).value })} />
            <span class="text-xs tnum" style={{ color: 'var(--faint)' }}>
              {fmtBytes(headSize)}
            </span>
          </label>

          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={spec.includeProvenance} onChange={(e) => setSpec({ ...spec, includeProvenance: (e.target as HTMLInputElement).checked })} />
            {w(locale, 'includeProvenance')}
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={spec.format === 'zip' || multi} disabled={multi} onChange={(e) => setSpec({ ...spec, format: (e.target as HTMLInputElement).checked ? 'zip' : 'original' })} />
            {w(locale, 'zipBundle')}
          </label>
        </div>
        <footer class="ws-options-foot flex gap-2">
          {s.desktop && (
            <button type="button" class="btn flex-1" disabled={running} onClick={() => void (setSpec({ ...spec, target: 'picker' }), run())}>
              {w(locale, 'saveAs')}
            </button>
          )}
          <button type="button" class="btn btn-primary flex-1" disabled={running} data-export-download onClick={() => void run()}>
            {running ? <I.spinner size={14} /> : <I.export size={14} />} {w(locale, 'download')}
          </button>
        </footer>
      </aside>
    </div>
  );
}
