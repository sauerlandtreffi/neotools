import type { Locale } from '@neotools/engine';
import type { ConversionEdge, FormatRecord } from '../data/formats';

export interface FaqItem {
  q: Record<Locale, string>;
  a: Record<Locale, string>;
}

export function formatFaq(format: FormatRecord, conversions: readonly ConversionEdge[]): FaqItem[] {
  const available = conversions.filter((edge) => edge.from === format.id && edge.status === 'available');
  const items: FaqItem[] = [
    {
      q: {
        de: `Was ist ${format.names.de}?`,
        en: `What is ${format.names.en}?`,
      },
      a: format.typicalUse,
    },
    {
      q: {
        de: `Ist ${format.names.de} verlustbehaftet?`,
        en: `Is ${format.names.en} lossy?`,
      },
      a: {
        de: format.lossy && format.lossless
          ? 'Beides möglich — je nach Kodierung.'
          : format.lossy
            ? 'Ja, typischerweise verlustbehaftet.'
            : 'Nein, das Format ist verlustfrei.',
        en: format.lossy && format.lossless
          ? 'Both are possible, depending on the encoding.'
          : format.lossy
            ? 'Yes, typically lossy.'
            : 'No, the format is lossless.',
      },
    },
    {
      q: {
        de: `Kann der Browser ${format.names.de} lesen?`,
        en: `Can the browser decode ${format.names.en}?`,
      },
      a: {
        de: `Chrome: ${format.browserSupport.decode.chrome}, Firefox: ${format.browserSupport.decode.firefox}, Safari: ${format.browserSupport.decode.safari}.`,
        en: `Chrome: ${format.browserSupport.decode.chrome}, Firefox: ${format.browserSupport.decode.firefox}, Safari: ${format.browserSupport.decode.safari}.`,
      },
    },
  ];
  if (available.length) {
    items.push({
      q: {
        de: `Wie konvertiere ich ${format.names.de} lokal?`,
        en: `How do I convert ${format.names.en} locally?`,
      },
      a: {
        de: `Ohne Upload: ${available.map((edge) => `${edge.from}→${edge.to}`).slice(0, 5).join(', ')}.`,
        en: `Without upload: ${available.map((edge) => `${edge.from}→${edge.to}`).slice(0, 5).join(', ')}.`,
      },
    });
  } else {
    items.push({
      q: {
        de: `Gibt es schon ein Tool für ${format.names.de}?`,
        en: `Is there already a tool for ${format.names.en}?`,
      },
      a: {
        de: 'Ein passendes Werkzeug ist in Vorbereitung. Die Seite bleibt als Steckbrief.',
        en: 'A matching tool is in preparation. This page stays as a fact sheet.',
      },
    });
  }
  if (format.patentNotes) {
    items.push({
      q: {
        de: 'Gibt es Lizenz- oder Patenthinweise?',
        en: 'Are there licensing or patent notes?',
      },
      a: format.patentNotes,
    });
  }
  if (format.faq?.length) items.push(...format.faq);
  return items.slice(0, 5);
}

export function convertFaq(from: FormatRecord, to: FormatRecord, available: boolean): FaqItem[] {
  return [
    {
      q: {
        de: `Wie wandle ich ${from.names.de} nach ${to.names.de} um — ohne Upload?`,
        en: `How do I convert ${from.names.en} to ${to.names.en} without upload?`,
      },
      a: {
        de: available
          ? 'Datei in die Fläche legen, Optionen prüfen, ausführen. Die Datei bleibt im Browser.'
          : 'Das Werkzeug ist noch nicht registriert. Die Seite erklärt das Paar; sobald das Pack hängt, lädt die Insel automatisch.',
        en: available
          ? 'Drop the file, check options, run. The file stays in the browser.'
          : 'The tool is not registered yet. This page explains the pair; once the pack is attached, the island loads automatically.',
      },
    },
    {
      q: {
        de: `Geht Qualität verloren (${from.id} → ${to.id})?`,
        en: `Is quality lost (${from.id} → ${to.id})?`,
      },
      a: {
        de: to.lossy && !from.lossy
          ? 'Ja — das Zielformat ist verlustbehaftet. Ein verlustfreies Ziel wählen, wenn jedes Pixel zählen soll.'
          : to.lossless
            ? 'Das Ziel kann verlustfrei speichern; Container und Codec trotzdem prüfen.'
            : 'Beide Seiten können verlustbehaftet sein. Presets nutzen und vergleichen.',
        en: to.lossy && !from.lossy
          ? 'Yes — the target is lossy. Pick a lossless target if every pixel matters.'
          : to.lossless
            ? 'The target can store losslessly; still check container and codec.'
            : 'Both sides can be lossy. Use presets and compare.',
      },
    },
    {
      q: {
        de: 'Werden Metadaten mitkopiert?',
        en: 'Are metadata copied along?',
      },
      a: {
        de: from.metadataSupport.exif || to.metadataSupport.exif
          ? 'EXIF/XMP/ICC sind formatabhängig. Für Versand lieber sanitize/strip nutzen, nicht stillschweigend annehmen.'
          : 'Diese Formate tragen kaum EXIF. Trotzdem keine Annahme: Inhalt und Container prüfen.',
        en: from.metadataSupport.exif || to.metadataSupport.exif
          ? 'EXIF/XMP/ICC depend on the format. For sharing, sanitize/strip — do not assume silence.'
          : 'These formats carry little EXIF. Still do not assume: check content and container.',
      },
    },
  ];
}
