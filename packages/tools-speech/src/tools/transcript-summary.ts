import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { notesFromText, tryWebLlm } from '../transcript/summary.js';
import { translateTexts } from '../translate/marian.js';
import { openPipeline } from '../whisper/transformers.js';
import { SPEECH_LICENSES, TRANSCRIPT_ACCEPT } from '../licenses.js';
import { loadTranscript, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  language: z.enum(['auto', 'en', 'de']).default('auto'),
  useWebLlm: z.boolean().default(false),
  confirmModelDownload: z.boolean().default(false),
});

export const transcriptSummary = defineTool({
  id: 'transcript-summary',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Meeting-Notes', en: 'Meeting notes' },
  description: {
    de: 'Zusammenfassung + Action-Items lokal (DistilBART für EN; DE über Marian). Optional WebLLM-Slot (Qwen 1.5B, WebGPU).',
    en: 'Local summary + action items (DistilBART for EN; DE via Marian). Optional WebLLM slot (Qwen 1.5B, WebGPU).',
  },
  inputs: { accept: TRANSCRIPT_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['meeting notes', 'zusammenfassung', 'action items'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) throw new Error('Kein Transkript.');
    const t = await loadTranscript(file);
    const text = t.segments.map((s) => s.text).join(' ');
    let lang = parsed.language === 'auto' ? t.language : parsed.language;
    if (lang !== 'en' && lang !== 'de') lang = /[äöüß]/i.test(text) ? 'de' : 'en';

    let english = text;
    if (lang === 'de') {
      try {
        const [tr] = await translateTexts([text.slice(0, 4000)], 'de-en', ctx, parsed.confirmModelDownload);
        english = tr ?? text;
      } catch (err) {
        ctx.log('warn', err instanceof Error ? err.message : String(err));
      }
    }

    let summaryEn = notesFromText(english, 'en').summary;
    try {
      const { pipe } = await openPipeline(
        'distilbart-cnn-6-6',
        'summarization',
        ctx.platform,
        ctx,
        parsed.confirmModelDownload,
      );
      const raw = await pipe(english.slice(0, 4000));
      const list = Array.isArray(raw) ? raw : [raw];
      summaryEn = String((list[0] as { summary_text?: string })?.summary_text ?? summaryEn);
    } catch (err) {
      ctx.log('warn', `DistilBART fehlt — extractive Fallback. ${err instanceof Error ? err.message : String(err)}`);
    }

    if (parsed.useWebLlm) {
      const llm = await tryWebLlm();
      if (llm) {
        summaryEn = await llm.generate(`Summarize and list action items:\n${english.slice(0, 3000)}`);
      } else {
        ctx.log('warn', 'WebLLM-Slot offen: @mlc-ai/web-llm nicht gebündelt / kein WebGPU. Qwen2.5-1.5B-Instruct-q4f16_1 (~1 GB).');
      }
    }

    let summary = summaryEn;
    if (lang === 'de') {
      try {
        const [tr] = await translateTexts([summaryEn], 'en-de', ctx, parsed.confirmModelDownload);
        summary = tr ?? summaryEn;
      } catch {
        // keep EN
      }
    }

    const notes = notesFromText(lang === 'de' ? text : english, lang);
    notes.summary = summary;
    const md = `# Meeting-Notes\n\n${summary}\n\n## Action Items\n${notes.actionItems.map((a) => `- ${a.text}`).join('\n')}\n`;
    const base = stem(file.name);
    return {
      outputs: [
        textFile(`${base}-notes.json`, `${JSON.stringify(notes, null, 2)}\n`, 'application/json'),
        textFile(`${base}-notes.md`, md, 'text/markdown'),
      ],
      warnings: [],
      report: await provenanceReport('transcript-summary', parsed, files, { notes, webllm: parsed.useWebLlm }),
    };
  },
});
