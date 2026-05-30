import type { ActivationMode, PanelId, PopupSize, PopupTheme } from "@bhashalens/core";

export interface BhashaLensSettings {
  activation: ActivationMode;
  apiBaseUrl: string;
  blockNativeMenu: boolean;
  enabled: boolean;
  panels: PanelId[];
  size: PopupSize;
  theme: PopupTheme;
  translateTo: string;
  wikipediaLang: string;
}

export const ALL_PANELS: PanelId[] = ["dictionary", "translate", "wikipedia", "web"];
export const THEMES: PopupTheme[] = ["parchment", "green", "dark", "light"];
export const SIZES: PopupSize[] = ["small", "medium", "large"];

export const DEFAULT_SETTINGS: BhashaLensSettings = {
  activation: "selection",
  apiBaseUrl: "http://localhost:8787",
  blockNativeMenu: true,
  enabled: true,
  panels: ["dictionary", "translate", "wikipedia", "web"],
  size: "medium",
  theme: "parchment",
  translateTo: "en",
  wikipediaLang: "bn"
};

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

function coercePanels(value: unknown): PanelId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.panels;
  }
  const panels = value.filter((item): item is PanelId => ALL_PANELS.includes(item as PanelId));
  // Dictionary is the baseline source and is always present.
  if (!panels.includes("dictionary")) {
    panels.unshift("dictionary");
  }
  return panels.length > 0 ? panels : DEFAULT_SETTINGS.panels;
}

function coerceFromList<T extends string>(value: unknown, list: T[], fallback: T): T {
  return typeof value === "string" && list.includes(value as T) ? (value as T) : fallback;
}

export async function readExtensionSettings(): Promise<BhashaLensSettings> {
  if (!hasChromeStorage()) {
    return DEFAULT_SETTINGS;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve({
        activation: coerceFromList(items.activation, ["click", "selection", "both"], DEFAULT_SETTINGS.activation),
        apiBaseUrl: typeof items.apiBaseUrl === "string" ? items.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
        blockNativeMenu: typeof items.blockNativeMenu === "boolean" ? items.blockNativeMenu : DEFAULT_SETTINGS.blockNativeMenu,
        enabled: typeof items.enabled === "boolean" ? items.enabled : DEFAULT_SETTINGS.enabled,
        panels: coercePanels(items.panels),
        size: coerceFromList(items.size, SIZES, DEFAULT_SETTINGS.size),
        theme: coerceFromList(items.theme, THEMES, DEFAULT_SETTINGS.theme),
        translateTo: typeof items.translateTo === "string" && items.translateTo.trim() ? items.translateTo.trim() : DEFAULT_SETTINGS.translateTo,
        wikipediaLang: typeof items.wikipediaLang === "string" && items.wikipediaLang.trim() ? items.wikipediaLang.trim() : DEFAULT_SETTINGS.wikipediaLang
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
