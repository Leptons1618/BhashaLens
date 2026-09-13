import { describe, expect, it } from "vitest";
import { resolveTheme } from "./popup.js";

describe("popup themes", () => {
  it("maps the system theme to the page colour scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("parchment");
  });

  it("passes explicit themes through", () => {
    expect(resolveTheme("green", true)).toBe("green");
    expect(resolveTheme("light", false)).toBe("light");
  });
});
