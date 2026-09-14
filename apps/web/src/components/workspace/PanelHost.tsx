import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { setUi, type Panel } from '../../lib/workspace/store';
import { I } from './Icons';

interface Props {
  locale: Locale;
  panel: Exclude<Panel, null>;
  licensePubkey: string;
  licenseEmbedded: string;
}

interface PipelineCatalog {
  catalog: unknown[];
  library: unknown;
  required: unknown[];
}

/**
 * Program panels that used to be their own pages (pivot §11.1/7):
 * File → Sessions… (/verlauf), Tools → Automate… (/pipeline), File → Watch folder… (/watch).
 * Loaded lazily; the shell bundle does not carry them.
 */
export default function PanelHost({ locale, panel, licensePubkey, licenseEmbedded }: Props) {
  const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setComp(null);
    setError(null);
    (async () => {
      if (panel === 'history') {
        const [{ default: HistoryApp }, { default: SessionsList }] = await Promise.all([import('../HistoryApp'), import('../SessionsList')]);
        if (!alive) return;
        setComp(() => (p: Record<string, unknown>) => (
          <div class="grid gap-6">
            <SessionsList locale={p.locale as Locale} />
            <HistoryApp locale={p.locale as Locale} />
          </div>
        ));
        setProps({ locale });
      } else if (panel === 'pipeline') {
        const [{ default: PipelineBuilder }, res] = await Promise.all([import('../PipelineBuilder'), fetch('/pipeline-catalog.json', { credentials: 'same-origin' })]);
        if (!alive) return;
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as PipelineCatalog;
        setComp(() => PipelineBuilder as unknown as ComponentType<Record<string, unknown>>);
        setProps({
          locale,
          catalogJson: JSON.stringify(data.catalog),
          libraryJson: JSON.stringify(data.library),
          requiredJson: JSON.stringify(data.required),
        });
      } else {
        const { default: WatchApp } = await import('../WatchApp');
        if (!alive) return;
        setComp(() => WatchApp as unknown as ComponentType<Record<string, unknown>>);
        setProps({ locale, pubkey: licensePubkey, embedded: licenseEmbedded });
      }
    })().catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [panel, locale]);

  const title = panel === 'history' ? w(locale, 'sessions') : panel === 'pipeline' ? w(locale, 'automate').replace(/…$/, '') : w(locale, 'watchFolder').replace(/…$/, '');

  return (
    <div class="ws-drawer-backdrop" onClick={() => setUi({ panel: null })}>
      <section class="ws-panel-dialog nt-pop" role="dialog" aria-modal="true" aria-label={title} data-panel={panel} onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="ws-panel-title">{title}</span>
          <button type="button" class="ws-icon-btn ml-auto" aria-label={w(locale, 'close')} onClick={() => setUi({ panel: null })}>
            <I.x size={15} />
          </button>
        </header>
        <div class="ws-panel-body">
          {error ? (
            <p class="text-sm" style={{ color: 'var(--warn-text)' }}>
              {error}
            </p>
          ) : Comp ? (
            <Comp {...props} />
          ) : (
            <p class="text-sm" style={{ color: 'var(--muted)' }}>
              <I.spinner size={14} /> {w(locale, 'loading')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
