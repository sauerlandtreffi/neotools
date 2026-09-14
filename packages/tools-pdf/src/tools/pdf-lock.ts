import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { decryptPdf, encryptPdf, qpdfAvailable, qpdfRewrite } from '../qpdf/index.js';
import { stem } from '../pdf-io.js';
import { neoFileFromBytes } from '@neotools/engine';

const options = z.object({
  mode: z.enum(['encrypt', 'decrypt']).default('encrypt'),
  userPassword: z.string().describe('password').default(''),
  ownerPassword: z.string().describe('password').default(''),
  password: z.string().describe('password').default(''),
  allowPrint: z.boolean().default(true),
  allowCopy: z.boolean().default(true),
  allowModify: z.boolean().default(false),
  allowAnnotate: z.boolean().default(true),
  linearize: z.boolean().default(false),
});

export const pdfLock = defineTool({
  id: 'pdf-lock',
  pack: 'pdf',
  category: 'security',
  title: { de: 'Sperren / Entsperren', en: 'Lock / Unlock' },
  description: {
    de: 'PDF lokal mit AES-256 verschlüsseln oder entsperren. User-/Owner-Passwort und Berechtigungen (Drucken, Kopieren, Ändern, Kommentieren).',
    en: 'Encrypt or decrypt a PDF locally with AES-256. User/owner passwords and print/copy/modify/annotate permissions.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    {
      id: 'open-only',
      title: { de: 'Nur Öffnen schützen', en: 'Protect opening only' },
      options: {
        mode: 'encrypt',
        allowPrint: true,
        allowCopy: true,
        allowModify: true,
        allowAnnotate: true,
      },
    },
    {
      id: 'print-no-copy',
      title: { de: 'Drucken erlauben, Kopieren sperren', en: 'Allow print, block copy' },
      options: {
        mode: 'encrypt',
        allowPrint: true,
        allowCopy: false,
        allowModify: false,
        allowAnnotate: true,
      },
    },
  ],
  licenses: PDF_LICENSES,
  seo: {
    keywords: ['pdf sperren', 'pdf passwort', 'pdf entsperren', 'aes-256'],
    faq: [
      {
        q: {
          de: 'Wie werden Passwortfelder im Formular erkannt?',
          en: 'How are password fields detected in the form?',
        },
        a: {
          de: 'Zod-Felder mit .describe("password") (oder Name enthält "password") werden als type=password gerendert.',
          en: 'Zod fields with .describe("password") (or a name containing "password") render as type=password.',
        },
      },
    ],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const input = await file.bytes();
      if (parsed.mode === 'decrypt') {
        const pw = parsed.password || parsed.userPassword || parsed.ownerPassword;
        if (!pw) throw new Error('Passwort fehlt.');
        const { bytes, engine } = await decryptPdf(input, pw);
        let out = bytes;
        if (parsed.linearize && (await qpdfAvailable())) {
          try {
            out = await qpdfRewrite(bytes, ['--linearize']);
          } catch {
            // keep decrypted bytes
          }
        }
        void engine;
        return neoFileFromBytes(`${stem(file.name)}-unlocked.pdf`, out, MIME.pdf);
      }
      const user = parsed.userPassword;
      const owner = parsed.ownerPassword || parsed.userPassword;
      if (!user && !owner) throw new Error('User- oder Owner-Passwort angeben.');
      const { bytes, engine } = await encryptPdf(input, {
        userPassword: user,
        ownerPassword: owner,
        allowPrint: parsed.allowPrint,
        allowCopy: parsed.allowCopy,
        allowModify: parsed.allowModify,
        allowAnnotate: parsed.allowAnnotate,
        linearize: parsed.linearize,
      });
      void engine;
      return neoFileFromBytes(`${stem(file.name)}-locked.pdf`, bytes, MIME.pdf);
    });
    const provenance = await createProvenance('pdf-lock', { ...parsed, userPassword: '***', ownerPassword: '***', password: '***' }, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
