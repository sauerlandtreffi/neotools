import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { creatorPlatformPack } from './tools/creator-platform-pack.js';
import { creatorSpecCheck } from './tools/creator-spec-check.js';
import { creatorThumbnailFactory } from './tools/creator-thumbnail-factory.js';
import { creatorContactSheet } from './tools/creator-contact-sheet.js';
import { creatorBrandKit } from './tools/creator-brand-kit.js';
import { creatorAudiogram } from './tools/creator-audiogram.js';
import { creatorLyricVideo } from './tools/creator-lyric-video.js';
import { creatorKaraoke } from './tools/creator-karaoke.js';
import { creatorMemeCaptions } from './tools/creator-meme-captions.js';
import { creatorBeforeAfter } from './tools/creator-before-after.js';
import { creatorPodcastVideo } from './tools/creator-podcast-video.js';
import { creatorIntroOutro } from './tools/creator-intro-outro.js';
import { creatorStickerSet } from './tools/creator-sticker-set.js';
import { creatorMemeRatios } from './tools/creator-meme-ratios.js';
import { creatorCinemagraph } from './tools/creator-cinemagraph.js';
import { creatorCollage } from './tools/creator-collage.js';
import { creatorTimelapse } from './tools/creator-timelapse.js';
import { creatorMovieBarcode } from './tools/creator-movie-barcode.js';
import { creatorStoryboardPdf } from './tools/creator-storyboard-pdf.js';
import { creatorSocialCard } from './tools/creator-social-card.js';
import { creatorDeviceMockup } from './tools/creator-device-mockup.js';
import { creatorSpriteSheet } from './tools/creator-sprite-sheet.js';

export const creatorTools: ToolDefinition[] = [
  creatorPlatformPack,
  creatorSpecCheck,
  creatorThumbnailFactory,
  creatorContactSheet,
  creatorBrandKit,
  creatorAudiogram,
  creatorLyricVideo,
  creatorKaraoke,
  creatorMemeCaptions,
  creatorBeforeAfter,
  creatorPodcastVideo,
  creatorIntroOutro,
  creatorStickerSet,
  creatorMemeRatios,
  creatorCinemagraph,
  creatorCollage,
  creatorTimelapse,
  creatorMovieBarcode,
  creatorStoryboardPdf,
  creatorSocialCard,
  creatorDeviceMockup,
  creatorSpriteSheet,
];

export {
  creatorPlatformPack,
  creatorSpecCheck,
  creatorThumbnailFactory,
  creatorContactSheet,
  creatorBrandKit,
  creatorAudiogram,
  creatorLyricVideo,
  creatorKaraoke,
  creatorMemeCaptions,
  creatorBeforeAfter,
  creatorPodcastVideo,
  creatorIntroOutro,
  creatorStickerSet,
  creatorMemeRatios,
  creatorCinemagraph,
  creatorCollage,
  creatorTimelapse,
  creatorMovieBarcode,
  creatorStoryboardPdf,
  creatorSocialCard,
  creatorDeviceMockup,
  creatorSpriteSheet,
};

export function registerCreatorTools(registry: Registry): Registry {
  for (const tool of creatorTools) registry.register(tool);
  return registry;
}

export function createCreatorRegistry(): Registry {
  return registerCreatorTools(new Registry());
}

export { CREATOR_LICENSES, CREATOR_CATEGORY } from './licenses.js';
export { PLATFORM_TARGETS, getTarget, DEFAULT_PACK_IDS } from './platform-targets.js';
