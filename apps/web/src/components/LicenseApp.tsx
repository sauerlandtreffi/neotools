import { useEffect, useState } from 'preact/hooks';
import { hasFeature, type LicenseVerifyResult } from '@neotools/license';
import { t, type Locale } from '../lib/i18n';
import { clearLicenseToken, loadLicenseToken, saveLicenseToken, verifyStoredLicense } from '../lib/license-store';

interface Props {
  locale: Locale;
  pubkey: string;
  embedded: string;
}

export default function LicenseApp({ locale, pubkey, embedded }: Props) {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<LicenseVerifyResult | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await loadLicenseToken();
      setToken(stored || embedded);
      setResult(await verifyStoredLicense(pubkey, embedded));
    })();
  }, [embedded, pubkey]);

  const verify = async () => {
    await saveLicenseToken(token.trim());
    setResult(await verifyStoredLicense(pubkey, embedded));
  };

  return (
    <div class="grid max-w-2xl gap-4" data-license-page>
      <p style={{ color: 'var(--muted)' }}>{t(locale, 'licenseFreePromise')}</p>
      <label class="block">
        <span class="stamp">{t(locale, 'licensePaste')}</span>
        <textarea
          class="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', minHeight: '7rem' }}
          data-license-token
          value={token}
          onInput={(e) => setToken((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <div class="flex gap-3">
        <button
          type="button"
          class="rounded-md px-4 py-2"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          data-license-verify
          onClick={verify}
        >
          {t(locale, 'licenseVerify')}
        </button>
        <button
          type="button"
          class="rounded-md border px-4 py-2"
          style={{ borderColor: 'var(--line)' }}
          onClick={async () => {
            await clearLicenseToken();
            setToken('');
            setResult(await verifyStoredLicense(pubkey, embedded));
          }}
        >
          {t(locale, 'licenseClear')}
        </button>
      </div>
      {result && (
        <div data-license-status={result.ok ? 'ok' : 'fail'}>
          <p>
            <strong>{result.ok ? t(locale, 'licenseValid') : t(locale, 'licenseInvalid')}</strong>
            {result.ok ? ` · ${result.payload.plan} · ${result.payload.org}` : ` · ${result.error}`}
          </p>
          {result.grace && <p>{t(locale, 'licenseGrace')}</p>}
          {result.warnings.map((w) => (
            <p key={w} class="text-sm" style={{ color: 'var(--muted)' }}>
              {t(locale, 'licenseClock')}: {w}
            </p>
          ))}
          <ul class="mt-2 text-sm">
            {(['api', 'watch', 'presets', 'whitelabel', 'audit'] as const).map((f) => (
              <li key={f}>
                {f}: {hasFeature(f, result) ? '✓' : '—'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
