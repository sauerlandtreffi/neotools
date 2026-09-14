import { useEffect } from 'preact/hooks';
import { localePath, type Locale } from '../lib/i18n';
import { getDesktop } from '../lib/desktop';

interface Props {
  locale: Locale;
}

export default function ReaderBoot({ locale }: Props) {
  useEffect(() => {
    let stop: () => void = () => {};
    void (async () => {
      const desktop = await getDesktop();
      if (!desktop.available) return;
      stop = await desktop.listenOpenFile(() => {
        const here = location.pathname.replace(/\/$/, '') || '/';
        const reader = localePath(locale, '/reader');
        if (here !== reader) location.assign(`${reader}?desktop=1`);
      });
    })();
    return () => stop();
  }, [locale]);
  return null;
}
