import type { Localized } from '@neotools/engine';
import raw from '../rules/erv.json' with { type: 'json' };

export interface ErvLimits {
  maxFilenameChars: number;
  filenamePattern: string;
  maxFileBytes: number;
  maxMessageBytes: number;
  maxFiles: number;
}

export interface ErvRuleDef {
  id: string;
  source: string;
  severity: 'error' | 'warning' | 'hint';
  title: Localized;
}

export interface ErvRuleset {
  id: string;
  version: string;
  sources: Array<{ id: string; title: string; note: string }>;
  limits: ErvLimits;
  rules: ErvRuleDef[];
}

export const ervRuleset = raw as ErvRuleset;
