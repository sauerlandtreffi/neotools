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
    // Legacy PWA handler / share-target entry: park the file in the handoff slot
    // and continue in the workspace (FRONTEND-REDESIGN §3.5).
    const send = async (file: File) => {
      if (!isPdf(file) && !file.type.startsWith('image/')) return false;
      await putHandoff({
        name: file.name,
        mime: isPdf(file) ? 'application/pdf' : file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      location.assign(`${localePath(locale, '/app')}?open=1`);
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
