export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', data as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
}

export async function assertSha256(data: Uint8Array, expected?: string): Promise<string> {
  const got = await sha256Hex(data);
  if (expected && got.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`SHA-256 stimmt nicht: erwartet ${expected}, erhalten ${got}`);
  }
  return got;
}
