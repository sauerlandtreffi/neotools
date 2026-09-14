export type PdfaProfile = '2b' | '3b';

export type PdfaSeverity = 'error' | 'warning' | 'hint';

export interface PdfaFinding {
  id: string;
  severity: PdfaSeverity;
  clause: string;
  message: { de: string; en: string };
}

export interface PdfaReport {
  profile: PdfaProfile;
  subset:
    | 'NeoTools PDF/A-2b/3b subset (no veraPDF). ISO 19005-2 clauses listed per finding.';
  passed: boolean;
  errors: PdfaFinding[];
  warnings: PdfaFinding[];
  hints: PdfaFinding[];
}

export function finding(
  id: string,
  severity: PdfaSeverity,
  clause: string,
  de: string,
  en: string,
): PdfaFinding {
  return { id, severity, clause, message: { de, en } };
}
