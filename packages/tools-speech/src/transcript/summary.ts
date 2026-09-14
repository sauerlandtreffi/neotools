export interface ActionItem {
  text: string;
  source?: string;
}

export interface MeetingNotes {
  summary: string;
  actionItems: ActionItem[];
  language: string;
}

const ACTION_RE =
  /\b(TODO|Action(?:\s*item)?|follow[- ]?up|we should|let'?s|please|bitte|müssen wir|müssen Sie|bitte um|nächster schritt|action:)\b/i;

export function extractiveSummary(text: string, maxSentences = 5): string {
  const parts = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= maxSentences) return parts.join(' ');
  const scored = parts.map((s, i) => ({
    s,
    score: (s.length > 40 ? 1 : 0.4) + (i === 0 ? 0.5 : 0) + (ACTION_RE.test(s) ? 0.8 : 0),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map((x) => x.s)
    .join(' ');
}

export function extractActionItems(text: string): ActionItem[] {
  const items: ActionItem[] = [];
  for (const line of text.split(/\n|(?<=[.!?])\s+/)) {
    const t = line.trim();
    if (!t) continue;
    if (ACTION_RE.test(t) || /^[-*]\s+/.test(t)) items.push({ text: t.replace(/^[-*]\s+/, '') });
  }
  return items;
}

export function notesFromText(text: string, language: string): MeetingNotes {
  return {
    summary: extractiveSummary(text),
    actionItems: extractActionItems(text),
    language,
  };
}

interface WebLlmEngine {
  chat: {
    completions: {
      create: (o: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

export interface LocalLlm {
  id: string;
  generate(prompt: string, opts?: { maxTokens?: number }): Promise<string>;
}

/** Optional WebLLM slot — only loaded if @mlc-ai/web-llm is installed and WebGPU is present. */
export async function tryWebLlm(): Promise<LocalLlm | null> {
  try {
    const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (!hasGpu) return null;
    const mod = (await import('@mlc-ai/web-llm')) as {
      CreateMLCEngine?: (model: string) => Promise<WebLlmEngine>;
    };
    if (typeof mod.CreateMLCEngine !== 'function') return null;
    const engine = await mod.CreateMLCEngine('Qwen2.5-1.5B-Instruct-q4f16_1');
    return {
      id: 'Qwen2.5-1.5B-Instruct-q4f16_1',
      async generate(prompt, opts) {
        const res = await engine.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts?.maxTokens ?? 256,
        });
        return res.choices[0]?.message.content ?? '';
      },
    };
  } catch {
    return null;
  }
}
