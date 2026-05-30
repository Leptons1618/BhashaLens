import { BengaliAdapter, BhashaLens, RestDictionaryProvider, RestSearchProvider, RestTranslationProvider } from "@bhashalens/core";
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
    blockNativeMenu: settings.blockNativeMenu,
    enabledPanels: settings.panels,
    theme: settings.theme,
    size: settings.size,
    translateTo: settings.translateTo,
    wikipediaLang: settings.wikipediaLang,
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
      defaultTo: settings.translateTo,
      timeoutMs: 3000
    }),
    searchProvider: new RestSearchProvider({
      baseUrl: settings.apiBaseUrl,
      timeoutMs: 4500
    }),
    onError: (error) => {
      console.debug("[BhashaLens] lookup failed", error);
    }
  });

  lens.mount();
}

void startLens();

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    // Any setting change rebuilds the lens so trigger, theme, size, sources,
    // languages, and suppression all take effect in open tabs immediately.
    if (areaName === "sync") {
      void startLens();
    }
  });
}
