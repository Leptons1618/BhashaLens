import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, readExtensionSettings, writeExtensionSettings } from "./settings.js";

function stubChrome(initial: Record<string, unknown> = {}): { set: ReturnType<typeof vi.fn>; store: Record<string, unknown> } {
  const store: Record<string, unknown> = { ...initial };
  const set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(store, values);
  });

  vi.stubGlobal("chrome", {
    storage: {
      sync: {
        get: (defaults: Record<string, unknown>, callback: (items: Record<string, unknown>) => void) => {
          callback({ ...defaults, ...store });
        },
        set
      }
    }
  });

  return { set, store };
}

describe("extension settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults when chrome.storage is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(readExtensionSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("reads stored values and coerces invalid ones back to defaults", async () => {
    stubChrome({
      activation: "nonsense",
      apiBaseUrl: "http://localhost:9999",
      blockNativeMenu: "yes",
      enabled: false,
      size: "huge",
      theme: "neon",
      translateTo: "  ",
      wikipediaLang: "en"
    });

    const settings = await readExtensionSettings();
    expect(settings.apiBaseUrl).toBe("http://localhost:9999");
    expect(settings.enabled).toBe(false);
    expect(settings.wikipediaLang).toBe("en");
    // Invalid enum-ish values fall back to defaults.
    expect(settings.activation).toBe(DEFAULT_SETTINGS.activation);
    expect(settings.size).toBe(DEFAULT_SETTINGS.size);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.blockNativeMenu).toBe(DEFAULT_SETTINGS.blockNativeMenu);
    // Blank strings fall back to defaults.
    expect(settings.translateTo).toBe(DEFAULT_SETTINGS.translateTo);
  });

  it("drops unknown panels and always keeps Dictionary first", async () => {
    stubChrome({ panels: ["translate", "bogus", "wikipedia"] });

    const settings = await readExtensionSettings();
    expect(settings.panels).toEqual(["dictionary", "translate", "wikipedia"]);
  });

  it("falls back to the default panel set when the stored value is unusable", async () => {
    stubChrome({ panels: "dictionary" });

    const settings = await readExtensionSettings();
    expect(settings.panels).toEqual(DEFAULT_SETTINGS.panels);
  });

  it("writes partial updates through chrome.storage.sync.set", async () => {
    const { set } = stubChrome();

    await writeExtensionSettings({ theme: "dark", size: "large" });
    expect(set).toHaveBeenCalledWith({ theme: "dark", size: "large" });
  });

  it("is a no-op write when chrome.storage is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(writeExtensionSettings({ enabled: false })).resolves.toBeUndefined();
  });
});
