/** Community stub — not registered in the core registry. */
export const pluginId = '3d-lite';

export function inspectGltfMagic(bytes: Uint8Array): { kind: 'glb' | 'gltf' | 'unknown'; bytes: number } {
  if (bytes.byteLength >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return { kind: 'glb', bytes: bytes.byteLength };
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 32));
  if (head.includes('{') && /"asset"/i.test(head)) return { kind: 'gltf', bytes: bytes.byteLength };
  return { kind: 'unknown', bytes: bytes.byteLength };
}
