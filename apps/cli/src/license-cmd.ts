import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  generateKeypair,
  issueLicense,
  verifyLicense,
  type LicensePlan,
} from '@neotools/license';

const PLANS = new Set(['community', 'pro', 'enterprise']);

export async function runLicenseKeygen(outPath: string, io: { stdout: (m: string) => void }): Promise<number> {
  const dest = resolve(outPath);
  const keys = await generateKeypair();
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(
    dest,
    JSON.stringify(
      {
        algorithm: 'Ed25519',
        privateKeyHex: keys.privateKeyHex,
        publicKeyHex: keys.publicKeyHex,
        note: 'Private Key niemals ins Repo. Public Key nach branding.json / license-pubkey.json.',
      },
      null,
      2,
    ),
  );
  await writeFile(`${dest}.pub`, `${keys.publicKeyHex}\n`);
  io.stdout(dest);
  io.stdout(`${dest}.pub`);
  return 0;
}

export async function runLicenseIssue(
  opts: {
    org: string;
    plan: string;
    days: string;
    features?: string;
    seats?: string;
    domain?: string;
    key: string;
  },
  io: { stdout: (m: string) => void; stderr: (m: string) => void },
): Promise<number> {
  if (!PLANS.has(opts.plan)) {
    io.stderr('plan muss community|pro|enterprise sein.');
    return 3;
  }
  const { readFile } = await import('node:fs/promises');
  let privateKey = opts.key;
  try {
    const raw = await readFile(resolve(opts.key), 'utf8');
    if (raw.trim().startsWith('{')) {
      const parsed = JSON.parse(raw) as { privateKeyHex?: string };
      if (parsed.privateKeyHex) privateKey = parsed.privateKeyHex;
    } else {
      privateKey = raw.trim();
    }
  } catch {
    // treat as hex
  }
  const { token, payload } = await issueLicense({
    org: opts.org,
    plan: opts.plan as LicensePlan,
    days: Number(opts.days),
    features: opts.features ? opts.features.split(',').map((s) => s.trim()) : [],
    seats: opts.seats ? Number(opts.seats) : undefined,
    domain: opts.domain,
    privateKey,
  });
  io.stdout(token);
  io.stdout(JSON.stringify(payload));
  return 0;
}

export async function runLicenseVerify(
  token: string,
  pubkey: string | undefined,
  io: { stdout: (m: string) => void; stderr: (m: string) => void },
): Promise<number> {
  const key = pubkey ?? process.env.NEOTOOLS_LICENSE_PUBKEY ?? '';
  const result = await verifyLicense(token, key);
  io.stdout(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 3;
}
