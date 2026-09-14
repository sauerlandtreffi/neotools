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
      // Desktop double-click / "Öffnen" → workspace (FRONTEND-REDESIGN §6.6). The
      // workspace island reads the file itself via `read_opened_file` (`?desktop=1`).
      stop = await desktop.listenOpenFile(() => {
        const here = location.pathname.replace(/\/$/, '') || '/';
        const app = localePath(locale, '/app');
        if (here !== app) location.assign(`${app}?desktop=1`);
      });
    })();
    return () => stop();
  }, [locale]);
  return null;
}
