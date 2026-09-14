import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { examplePresets, presetsFileSchema } from '../presets/schema.js';
import { generateKeyPair, signPresets, verifyPresets } from '../presets/sign.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  mode: z.enum(['validate', 'example', 'sign', 'verify']).default('validate'),
  example: z.enum(['kanzlei', 'steuerberater', 'behoerde']).default('kanzlei'),
  privateKeyHex: z.string().default(''),
  publicKeyHex: z.string().default(''),
});

export const dachTeamPresets = defineTool({
  id: 'dach-team-presets',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Team-Presets / Richtlinien', en: 'Team presets / policy' },
  description: {
    de: 'presets.json prüfen/normalisieren, Beispiele (Kanzlei/StB/Behörde), optional Ed25519-Signatur. Engine: applyTeamPresets.',
    en: 'Validate/normalize presets.json, examples (firm/tax/authority), optional Ed25519 signature. Engine: applyTeamPresets.',
  },
  inputs: { accept: [MIME.json], multiple: true, min: 0 },
  outputs: { mime: [MIME.json] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['team presets', 'richtlinien', 'ed25519'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (parsed.mode === 'example') {
      const body = examplePresets(parsed.example);
      return {
        outputs: [neoFileFromBytes('presets.json', utf8(JSON.stringify(body, null, 2)), MIME.json)],
        warnings: [],
        report: attachProvenance({ example: parsed.example }, await createProvenance('dach-team-presets', parsed, files)),
      };
    }
    const raw = files[0] ? JSON.parse(new TextDecoder().decode(await files[0].bytes())) : examplePresets(parsed.example);
    const normalized = presetsFileSchema.parse(raw);
    if (parsed.mode === 'sign') {
      const keys = parsed.privateKeyHex ? { privateKey: parsed.privateKeyHex, publicKey: parsed.publicKeyHex } : await generateKeyPair();
      const sig = await signPresets(normalized, keys.privateKey);
      const signed = { ...normalized, signature: { alg: 'Ed25519', publicKey: keys.publicKey || parsed.publicKeyHex, sig } };
      return {
        outputs: [neoFileFromBytes('presets.signed.json', utf8(JSON.stringify(signed, null, 2)), MIME.json)],
        warnings: parsed.privateKeyHex ? [] : ['Neues Schlüsselpaar erzeugt — privateKey nur lokal sichern.'],
        report: attachProvenance({ signed: true, publicKey: signed.signature.publicKey }, await createProvenance('dach-team-presets', { mode: parsed.mode }, files)),
      };
    }
    if (parsed.mode === 'verify') {
      const sig = (raw as { signature?: { sig?: string; publicKey?: string } }).signature;
      const ok = sig?.sig && (sig.publicKey || parsed.publicKeyHex)
        ? await verifyPresets(normalized, sig.sig, sig.publicKey || parsed.publicKeyHex)
        : false;
      return {
        outputs: [neoFileFromBytes('presets-verify.json', utf8(JSON.stringify({ ok, normalized }, null, 2)), MIME.json)],
        warnings: ok ? [] : ['Signatur ungültig oder fehlend.'],
        report: attachProvenance({ ok }, await createProvenance('dach-team-presets', parsed, files)),
      };
    }
    ctx.progress(1, 'ok');
    return {
      outputs: [neoFileFromBytes('presets.json', utf8(JSON.stringify(normalized, null, 2)), MIME.json)],
      warnings: [],
      report: attachProvenance({ organization: normalized.organization }, await createProvenance('dach-team-presets', parsed, files)),
    };
  },
});
