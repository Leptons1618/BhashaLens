export type LanguageCode = "bn" | (string & {});

export type ActivationMode = "click" | "selection" | "both";

export type LookupStateStatus = "loading" | "ready" | "empty" | "error";

export interface WordSpan {
  end: number;
  lang: LanguageCode;
  normalized: string;
  start: number;
  text: string;
}

export interface LanguageAdapter {
  detect(text: string): boolean;
  extractWordAt(text: string, offset: number): WordSpan | null;
  lang: LanguageCode;
  name: string;
  normalize(text: string): string;
}

export interface DictionaryEntry {
  definition: string;
  examples?: string[];
  lang: LanguageCode;
  normalized: string;
  partOfSpeech: string;
  source?: string;
  synonyms?: string[];
  transliteration: string;
  word: string;
}

export interface LookupQuery {
  lang: LanguageCode;
  normalized: string;
  word: string;
}

export interface LookupResponse {
  entries: DictionaryEntry[];
  found: boolean;
  latencyMs?: number;
  query: LookupQuery;
}

export interface DictionaryProvider {
  lookup(word: string, lang?: LanguageCode, signal?: AbortSignal): Promise<LookupResponse>;
}

export interface PopupLookupState {
  error?: string;
  normalized: string;
  response?: LookupResponse;
  status: LookupStateStatus;
  word: string;
}

export interface PopupController {
  contains?(node: Node): boolean;
  destroy(): void;
  hide(): void;
  show(anchor: DOMRect, state: PopupLookupState): void;
  update(state: PopupLookupState): void;
}

export interface LookupCandidate {
  lang: LanguageCode;
  normalized: string;
  rect: DOMRect;
  source: "pointer" | "selection";
  word: string;
}
