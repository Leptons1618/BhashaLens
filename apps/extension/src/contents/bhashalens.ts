import { BengaliAdapter, BhashaLens, RestDictionaryProvider, RestTranslationProvider } from "@bhashalens/core";
import type { PlasmoCSConfig } from "plasmo";
import { readExtensionSettings } from "../settings.js";

export const config: PlasmoCSConfig = {
  all_frames: true,
  matches: ["<all_urls>"],
  run_at: "document_idle"
};

let lens: BhashaLens | null = null;

function destroyLens(): void {
  lens?.destroy();
  lens = null;
}

async function startLens(): Promise<void> {
  const settings = await readExtensionSettings();
  destroyLens();

  if (!settings.enabled) {
    return;
  }

  lens = new BhashaLens({
    activation: settings.activation,
    adapter: new BengaliAdapter(),
    document,
    highlight: true,
    maxSelectionChars: 48,
    provider: new RestDictionaryProvider({
      baseUrl: settings.apiBaseUrl,
      cacheTtlMs: 5 * 60 * 1000,
      defaultLang: "bn",
      maxCacheEntries: 750,
      timeoutMs: 700
    }),
    translationProvider: new RestTranslationProvider({
      baseUrl: settings.apiBaseUrl,
      defaultFrom: "bn",
      defaultTo: "en",
      timeoutMs: 3000
    }),
    wikipediaLang: "bn",
    onError: (error) => {
      console.debug("[BhashaLens] lookup failed", error);
    }
  });

  lens.mount();
}

void startLens();

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    if (changes.enabled || changes.apiBaseUrl || changes.activation) {
      void startLens();
    }
  });
}
