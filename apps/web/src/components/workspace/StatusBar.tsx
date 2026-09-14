import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { fmtBytes, w, type WKey } from '../../lib/workspace/i18n';
import { activeFile, cancelJobs, jobs, kindOf, workspace } from '../../lib/workspace/store';
import type { WorkspaceKind } from '../../lib/workspace/sniff';
import { currentName } from '../../lib/workspace/step-stack';
import { setTheme } from './MenuBar';
import { I } from './Icons';
import { toolsForFile } from './toolbar-model';
import TrustBadge from './TrustBadge';

export function kindLabelKey(kind: WorkspaceKind): WKey {
  switch (kind) {
    case 'pdf':
      return 'kindPdf';
    case 'image':
      return 'kindImage';
    case 'audio':
      return 'kindAudio';
    case 'video':
      return 'kindVideo';
    case 'office':
      return 'kindOffice';
    case 'archive':
      return 'kindArchive';
    case 'data':
      return 'kindData';
    default:
      return 'kindUnknown';
  }
}

/**
 * Bottom status bar (pivot §11.1/4): file info · local badge · job progress ·
 * language/theme. In the embedded (not expanded) state it also carries the
 * quiet scroll hint to the explanation below.
 */
export default function StatusBar({ locale, showScrollHint }: { locale: Locale; showScrollHint: boolean }) {
  const s = workspace.value;
  const file = activeFile.value;
  const active = jobs.value.filter((j) => j.status === 'running' || j.status === 'queued');
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const kind = kindOf(file);
  const size = file ? (file.head < 0 ? file.size : file.revisions[file.head]?.outputSize ?? file.size) : 0;
  const count = file ? toolsForFile(file).length : 0;
  const job = active.find((j) => j.status === 'running') ?? active[0];
  const ratio = active.length ? active.reduce((n, j) => n + j.ratio, 0) / active.length : 0;

  return (
    <footer class="ws-statusbar" data-statusbar>
      <div class="ws-status-left">
        {file ? (
          <>
            <span class="ws-status-kind" data-kind={kind}>
              {w(locale, kindLabelKey(kind))}
            </span>
            <span class="truncate" title={currentName(file)} data-status-file>
              {currentName(file)}
            </span>
            <span class="tnum ws-hide-mobile">{fmtBytes(size)}</span>
            {file.pages ? (
              <span class="tnum ws-hide-mobile">
                {file.pages} {w(locale, 'pagesUnit')}
              </span>
            ) : null}
            <span class="tnum ws-hide-mobile" data-tool-count={count}>
              {w(locale, 'toolCount', { n: count })}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>{w(locale, 'ready')}</span>
        )}
      </div>
      <div class="ws-status-mid" role="status" aria-live="polite" data-jobdock={active.length ? 'true' : undefined}>
        {job && (
          <>
            <I.spinner size={12} />
            <span class="truncate">{job.label}</span>
            {job.message && <span class="truncate ws-hide-mobile" style={{ color: 'var(--muted)' }}>{job.message}</span>}
            <span class="ws-status-progress" aria-hidden="true">
              <span style={{ width: `${Math.round(ratio * 100)}%` }} />
            </span>
            <button type="button" class="ws-status-btn" onClick={() => void cancelJobs()}>
              {w(locale, 'cancel')}
            </button>
          </>
        )}
      </div>
      <div class="ws-status-right">
        <TrustBadge locale={locale} compact />
        {s.policyLabel && (
          <span class="ws-status-policy ws-hide-mobile" title={locale === 'de' ? 'Team-Richtlinie aktiv' : 'Team policy active'}>
            {s.policyLabel}
          </span>
        )}
        <a
          href={`${locale === 'de' ? '/en' : '/'}${typeof location !== 'undefined' ? location.search : ''}`}
          hreflang={locale === 'de' ? 'en' : 'de'}
          class="ws-status-btn mono uppercase"
          title={w(locale, 'language')}
        >
          {locale === 'de' ? 'EN' : 'DE'}
        </a>
        <button
          type="button"
          class="ws-status-btn"
          aria-label={dark ? w(locale, 'lightMode') : w(locale, 'darkMode')}
          aria-pressed={dark}
          title={dark ? w(locale, 'lightMode') : w(locale, 'darkMode')}
          data-theme-toggle
          onClick={() => setTheme(!dark)}
        >
          {dark ? <I.sun size={13} /> : <I.moon size={13} />}
        </button>
        {showScrollHint && (
          <a href="#inside" class="ws-status-btn ws-scroll-hint" data-scroll-hint>
            {w(locale, 'whatsInside')} <I.arrowDown size={12} />
          </a>
        )}
      </div>
    </footer>
  );
}
