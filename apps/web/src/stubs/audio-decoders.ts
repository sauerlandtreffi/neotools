/** Browser stub for optional speech WASM decoders (not bundled unless the speech pack installs them). */
function unavailable(name: string): never {
  throw new Error(`${name} ist im Web-Build nicht gebündelt.`);
}

export class MPEGDecoder {
  ready = Promise.resolve();
  decode(): never {
    return unavailable('mpg123-decoder');
  }
  free(): void {}
}

export class FLACDecoder {
  ready = Promise.resolve();
  decode(): never {
    return unavailable('@wasm-audio-decoders/flac');
  }
  decodeFile(): never {
    return unavailable('@wasm-audio-decoders/flac');
  }
  free(): void {}
}

export class OggOpusDecoder {
  ready = Promise.resolve();
  decodeFile(): never {
    return unavailable('ogg-opus-decoder');
  }
  free(): void {}
}

export default MPEGDecoder;
