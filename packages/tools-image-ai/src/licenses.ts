import type { ToolLicense } from '@neotools/engine';

export const IMAGE_AI_LICENSES: ToolLicense[] = [
  { name: 'NeoTools tools-image-ai', license: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  { name: 'ONNX Runtime', license: 'MIT', url: 'https://github.com/microsoft/onnxruntime' },
  { name: 'onnxruntime-web', license: 'MIT', url: 'https://github.com/microsoft/onnxruntime' },
  { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
  { name: '@jsquash/jpeg (mozjpeg WASM)', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: 'mozjpeg', license: 'BSD-3-Clause', url: 'https://github.com/mozilla/mozjpeg' },
  { name: '@jsquash/webp', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: 'pdf-lib', license: 'MIT', url: 'https://github.com/Hopding/pdf-lib' },
  { name: 'Transformers.js', license: 'Apache-2.0', url: 'https://github.com/huggingface/transformers.js' },
  { name: 'Tesseract.js', license: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js' },
  { name: 'U²-Net / u2netp weights', license: 'Apache-2.0', url: 'https://github.com/xuebinqin/U-2-Net' },
  { name: 'IS-Net general-use weights', license: 'Apache-2.0', url: 'https://github.com/xuebinqin/DIS' },
  { name: 'OpenCV YuNet face detector', license: 'Apache-2.0', url: 'https://github.com/opencv/opencv_zoo' },
  { name: 'YOLOS-tiny (hustvl)', license: 'Apache-2.0', url: 'https://github.com/hustvl/YOLOS' },
  { name: 'Swin2SR lightweight x2', license: 'Apache-2.0', url: 'https://github.com/mv-lab/swin2sr' },
  { name: 'ViT-GPT2 image captioning', license: 'Apache-2.0', url: 'https://huggingface.co/nlpconnect/vit-gpt2-image-captioning' },
  { name: 'OPUS-MT en-de (Helsinki-NLP)', license: 'Apache-2.0', url: 'https://huggingface.co/Helsinki-NLP/opus-mt-en-de' },
  { name: 'OpenCV.js (lazy fallback, optional)', license: 'Apache-2.0', url: 'https://github.com/opencv/opencv' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
];

export const IMAGE_ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', '.png', '.jpg', '.jpeg', '.webp'];
