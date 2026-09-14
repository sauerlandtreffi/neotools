import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { bytesToBlob } from '../../lib/bytes-blob';
import { fmtBytes } from '../../lib/workspace/i18n';
import { activeFile, activeRef, headVersion, readRef } from '../../lib/workspace/store';
import { currentName } from '../../lib/workspace/step-stack';
import { I } from './Icons';

/** Non-PDF families in W2: image preview or a file card. Full canvases are W4. */
export default function GenericCanvas({ locale }: { locale: Locale }) {
  const file = activeFile.value;
  const ref = activeRef.value;
  const version = headVersion.value;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !ref || !file.mime.startsWith('image/')) {
      setUrl(null);
      return;
    }
    let dead = false;
    let obj: string | null = null;
    void readRef(ref).then((bytes) => {
      if (dead || !bytes) return;
      obj = URL.createObjectURL(bytesToBlob(bytes, file.mime));
      setUrl(obj);
    });
    return () => {
      dead = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [ref, version, file?.id]);
  if (!file) return null;
  return (
    <section class="ws-canvas" data-canvas data-generic>
      <div class="ws-canvas-scroll">
        <div class="ws-generic">
          {url ? (
            <img src={url} alt={currentName(file)} class="ws-generic-img" />
          ) : (
            <div class="card grid place-items-center gap-2 p-8 text-center">
              <I.file size={40} />
              <strong>{currentName(file)}</strong>
              <span class="text-sm" style={{ color: 'var(--muted)' }}>
                {file.mime} · {fmtBytes(file.size)}
              </span>
              <span class="text-xs" style={{ color: 'var(--faint)' }}>
                {locale === 'de' ? 'Vorschau für diesen Typ folgt (W4). Werkzeuge oben funktionieren bereits.' : 'Preview for this type is coming (W4). Tools above already work.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
