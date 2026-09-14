import { useEffect } from 'preact/hooks';
import { localePath, type Locale } from '../lib/i18n';
import { putHandoff } from '../lib/desktop-handoff';

interface Props {
  locale: Locale;
}

function isPdf(file: { name: string; type: string }): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function ReaderLaunch({ locale }: Props) {
  useEffect(() => {
    const send = async (file: File) => {
      if (!isPdf(file)) return false;
      await putHandoff(
        { name: file.name, mime: 'application/pdf', bytes: new Uint8Array(await file.arrayBuffer()) },
        { returnTo: 'reader' },
      );
      location.assign(`${localePath(locale, '/reader')}?open=1`);
      return true;
    };

    const w = window as Window & {
      launchQueue?: { setConsumer: (cb: (params: { files: FileSystemFileHandle[] }) => void) => void };
    };
    if (w.launchQueue) {
      w.launchQueue.setConsumer((params) => {
        void (async () => {
          const handle = params.files?.[0];
          if (!handle) return;
          const file = await handle.getFile();
          await send(file);
        })();
      });
    }
  }, [locale]);
  return null;
}
