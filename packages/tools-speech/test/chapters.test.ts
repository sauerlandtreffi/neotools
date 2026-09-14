import { describe, expect, it } from 'vitest';
import { chaptersFromEmbeddings } from '../src/transcript/chapters.js';

describe('chapter segmentation', () => {
  it('splits on cosine-distance peaks of synthetic embeddings', () => {
    const topicA = [1, 0, 0];
    const topicB = [0, 1, 0];
    const sentences = [
      { start: 0, end: 1, text: 'Alpha eins.' },
      { start: 1, end: 2, text: 'Alpha zwei.' },
      { start: 2, end: 3, text: 'Alpha drei.' },
      { start: 10, end: 11, text: 'Beta eins ganz anderes Thema.' },
      { start: 11, end: 12, text: 'Beta zwei.' },
      { start: 12, end: 13, text: 'Beta drei.' },
    ];
    const embeddings = [topicA, topicA, topicA, topicB, topicB, topicB];
    const chapters = chaptersFromEmbeddings(sentences, embeddings, 1);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[0]!.text).toMatch(/Alpha/);
    expect(chapters[chapters.length - 1]!.text).toMatch(/Beta/);
  });
});
