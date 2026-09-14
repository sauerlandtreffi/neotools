import { useEffect, useState } from 'preact/hooks';
import { localePath, t, type Locale } from '../lib/i18n';
import { foreignTransferBytes, formatByteCount } from '../lib/network-bytes';

export default function NetworkStatus({ locale }: { locale: Locale }) {
  const [bytes, setBytes] = useState(0);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    const origin = location.origin;
    const tally = () => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      setBytes(foreignTransferBytes(entries, origin));
    };
    tally();
    const obs = new PerformanceObserver(() => tally());
    obs.observe({ type: 'resource', buffered: true });
    return () => obs.disconnect();
  }, []);

  return (
    <p class="mono text-xs" style={{ color: 'var(--muted)' }}>
      <span title={t(locale, 'bytesSentHint')}>{formatByteCount(bytes, locale)}</span>
      {' · '}
      <a href={localePath(locale, '/no-upload')}>{t(locale, 'noUpload')}</a>
    </p>
  );
}
