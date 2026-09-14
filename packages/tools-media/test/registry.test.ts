import { describe, expect, it } from 'vitest';
import { createMediaRegistry, mediaTools } from '../src/index.js';

const expected = [
  'video-convert',
  'video-edit',
  'video-compress',
  'video-trim',
  'video-mute',
  'video-resize',
  'video-crop',
  'video-split',
  'video-join',
  'video-replace-audio',
  'video-reverse',
  'video-boomerang',
  'video-speed',
  'video-watermark',
  'video-subtitles-burn',
  'video-subtitles-extract',
  'video-to-gif',
  'gif-to-video',
  'video-to-frames',
  'video-unpack',
  'video-repair',
  'video-contact-sheet',
  'video-restore',
  'video-brighten-denoise',
  'video-remux',
  'video-fps',
  'video-flags',
  'video-hdr-to-sdr',
  'video-detect',
  'video-chapters',
  'video-audio-tracks',
  'video-loop',
  'video-pip',
  'video-thumbnails',
  'audio-convert',
  'audio-edit',
  'audio-normalize',
  'audio-join',
  'audio-trim',
  'audio-split',
  'audio-mono',
  'audio-volume',
  'audio-fade',
  'audio-remove-silence',
  'audio-ducking',
  'audio-bleep',
  'audio-eq-presets',
  'audio-limiter-dc',
  'audio-replaygain',
  'audio-dither',
  'audio-crossfade-playlist',
  'audio-ringtone',
  'audio-spectrogram',
  'audio-waveform-poster',
  'audio-mid-side',
  'audio-center-remove',
  'audio-cover-art',
  'audio-voice-notes',
  'audio-key-bpm',
  'audio-anonymize-voice',
  'audio-stems',
];

describe('media registry', () => {
  it('registers pack media with video/audio categories', () => {
    const reg = createMediaRegistry();
    expect(reg.ids().sort()).toEqual([...expected].sort());
    expect(mediaTools.every((t) => t.pack === 'media')).toBe(true);
    expect(reg.byCategory('video').length).toBeGreaterThan(20);
    expect(reg.byCategory('audio').length).toBeGreaterThan(20);
    expect(reg.get('audio-stems')?.description.de).toMatch(/Offen/);
  });
});
