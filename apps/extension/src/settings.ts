export interface BhashaLensSettings {
  apiBaseUrl: string;
  enabled: boolean;
}

export const DEFAULT_SETTINGS: BhashaLensSettings = {
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
