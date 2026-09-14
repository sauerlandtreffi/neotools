/**
 * Leak / plate patterns. Kennzeichen + IBAN + E-Mail + Telefon from tools-pdf/redact/patterns
 * (copied to keep packs decoupled; keep in sync). Extra: cloud keys, JWT, private IPs.
 */

export const KREIS_CODES = new Set<string>(
  `
A AA AB ABI AC AE AH AIB AIC AK ALF ALZ AM AN ANA ANG ANK AP APN ARN ART AS ASL ASZ AT AU AUR AX AZ
B BA BAD BAR BB BBG BC BCH BD BED BER BGD BGL BH BI BID BIN BIR BIT BIW BK BKS BL BLK BM BN BNA BO
BOH BOR BOT BRA BRB BS BT BTF BWL BY BZ
C CA CAS CB CE CHA CLZ CO COC COE CUX CW
DAH DAN DAW DA D DEL DGF DH DI DIL DIN DIZ DL DLG DM DN DO DON DU DW
E EA EB EBE ED EE EF EH EI EIC EIN EL EM EMD EMS EN ER ERB ERH ES ESW EU
F FB FD FDS FFB FG FL FN FO FOR FR FRG FRI FS FT FÜ
G GA GAP GC GD GE GEL GER GL GM GN GÖ GP GR GS GT GÜ GZ
H HA HAL HAM HAS HB HD HDH HE HEF HEI HER HF HG HH HI HL HM HN HO HOL HOM HP HR HRO HS HU
IGB IK IL IN IZ
K KA KB KE KEH KF KG KH KI KL KLE KN KO KR KS KU
L LA LAU LB LD LER LEV LG LI LIP LL LM LÖ LP LR LRO
M MA MB MD ME MEI MG MH MI MIL MK MM MN MO MOL MON MQ MR MS MSE MTK MÜ MW MYK MZ
N NB ND NE NEA NES NF NK NM NMS NU NW
OA OAL OB OE OF OG OH OL OS
P PA PAF PB PE PF PI PIR PL PM PR PS
R RA RD RE REG RG RH RO ROW RS RT RV RW RZ
S SAD SB SC SD SE SG SHA SI SIG SIM SK SL SLF SM SN SO SON SP SR ST STA STD SU SW SZ
TIR TO TÖL TR TS TÜ TUT
UE UL UN
V VEC VER VG VIE VS
W WA WAF WE WEN WES WF WHV WI WIL WIT WL WM WN WO WOB WR WST WTM WÜ WUG WW
Z ZW
`.split(/\s+/).filter(Boolean),
);

export function ibanMod97(iban: string): number {
  const compact = iban.replace(/[\s-]+/g, '').toUpperCase();
  const rearr = compact.slice(4) + compact.slice(0, 4);
  let expanded = '';
  for (const ch of rearr) {
    const code = ch.charCodeAt(0);
    expanded += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  let rest = 0;
  for (const ch of expanded) rest = (rest * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return rest;
}

export function isValidIban(iban: string): boolean {
  const compact = iban.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  if (compact.startsWith('DE') && compact.length !== 22) return false;
  return ibanMod97(compact) === 1;
}

export function isValidKennzeichen(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  const m = compact.match(/^([A-ZÄÖÜ]{1,3})-([A-Z]{1,2})(\d{1,4})([EH])?$/);
  if (!m) return false;
  return KREIS_CODES.has(m[1]!);
}

export type SecretKind =
  | 'aws'
  | 'github'
  | 'stripe'
  | 'slack'
  | 'google-api'
  | 'jwt'
  | 'iban'
  | 'email'
  | 'phone'
  | 'private-ip'
  | 'kennzeichen';

export interface SecretHit {
  kind: SecretKind;
  text: string;
  start: number;
  end: number;
}

const SPECS: Array<{ kind: SecretKind; re: RegExp; validate?: (s: string) => boolean }> = [
  { kind: 'aws', re: /AKIA[0-9A-Z]{16}/g },
  { kind: 'github', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'stripe', re: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'google-api', re: /AIza[0-9A-Za-z\-_]{35}/g },
  {
    kind: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { kind: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'phone', re: /(?:\+49|0)(?:[ \t/-]?\d){5,13}\b/g },
  {
    kind: 'private-ip',
    re: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g,
  },
  { kind: 'kennzeichen', re: /\b[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[EH]?\b/gi, validate: isValidKennzeichen },
];

export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const occupied: Array<{ start: number; end: number }> = [];
  const add = (h: SecretHit) => {
    if (occupied.some((o) => h.start < o.end && h.end > o.start)) return;
    occupied.push({ start: h.start, end: h.end });
    hits.push(h);
  };

  const compact = text.replace(/\s+/g, '').toUpperCase();
  for (let i = 0; i <= compact.length - 15; i++) {
    if (!/[A-Z]{2}\d{2}/.test(compact.slice(i, i + 4))) continue;
    for (let len = Math.min(34, compact.length - i); len >= 15; len--) {
      const cand = compact.slice(i, i + len);
      if (isValidIban(cand)) {
        add({
          kind: 'iban',
          text: cand,
          start: mapCompactToText(text, i),
          end: mapCompactToTextEnd(text, i + len),
        });
        i = i + len - 1;
        break;
      }
    }
  }

  for (const spec of SPECS) {
    const re = new RegExp(spec.re.source, spec.re.flags);
    for (const m of text.matchAll(re)) {
      if (m.index === undefined || !m[0]) continue;
      if (spec.validate && !spec.validate(m[0])) continue;
      add({ kind: spec.kind, text: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function mapCompactToText(text: string, compactIndex: number): number {
  let compact = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) continue;
    if (compact === compactIndex) return i;
    compact += 1;
  }
  return text.length;
}

function mapCompactToTextEnd(text: string, compactEnd: number): number {
  let compact = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) continue;
    compact += 1;
    if (compact === compactEnd) return i + 1;
  }
  return text.length;
}
