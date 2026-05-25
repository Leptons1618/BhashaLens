import type { ActivationMode } from "@bhashalens/core";

export interface BhashaLensSettings {
  activation: ActivationMode;
  apiBaseUrl: string;
  enabled: boolean;
}

export const DEFAULT_SETTINGS: BhashaLensSettings = {
  activation: "selection",
  apiBaseUrl: "http://localhost:8787",
  enabled: true
};

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

export async function readExtensionSettings(): Promise<BhashaLensSettings> {
  if (!hasChromeStorage()) {
    return DEFAULT_SETTINGS;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve({
        activation:
          items.activation === "click" || items.activation === "selection" || items.activation === "both"
            ? items.activation
            : DEFAULT_SETTINGS.activation,
        apiBaseUrl: typeof items.apiBaseUrl === "string" ? items.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
        enabled: typeof items.enabled === "boolean" ? items.enabled : DEFAULT_SETTINGS.enabled
      });
    });
  });
}

export async function writeExtensionSettings(settings: Partial<BhashaLensSettings>): Promise<void> {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.sync.set(settings);
}
