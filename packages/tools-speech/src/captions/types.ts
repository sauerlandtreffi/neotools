export interface CueWord {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
  words?: CueWord[];
  speaker?: string;
  index?: number;
}

export interface CaptionDoc {
  format: CaptionFormat;
  cues: Cue[];
  language?: string;
  header?: string;
}

export type CaptionFormat = 'srt' | 'vtt' | 'ass' | 'sbv' | 'ttml' | 'lrc' | 'json' | 'txt' | 'tsv';

export interface CueLayout {
  maxLineLength: number;
  maxLines: number;
  maxCueDuration: number;
  preferSentenceBoundaries: boolean;
}

export const DEFAULT_LAYOUT: CueLayout = {
  maxLineLength: 42,
  maxLines: 2,
  maxCueDuration: 7,
  preferSentenceBoundaries: true,
};

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
  speaker?: string;
}

export interface Transcript {
  language: string;
  segments: TranscriptSegment[];
}

export function transcriptToCues(t: Transcript): Cue[] {
  return t.segments.map((s, i) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    words: s.words,
    speaker: s.speaker,
    index: i + 1,
  }));
}

export function cuesToTranscript(cues: Cue[], language = 'und'): Transcript {
  return {
    language,
    segments: cues.map((c) => ({
      start: c.start,
      end: c.end,
      text: c.text,
      words: c.words,
      speaker: c.speaker,
    })),
  };
}
