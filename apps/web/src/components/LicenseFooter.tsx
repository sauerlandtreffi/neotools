import { useEffect, useState } from 'preact/hooks';
import { verifyLicense } from '@neotools/license';
import { t, localePath, type Locale } from '../lib/i18n';
import { loadLicenseToken } from '../lib/license-store';

interface Props {
  locale: Locale;
  pubkey: string;
  embedded: string;
  showPoweredBy: boolean;
}

export default function LicenseFooter({ locale, pubkey, embedded, showPoweredBy }: Props) {
  const [label, setLabel] = useState(t(locale, 'licenseCommunity'));
  const [hidePowered, setHidePowered] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      const token = (await loadLicenseToken()) || embedded;
      const result = await verifyLicense(token, pubkey);
      if (result.ok && result.payload.plan !== 'community') {
        setLabel(`${result.payload.plan} · ${result.payload.org}`);
        setHidePowered(result.payload.features.includes('whitelabel'));
      } else {
        setLabel(t(locale, 'licenseCommunity'));
      }
    };
    void refresh();
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<string>('load-license-token', async (ev) => {
        const { saveLicenseToken } = await import('../lib/license-store');
        await saveLicenseToken(String(ev.payload).trim());
        await refresh();
      });
    });
    return () => unlisten?.();
  }, [embedded, locale, pubkey]);

  return (
    <span class="flex flex-wrap items-center gap-3">
      <a href={localePath(locale, locale === 'de' ? '/lizenz' : '/license')} data-license-footer>
        {t(locale, 'license')}: {label}
      </a>
      {showPoweredBy && !hidePowered && <span>{t(locale, 'poweredBy')}</span>}
    </span>
  );
}
