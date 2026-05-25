import {
  RestDictionaryProvider,
  type DictionaryProvider,
  type LanguageCode,
  type LookupResponse
} from "@bhashalens/core";
import { useCallback, useMemo, useRef, useState } from "react";

export type DictionaryLookupStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface DictionaryLookupState {
  error?: string;
  result?: LookupResponse;
  status: DictionaryLookupStatus;
}

export interface UseDictionaryLookupOptions {
  baseUrl?: string;
  lang?: LanguageCode;
  provider?: DictionaryProvider;
  timeoutMs?: number;
}

const DEFAULT_API_BASE_URL = "http://localhost:8787";

export function useDictionaryLookup(options: UseDictionaryLookupOptions = {}) {
  const { baseUrl = DEFAULT_API_BASE_URL, lang = "bn", provider, timeoutMs = 700 } = options;
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<DictionaryLookupState>({ status: "idle" });

  const dictionaryProvider = useMemo(
    () => provider ?? new RestDictionaryProvider({ baseUrl, defaultLang: lang, timeoutMs }),
    [baseUrl, lang, provider, timeoutMs]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  const lookup = useCallback(
    async (word: string): Promise<LookupResponse | undefined> => {
      const trimmed = word.normalize("NFC").trim();
      if (trimmed.length === 0) {
        setState({ status: "idle" });
        return undefined;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "loading" });

      try {
        const result = await dictionaryProvider.lookup(trimmed, lang, controller.signal);
        setState({
          result,
          status: result.entries.length > 0 ? "ready" : "empty"
        });
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          return undefined;
        }

        setState({
          error: error instanceof Error ? error.message : "Lookup failed",
          status: "error"
        });
        return undefined;
      }
    },
    [dictionaryProvider, lang]
  );

  return {
    ...state,
    lookup,
    reset
  };
}
