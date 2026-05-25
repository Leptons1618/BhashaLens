import {
  BengaliAdapter,
  BhashaLens,
  RestDictionaryProvider,
  type ActivationMode,
  type DictionaryProvider,
  type LanguageAdapter,
  type LookupCandidate,
  type PopupController,
  type PopupLookupState
} from "@bhashalens/core";
import { useEffect } from "react";

export interface UseBhashaLensOptions {
  activation?: ActivationMode;
  adapter?: LanguageAdapter;
  baseUrl?: string;
  document?: Document;
  enabled?: boolean;
  maxSelectionChars?: number;
  minWordLength?: number;
  onError?: (error: unknown) => void;
  onLookupComplete?: (candidate: LookupCandidate, state: PopupLookupState) => void;
  onLookupStart?: (candidate: LookupCandidate) => void;
  popup?: PopupController;
  provider?: DictionaryProvider;
  timeoutMs?: number;
}

const DEFAULT_API_BASE_URL = "http://localhost:8787";

export function useBhashaLens(options: UseBhashaLensOptions = {}): void {
  const {
    activation = "both",
    adapter,
    baseUrl = DEFAULT_API_BASE_URL,
    document: targetDocument,
    enabled = true,
    maxSelectionChars,
    minWordLength,
    onError,
    onLookupComplete,
    onLookupStart,
    popup,
    provider,
    timeoutMs = 700
  } = options;

  useEffect(() => {
    const doc = targetDocument ?? globalThis.document;
    if (!enabled || !doc) {
      return undefined;
    }

    const lens = new BhashaLens({
      activation,
      adapter: adapter ?? new BengaliAdapter(),
      document: doc,
      maxSelectionChars,
      minWordLength,
      onError,
      onLookupComplete,
      onLookupStart,
      popup,
      provider: provider ?? new RestDictionaryProvider({ baseUrl, defaultLang: "bn", timeoutMs })
    });

    lens.mount();
    return () => lens.destroy();
  }, [
    activation,
    adapter,
    baseUrl,
    enabled,
    maxSelectionChars,
    minWordLength,
    onError,
    onLookupComplete,
    onLookupStart,
    popup,
    provider,
    targetDocument,
    timeoutMs
  ]);
}
