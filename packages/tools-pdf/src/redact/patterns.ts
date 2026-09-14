import type { RedactPatternId } from './types.js';

/** Official-ish Kfz-Unterscheidungszeichen (Kreise + kreisfreie Städte). */
export const KREIS_CODES = new Set<string>(
  `
A AA AB ABI AC AE AH AIB AIC AK ALF ALZ AM AN ANA ANG ANK AP APN ARN ART AS ASL ASZ AT AU AUR AX AZ
B BA BAD BAR BB BBG BC BCH BD BED BER BGD BGL BH BI BID BIN BIR BIT BIW BK BKS BL BLK BM BN BNA BO BÖ
BOH BOR BOT BRA BRB BS BT BTF BÜS BÜZ BÜR BWL BY BZ
C CA CAS CB CE CHA CLZ CO COC COE CUX CW
DAH DAN DAW DA D DÜW DEL DGF DH DI DIL DIN DIZ DKB DL DLG DM DN DO DON DU DUD DÜW DW DZ
E EA EB EBE EBN EBS ECK ED EE EF EH EI EIC EIL EIN EIS EL EM EMD EMS EN ER ERB ERH ERK ERZ ES ESB ESW
EU EW
F FB FD FDS FFB FG FI FKB FL FÖ FBZ FN FO FOR FR FRG FRI FRW FS FT FTL FÜ FÜS FW
G GA GAN GAP GC GD GDB GE GEL GEO GER GHA GHI GIB GL GM GMN GN GNT GÖ GOA GOH GP GR GRA GRH GRI GRZ GS
GT GTH GÜ GUB GUN GW GZ
H HA HAB HAL HAM HAS HB HBN HBS HC HCH HD HDH HDL HE HEB HEF HEI HEL HER HET HF HG HGN HGW HH HDN HI
HID HIP HÖS HL HM HMO HN HO HOL HOM HOR HÖS HP HR HRO HS HSG HSZ HU HÜN HWI HY HZ
IGB IK IL ILL IN IZ
J JL JÜL
K KA KB KC KE KEH KEL KEM KF KG KH KI KIB KK KL KLE KLE KLZ KM KN KO KR KÖN KÖT KRU KS KT KU KÜN KUS
KY KYF
L LA LAN LAU LB LBS LBZ LD LDS LEO LER LEV LF LG LH LI LIB LIF LIP LL LM LÖ LÖB LOS LP LR LRO LUP LWL
M MA MAB MAI MAK MAL MB MC MD ME MED MEG MEI MEK MER MET MG MGH MGN MH MHL MI MIL MK ML MM MN MO MOD
MOL MON MOS MQ MR MS MSE MSH MSP MST MTK MTL MÜ MÜB MÜR MW MY MYK MZ MZG
N NAB NAI NB ND NDH NE NEA NEB NES NEW NF NG NDH NK NL NM NMB NMS NÖ NOM NOR NP NR NU NVS NW NWM NY NZ
OA OAL OB OBB ODW OE OF OG OH OHA OHV OHZ OK OL OP OPR OS OSL OVP
P PA PAF PAN PAZ PB PCH PE PF PI PIR PL PLÖ PM PN PR PRÜ PS PW PZ
Q
R RA RC RD RDG RE REG REH REI RG RH RI RID RIE RL RM RN RO ROD ROF ROK ROT ROW RP RS RT RÜD RÜG RV RW
RZ
S SAB SAD SAL SAW SB SBG SBK SC SCZ SD SDL SDT SE SEB SEE SEF SEL SFB SFT SG SGH SHA SHG SHK SHL SI SIG
SIM SK SL SLE SLF SLK SLN SLS SLÜ SLZ SM SN SO SÖM SOKs SOK SÖM SON SP SPN SR SRB SRO ST STA STB STD
STL SU SUL SÜW SW SZ SZB
TIG TIR TO TÖL TP TR TS TÜ TUT
UE UER UFF UH UL UMM UN
V VAI VB VEC VER VG VIE VK VR VS
W WA WAF WAK WAN WAR WB WBS WDA WE WEL WEN WES WF WHV WI WIL WIS WIT WIZ WK WL WM WMS WN WND WO WOB WOH
WOL WOR WOS WR WSF WST WT WTM WÜ WUG WUN WUR WW WZ WZL
Z ZW ZZ
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
  for (const ch of expanded) {
    rest = (rest * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return rest;
}

export function isValidIban(iban: string): boolean {
  const compact = iban.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  if (compact.startsWith('DE') && compact.length !== 22) return false;
  return ibanMod97(compact) === 1;
}

/** IdNr check digit (BZSt / ISO 7064 MOD 11,10 variant). */
export function steuerIdCheckDigit(first10: string): number {
  const digits = first10.replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return -1;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(digits[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = 11 - product;
  return check === 10 ? 0 : check;
}

export function isValidSteuerId(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  if (digits[0] === '0') return false;
  return steuerIdCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

export function generateSteuerId(first10 = '8609574271'): string {
  const base = first10.replace(/\D/g, '').padStart(10, '8').slice(0, 10);
  return base + String(steuerIdCheckDigit(base));
}

export function isValidSvNummer(value: string): boolean {
  const compact = value.replace(/[\s./-]+/g, '').toUpperCase();
  return /^\d{8}[A-Z]\d{3}$/.test(compact);
}

export function isValidKennzeichen(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  const m = compact.match(/^([A-ZÄÖÜ]{1,3})-([A-Z]{1,2})(\d{1,4})([EH])?$/);
  if (!m) return false;
  return KREIS_CODES.has(m[1]!);
}

export function maskSecret(text: string, pattern: RedactPatternId): string {
  const compact = text.replace(/\s+/g, '');
  if (pattern === 'iban' && compact.length >= 8) {
    return `${compact.slice(0, 4)} **** ${compact.slice(-4)}`;
  }
  if (pattern === 'email') {
    const at = text.indexOf('@');
    if (at > 0) return `${text[0] ?? ''}***${text.slice(at)}`;
  }
  if (compact.length <= 4) return '****';
  return `${compact.slice(0, 2)}****${compact.slice(-2)}`;
}

export function normalizeWs(text: string): string {
  return stripInvisible(text).replace(/\s+/g, '').toLowerCase();
}

/** Drop bidi marks, zero-width, soft hyphen; NFKC so ligatures (ﬁ) fold to ASCII. */
export function stripInvisible(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ');
}

interface PatternSpec {
  id: RedactPatternId;
  regex: RegExp;
  validate?: (m: string) => boolean;
}

const SV_RE = /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{3}\b/gi;
const AUSWEIS_RE = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{9}\b/g;
const KENNZEICHEN_RE = /\b[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[EH]?\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+49|0)[\s/-]?(?:\d[\s/-]?){5,13}\d/g;
const DATUM_RE = /\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)?\d{2}\b/g;
const BETRAG_RE = /\b\d{1,3}(?:\.\d{3})*,\d{2}\s?(?:€|EUR)\b/gi;

const SPECS: PatternSpec[] = [
  { id: 'sv-nummer', regex: SV_RE, validate: isValidSvNummer },
  { id: 'ausweisnummer', regex: AUSWEIS_RE },
  { id: 'kennzeichen', regex: KENNZEICHEN_RE, validate: isValidKennzeichen },
  { id: 'email', regex: EMAIL_RE },
  { id: 'telefon', regex: PHONE_RE },
  { id: 'datum', regex: DATUM_RE },
  { id: 'betrag', regex: BETRAG_RE },
];

export interface PatternMatch {
  pattern: RedactPatternId;
  text: string;
  start: number;
  end: number;
}

/** Scan compact (whitespace-stripped) text for checksum-valid IBANs. Offsets are into `compact`. */
export function findIbansInCompact(compact: string): PatternMatch[] {
  const hits: PatternMatch[] = [];
  const upper = compact.toUpperCase();
  for (let i = 0; i <= upper.length - 15; i++) {
    if (!/[A-Z]{2}\d{2}/.test(upper.slice(i, i + 4))) continue;
    let found: PatternMatch | null = null;
    for (let len = Math.min(34, upper.length - i); len >= 15; len--) {
      const cand = upper.slice(i, i + len);
      if (isValidIban(cand)) {
        found = { pattern: 'iban', text: cand, start: i, end: i + len };
        break;
      }
    }
    if (found) {
      hits.push(found);
      i = found.end - 1;
    }
  }
  return hits;
}

export function findPatternMatches(
  text: string,
  enabled: readonly RedactPatternId[],
  customRegex: readonly string[] = [],
): PatternMatch[] {
  const allow = new Set(enabled);
  const hits: PatternMatch[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  const add = (m: PatternMatch) => {
    if (occupied.some((o) => m.start < o.end && m.end > o.start)) return;
    occupied.push({ start: m.start, end: m.end });
    hits.push(m);
  };

  if (allow.has('iban')) {
    for (const ib of findIbansInCompact(stripInvisible(text).replace(/\s+/g, '').toUpperCase())) {
      add({
        pattern: 'iban',
        text: ib.text,
        start: mapCompactToText(text, ib.start),
        end: mapCompactToTextEnd(text, ib.end),
      });
    }
  }

  if (allow.has('steuer-id')) {
    const compact = stripInvisible(text).replace(/\s+/g, '');
    for (let i = 0; i <= compact.length - 11; i++) {
      const cand = compact.slice(i, i + 11);
      if (isValidSteuerId(cand)) {
        add({
          pattern: 'steuer-id',
          text: cand,
          start: mapCompactToText(text, i),
          end: mapCompactToTextEnd(text, i + 11),
        });
        i += 10;
      }
    }
  }

  for (const spec of SPECS) {
    if (spec.id === 'iban' || spec.id === 'steuer-id') continue;
    if (!allow.has(spec.id)) continue;
    const re = new RegExp(spec.regex.source, spec.regex.flags);
    for (const m of text.matchAll(re)) {
      const raw = m[0];
      if (m.index === undefined) continue;
      if (spec.validate && !spec.validate(raw)) continue;
      add({ pattern: spec.id, text: raw, start: m.index, end: m.index + raw.length });
    }
  }

  if (allow.has('custom')) {
    for (const src of customRegex) {
      let re: RegExp;
      try {
        re = new RegExp(src, 'gi');
      } catch {
        continue;
      }
      for (const m of text.matchAll(re)) {
        if (m.index === undefined || !m[0]) continue;
        add({ pattern: 'custom', text: m[0], start: m.index, end: m.index + m[0].length });
      }
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

export const DEFAULT_PATTERNS = [
  'iban',
  'steuer-id',
  'sv-nummer',
  'ausweisnummer',
  'kennzeichen',
  'email',
  'telefon',
] as const;
