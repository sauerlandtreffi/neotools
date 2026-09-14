import { describe, expect, it } from 'vitest';
import {
  FFMPEG_CORE_LICENSE_GPL,
  FFMPEG_CORE_LICENSE_LGPL,
  MEDIA_LICENSES,
  getFfmpegCoreLicense,
  refreshMediaLicenses,
} from '../src/licenses.js';
import { setFfmpegCoreFlavor } from '../src/ffmpeg/core-flavor.js';

describe('media licenses', () => {
  it('switches the core SPDX label with the loaded flavor', () => {
    setFfmpegCoreFlavor('gpl');
    refreshMediaLicenses();
    expect(getFfmpegCoreLicense()).toBe(FFMPEG_CORE_LICENSE_GPL);
    expect(MEDIA_LICENSES.some((l) => l.license === FFMPEG_CORE_LICENSE_GPL)).toBe(true);

    setFfmpegCoreFlavor('lgpl');
    refreshMediaLicenses();
    expect(getFfmpegCoreLicense()).toBe(FFMPEG_CORE_LICENSE_LGPL);
    expect(MEDIA_LICENSES.some((l) => l.license === FFMPEG_CORE_LICENSE_LGPL)).toBe(true);
    expect(MEDIA_LICENSES.some((l) => l.license === FFMPEG_CORE_LICENSE_GPL)).toBe(false);
    expect(MEDIA_LICENSES.find((l) => l.license === FFMPEG_CORE_LICENSE_LGPL)?.name).toMatch(/eigener Build/);
  });
});
