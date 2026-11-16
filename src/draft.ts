export const draftKey = 'bib-formatter:draft';

export interface Draft {
  version: 1;
  source: string;
  output: string;
  language: 'japanese' | 'english' | 'other';
  otherLanguage: string;
  initialBibtex: string | null;
  detectLanguageOnConvert: boolean;
  lastConvertedSource: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readDraft(): Draft | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
    if (!isRecord(value) || value.version !== 1 || typeof value.source !== 'string' || typeof value.output !== 'string'
      || !['japanese', 'english', 'other'].some(language => value.language === language)
      || typeof value.otherLanguage !== 'string' || (value.initialBibtex !== null && typeof value.initialBibtex !== 'string')
      || typeof value.detectLanguageOnConvert !== 'boolean' || typeof value.lastConvertedSource !== 'string') return undefined;
    return {
      version: 1, source: value.source, output: value.output,
      language: value.language === 'japanese' ? 'japanese' : value.language === 'english' ? 'english' : 'other',
      otherLanguage: value.otherLanguage, initialBibtex: value.initialBibtex,
      detectLanguageOnConvert: value.detectLanguageOnConvert, lastConvertedSource: value.lastConvertedSource,
    };
  } catch { return undefined; }
}

export function writeDraft(draft: Draft): void {
  try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage is optional, including in restricted iframes. */ }
}

export function discardDraft(): void {
  try { sessionStorage.removeItem(draftKey); } catch { /* Conversion remains available without storage. */ }
}
