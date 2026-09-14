/** Browser/SSR stub: inference uses onnxruntime-web, not the native Node binding. */
export class InferenceSession {
  static create(): never {
    throw new Error('onnxruntime-node ist im Web-Build nicht verfügbar.');
  }
}

export class Tensor {}

export const env = {};
