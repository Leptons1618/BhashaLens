import { autoUpdate, computePosition, flip, offset, shift, type VirtualElement } from "@floating-ui/dom";
import type {
  PanelDescriptor,
  PanelId,
  PopupController,
  PopupLookupState,
  PopupSize,
  PopupTheme
} from "./types.js";

const POPUP_Z_INDEX = "2147483647";

export interface FloatingDictionaryPopupOptions {
  onHide?: () => void;
  onSelectPanel?: (panel: PanelId) => void;
  size?: PopupSize;
  theme?: PopupTheme;
}

interface ThemeTokens {
  accent: string;
  accentText: string;
  bg: string;
  border: string;
  chip: string;
  chipText: string;
  fg: string;
  muted: string;
  surface: string;
}

const THEMES: Record<PopupTheme, ThemeTokens> = {
  parchment: {
    accent: "#27745d",
    accentText: "#fffaf0",
    bg: "#fffaf0",
    border: "rgba(45, 31, 19, 0.16)",
    chip: "rgba(39, 116, 93, 0.1)",
    chipText: "#245f4d",
    fg: "#261b12",
    muted: "#765c45",
    surface: "#f4ead8"
  },
  green: {
    accent: "#1f7a55",
    accentText: "#ffffff",
    bg: "#f2f8f4",
    border: "rgba(20, 40, 28, 0.14)",
    chip: "rgba(31, 122, 85, 0.12)",
    chipText: "#1b6347",
    fg: "#14241b",
    muted: "#4a6b58",
    surface: "#e2efe6"
  },
  dark: {
    accent: "#3fae86",
    accentText: "#07120d",
    bg: "#20262b",
    border: "rgba(255, 255, 255, 0.13)",
    chip: "rgba(63, 174, 134, 0.18)",
    chipText: "#8fe0c2",
    fg: "#eef2f0",
    muted: "#9fb0a8",
    surface: "#1a1f23"
  },
  light: {
    accent: "#1f7a55",
    accentText: "#ffffff",
    bg: "#ffffff",
    border: "rgba(0, 0, 0, 0.12)",
    chip: "rgba(31, 122, 85, 0.1)",
    chipText: "#1b6347",
    fg: "#1f2329",
    muted: "#6b7280",
    surface: "#f3f4f6"
  }
};

interface SizeTokens {
  body: string;
  maxW: string;
  minW: string;
  word: string;
}

const SIZES: Record<PopupSize, SizeTokens> = {
  small: { body: "12px", maxW: "360px", minW: "248px", word: "18px" },
  medium: { body: "13.5px", maxW: "420px", minW: "300px", word: "22px" },
  large: { body: "15px", maxW: "480px", minW: "360px", word: "26px" }
};

const ICONS: Record<PanelId, string> = {
  dictionary:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h12"/></svg>',
  translate:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h7"/><path d="M7 4c0 4.5-2 8-4 9"/><path d="M5 9c0 2 2.5 4 6 4"/><path d="m13 20 4-9 4 9"/><path d="M14.5 17h5"/></svg>',
  wikipedia:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><text x="12" y="17" font-size="15" font-family="Georgia, serif" font-weight="700" text-anchor="middle">W</text></svg>',
  web:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
};

export const DEFAULT_PANELS: PanelDescriptor[] = [
  { icon: ICONS.dictionary, id: "dictionary", label: "Dictionary" },
  { icon: ICONS.translate, id: "translate", label: "Translate" },
  { icon: ICONS.wikipedia, id: "wikipedia", label: "Wikipedia" },
  { icon: ICONS.web, id: "web", label: "Web search" }
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEntries(state: PopupLookupState): string {
  if (state.status === "loading") {
    return `<div class="bl-status">Looking up Bengali entry...</div>`;
  }

  if (state.status === "error") {
    return `<div class="bl-status bl-error">${escapeHtml(state.error ?? "Lookup failed")}</div>`;
  }

  if (state.status === "empty" || !state.response?.entries.length) {
    return `<div class="bl-status">No dictionary entry. Try <strong>Translate</strong> or <strong>Wikipedia</strong> on the left.</div>`;
  }

  return state.response.entries
    .slice(0, 3)
    .map((entry) => {
      const meta = [entry.transliteration, entry.ipa, entry.partOfSpeech]
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => `<span>${escapeHtml(value)}</span>`)
        .join("");

      const examples = entry.examples?.length
        ? `<ul class="bl-examples">${entry.examples
            .slice(0, 2)
            .map((example) => `<li>${escapeHtml(example)}</li>`)
            .join("")}</ul>`
        : "";

      const synonyms = entry.synonyms?.length
        ? `<div class="bl-synonyms">${entry.synonyms.map(escapeHtml).join(", ")}</div>`
        : "";

      return `
        <article class="bl-entry">
          <div class="bl-entry-meta">${meta}</div>
          <p>${escapeHtml(entry.definition)}</p>
          ${examples}
          ${synonyms}
        </article>
      `;
    })
    .join("");
}

function renderMorphology(state: PopupLookupState): string {
  const morphology = state.morphology;
  if (!morphology) {
    return "";
  }

  const matched = state.matchedCandidate;
  const matchedText = matched && matched.reason !== "exact" ? `Root match: ${escapeHtml(matched.normalized)}` : "Exact form";
  const suffixText = matched?.suffix ? ` · suffix ${escapeHtml(matched.suffix)}` : "";

  return `
    <div class="bl-morph">
      <span>${escapeHtml(morphology.complexity)}</span>
      <span>score ${escapeHtml(String(morphology.score))}</span>
      <span>${matchedText}${suffixText}</span>
    </div>
  `;
}

function renderTranslate(state: PopupLookupState): string {
  const panel = state.panelStates?.translate;
  if (!panel || panel.status === "idle" || panel.status === "loading") {
    return `<div class="bl-status">Translating…</div>`;
  }

  if (panel.status === "error") {
    return `<div class="bl-status bl-error">${escapeHtml(panel.error ?? "Translation failed")}</div>`;
  }

  if (panel.status === "empty" || !panel.translation) {
    return `<div class="bl-status">No machine translation available.</div>`;
  }

  const badge = `Machine translation · ${escapeHtml(panel.provider ?? "google")}${panel.cached ? " · cached" : ""}`;
  return `
    <div class="bl-translate">
      <div class="bl-tl-row">
        <span class="bl-tl-lang">Bengali</span>
        <span class="bl-tl-text" lang="bn">${escapeHtml(state.word)}</span>
      </div>
      <div class="bl-tl-sep" aria-hidden="true">→</div>
      <div class="bl-tl-row">
        <span class="bl-tl-lang">English</span>
        <span class="bl-tl-text bl-tl-out">${escapeHtml(panel.translation)}</span>
      </div>
      <div class="bl-badge">${badge}</div>
    </div>
  `;
}

function renderWikipedia(state: PopupLookupState): string {
  const panel = state.panelStates?.wikipedia;
  if (!panel || panel.status === "idle" || panel.status === "loading") {
    return `<div class="bl-status">Loading Wikipedia…</div>`;
  }

  if (panel.status === "error") {
    return `<div class="bl-status bl-error">${escapeHtml(panel.error ?? "Wikipedia lookup failed")}</div>`;
  }

  if (panel.status === "empty" || !panel.summary) {
    return `<div class="bl-status">No Wikipedia article found.</div>`;
  }

  const link = panel.url
    ? `<a class="bl-readmore" href="${escapeHtml(panel.url)}" target="_blank" rel="noopener noreferrer">Read on Wikipedia →</a>`
    : "";
  return `
    <div class="bl-wiki">
      ${panel.title ? `<h3>${escapeHtml(panel.title)}</h3>` : ""}
      <p>${escapeHtml(panel.summary)}</p>
      ${link}
    </div>
  `;
}

function renderWeb(state: PopupLookupState): string {
  const panel = state.panelStates?.web;
  if (!panel || panel.status === "idle" || panel.status === "loading") {
    return `<div class="bl-status">Searching the web…</div>`;
  }

  if (panel.status === "error") {
    return `<div class="bl-status bl-error">${escapeHtml(panel.error ?? "Web search failed")}</div>`;
  }

  const groups = panel.searchGroups ?? [];
  const query = encodeURIComponent(state.word);

  const groupsHtml = groups
    .map((group) => {
      const items = group.items
        .slice(0, 4)
        .map(
          (item) => `
            <a class="bl-search-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
              <span class="bl-search-title">${escapeHtml(item.title)}</span>
              ${item.snippet ? `<span class="bl-search-snippet">${escapeHtml(item.snippet)}</span>` : ""}
            </a>`
        )
        .join("");

      const fallbackUrl =
        group.engine === "google"
          ? `https://www.google.com/search?q=${query}`
          : `https://duckduckgo.com/?q=${query}`;
      const body = group.items.length
        ? items
        : `<a class="bl-search-open" href="${fallbackUrl}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(group.label)} search ↗</a>`;

      return `<div class="bl-search-group"><div class="bl-search-engine">${escapeHtml(group.label)}</div>${body}</div>`;
    })
    .join("");

  if (groupsHtml.length === 0) {
    return `<div class="bl-status">No web results.</div>`;
  }

  return `<div class="bl-search">${groupsHtml}</div>`;
}

function renderActivePanel(state: PopupLookupState): string {
  switch (state.activePanel ?? "dictionary") {
    case "translate":
      return renderTranslate(state);
    case "wikipedia":
      return renderWikipedia(state);
    case "web":
      return renderWeb(state);
    default:
      return `${renderMorphology(state)}${renderEntries(state)}`;
  }
}

function renderRail(state: PopupLookupState): string {
  const panels = state.panels ?? [];
  if (panels.length === 0) {
    return "";
  }

  const active = state.activePanel ?? "dictionary";
  return `
    <nav class="bl-rail" aria-label="Lookup sources">
      ${panels
        .map((panel) => {
          const isActive = panel.id === active;
          const isLoading = state.panelStates?.[panel.id]?.status === "loading";
          return `<button class="bl-tab${isActive ? " active" : ""}${isLoading ? " loading" : ""}" data-panel="${panel.id}" type="button" title="${escapeHtml(panel.label)}" aria-label="${escapeHtml(panel.label)}" aria-pressed="${isActive}">${panel.icon}</button>`;
        })
        .join("")}
    </nav>
  `;
}

function template(state: PopupLookupState, theme: PopupTheme, size: PopupSize): string {
  const hasRail = (state.panels ?? []).length > 0;
  const t = THEMES[theme] ?? THEMES.parchment;
  const s = SIZES[size] ?? SIZES.medium;
  return `
    <style>
      :host {
        all: initial;
        --bl-bg: ${t.bg};
        --bl-surface: ${t.surface};
        --bl-fg: ${t.fg};
        --bl-muted: ${t.muted};
        --bl-border: ${t.border};
        --bl-accent: ${t.accent};
        --bl-accent-text: ${t.accentText};
        --bl-chip: ${t.chip};
        --bl-chip-text: ${t.chipText};
        --bl-minw: ${s.minW};
        --bl-maxw: ${s.maxW};
        --bl-word: ${s.word};
        --bl-fs: ${s.body};
      }

      .bl-shell {
        background: var(--bl-bg);
        border: 1px solid var(--bl-border);
        border-radius: 12px;
        box-shadow: 0 18px 50px rgba(15, 12, 8, 0.28), 0 2px 10px rgba(15, 12, 8, 0.16);
        color: var(--bl-fg);
        display: flex;
        font-family: "Noto Serif Bengali", "Noto Sans Bengali", Georgia, serif;
        max-width: min(var(--bl-maxw), calc(100vw - 20px));
        min-width: var(--bl-minw);
        overflow: hidden;
      }

      .bl-rail {
        background: var(--bl-surface);
        border-right: 1px solid var(--bl-border);
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 3px;
        padding: 9px 7px;
      }

      .bl-tab {
        align-items: center;
        appearance: none;
        background: transparent;
        border: 0;
        border-radius: 9px;
        color: var(--bl-muted);
        cursor: pointer;
        display: inline-flex;
        height: 38px;
        justify-content: center;
        padding: 0;
        transition: background 120ms ease, color 120ms ease;
        width: 38px;
      }

      .bl-tab:hover { background: var(--bl-chip); color: var(--bl-chip-text); }
      .bl-tab.active { background: var(--bl-accent); color: var(--bl-accent-text); }
      .bl-tab.loading { animation: bl-pulse 900ms ease-in-out infinite; }

      @keyframes bl-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

      .bl-main { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; }

      .bl-head {
        align-items: start;
        border-bottom: 1px solid var(--bl-border);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 13px 15px 11px;
      }

      .bl-word { font-size: var(--bl-word); font-weight: 700; line-height: 1.22; margin: 0; }

      .bl-lang {
        color: var(--bl-muted);
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
        letter-spacing: 0.08em;
        line-height: 1;
        margin-top: 5px;
        text-transform: uppercase;
      }

      .bl-close {
        align-items: center; appearance: none; background: transparent; border: 0; border-radius: 6px;
        color: var(--bl-muted); cursor: pointer; display: inline-flex; font: 18px/1 ui-sans-serif, system-ui, sans-serif;
        height: 28px; justify-content: center; padding: 0; width: 28px;
      }
      .bl-close:hover { background: var(--bl-surface); color: var(--bl-fg); }

      .bl-body { max-height: 360px; overflow-y: auto; padding: 12px 15px 14px; }

      .bl-morph {
        align-items: center; border-bottom: 1px solid var(--bl-border); color: var(--bl-muted);
        display: flex; flex-wrap: wrap; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px;
        gap: 6px; line-height: 1.25; margin: -1px 0 10px; padding-bottom: 9px;
      }
      .bl-morph span { background: var(--bl-chip); border-radius: 6px; padding: 4px 6px; }

      .bl-entry + .bl-entry { border-top: 1px solid var(--bl-border); margin-top: 10px; padding-top: 10px; }

      .bl-entry-meta {
        align-items: center; color: var(--bl-muted); display: flex; flex-wrap: wrap;
        font-family: ui-sans-serif, system-ui, sans-serif; font-size: calc(var(--bl-fs) - 1.5px);
        gap: 8px; line-height: 1.2; margin-bottom: 5px;
      }
      .bl-entry-meta span + span { border-left: 1px solid var(--bl-border); padding-left: 8px; }

      .bl-entry p, .bl-status, .bl-synonyms {
        font-family: ui-sans-serif, system-ui, sans-serif; font-size: var(--bl-fs); line-height: 1.45; margin: 0;
      }

      .bl-examples {
        color: var(--bl-muted); font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: calc(var(--bl-fs) - 1px); line-height: 1.4; list-style: none; margin: 7px 0 0; padding: 0;
      }
      .bl-examples li { border-left: 2px solid var(--bl-accent); margin-top: 5px; opacity: 0.92; padding-left: 8px; }

      .bl-synonyms { color: var(--bl-muted); margin-top: 6px; }
      .bl-status { color: var(--bl-muted); }
      .bl-error { color: #d9544a; }

      /* Translate */
      .bl-translate { font-family: ui-sans-serif, system-ui, sans-serif; }
      .bl-tl-row { display: flex; flex-direction: column; gap: 3px; }
      .bl-tl-lang { color: var(--bl-muted); font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
      .bl-tl-text { font-size: calc(var(--bl-fs) + 4px); line-height: 1.3; }
      .bl-tl-out { color: var(--bl-accent); font-weight: 600; }
      .bl-tl-sep { color: var(--bl-muted); font-size: 14px; margin: 7px 0; }
      .bl-badge {
        background: var(--bl-chip); border-radius: 6px; color: var(--bl-chip-text); display: inline-block;
        font-size: 10px; font-weight: 700; letter-spacing: 0.03em; margin-top: 12px; padding: 4px 7px; text-transform: uppercase;
      }

      /* Wikipedia */
      .bl-wiki { font-family: ui-sans-serif, system-ui, sans-serif; }
      .bl-wiki h3 { font-size: calc(var(--bl-fs) + 2px); margin: 0 0 6px; }
      .bl-wiki p { font-size: var(--bl-fs); line-height: 1.5; margin: 0; }
      .bl-readmore { color: var(--bl-accent); display: inline-block; font-family: ui-sans-serif, system-ui, sans-serif; font-size: calc(var(--bl-fs) - 1px); font-weight: 700; margin-top: 10px; text-decoration: none; }

      /* Web search */
      .bl-search { display: flex; flex-direction: column; font-family: ui-sans-serif, system-ui, sans-serif; gap: 14px; }
      .bl-search-engine { color: var(--bl-muted); font-size: 10px; font-weight: 800; letter-spacing: 0.06em; margin-bottom: 7px; text-transform: uppercase; }
      .bl-search-item { display: block; margin-bottom: 9px; text-decoration: none; }
      .bl-search-title { color: var(--bl-accent); display: block; font-size: var(--bl-fs); font-weight: 700; line-height: 1.3; }
      .bl-search-snippet { color: var(--bl-fg); display: block; font-size: calc(var(--bl-fs) - 1px); line-height: 1.4; margin-top: 2px; opacity: 0.85; }
      .bl-search-open { color: var(--bl-accent); font-size: calc(var(--bl-fs) - 1px); font-weight: 700; text-decoration: none; }
    </style>
    <section class="bl-shell" role="dialog" aria-label="BhashaLens dictionary result">
      ${renderRail(state)}
      <div class="bl-main">
        <header class="bl-head">
          <div>
            <h2 class="bl-word" lang="bn">${escapeHtml(state.word)}</h2>
            <div class="bl-lang">Bengali${hasRail ? ` · ${escapeHtml(state.activePanel ?? "dictionary")}` : ""}</div>
          </div>
          <button class="bl-close" type="button" aria-label="Close dictionary popup">×</button>
        </header>
        <div class="bl-body">
          ${renderActivePanel(state)}
        </div>
      </div>
    </section>
  `;
}

export class FloatingDictionaryPopup implements PopupController {
  private cleanupPosition?: () => void;
  private readonly doc: Document;
  private host?: HTMLDivElement;
  private lastAnchor?: DOMRect;
  private readonly onHide?: () => void;
  private readonly onSelectPanel?: (panel: PanelId) => void;
  private shadow?: ShadowRoot;
  private size: PopupSize;
  private theme: PopupTheme;

  constructor(doc: Document = document, options: FloatingDictionaryPopupOptions = {}) {
    this.doc = doc;
    this.onHide = options.onHide;
    this.onSelectPanel = options.onSelectPanel;
    this.size = options.size ?? "medium";
    this.theme = options.theme ?? "parchment";
  }

  setAppearance(theme: PopupTheme, size: PopupSize): void {
    this.theme = theme;
    this.size = size;
  }

  contains(node: Node): boolean {
    return Boolean(this.host?.contains(node));
  }

  destroy(): void {
    this.cleanupPosition?.();
    this.host?.remove();
    this.cleanupPosition = undefined;
    this.host = undefined;
    this.shadow = undefined;
    this.lastAnchor = undefined;
  }

  hide(): void {
    this.cleanupPosition?.();
    this.cleanupPosition = undefined;
    if (this.host) {
      this.host.hidden = true;
    }
    this.onHide?.();
  }

  show(anchor: DOMRect, state: PopupLookupState): void {
    this.lastAnchor = anchor;
    this.ensureHost();
    this.render(state);
    this.host!.hidden = false;
    this.position(anchor);
  }

  update(state: PopupLookupState): void {
    if (!this.host || !this.lastAnchor) {
      return;
    }

    this.render(state);
    this.position(this.lastAnchor);
  }

  private ensureHost(): void {
    if (this.host && this.shadow) {
      return;
    }

    const host = this.doc.createElement("div");
    host.setAttribute("data-bhashalens-popup", "");
    host.style.left = "0";
    host.style.pointerEvents = "auto";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.zIndex = POPUP_Z_INDEX;

    const shadow = host.attachShadow({ mode: "open" });
    this.doc.body.append(host);
    this.host = host;
    this.shadow = shadow;
  }

  private position(anchor: DOMRect): void {
    if (!this.host) {
      return;
    }

    this.cleanupPosition?.();

    const virtualReference: VirtualElement = {
      getBoundingClientRect: () => anchor
    };

    const update = () => {
      if (!this.host) {
        return;
      }

      void computePosition(virtualReference, this.host, {
        middleware: [offset(8), flip(), shift({ padding: 8 })],
        placement: "bottom-start",
        strategy: "fixed"
      }).then(({ x, y }) => {
        if (!this.host) {
          return;
        }

        this.host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    };

    this.cleanupPosition = autoUpdate(virtualReference, this.host, update);
    update();
  }

  private render(state: PopupLookupState): void {
    if (!this.shadow) {
      return;
    }

    this.shadow.innerHTML = template(state, this.theme, this.size);
    this.shadow.querySelector(".bl-close")?.addEventListener("click", () => this.hide());

    if (this.onSelectPanel) {
      this.shadow.querySelectorAll<HTMLButtonElement>(".bl-tab").forEach((button) => {
        button.addEventListener("click", () => {
          const panel = button.dataset.panel as PanelId | undefined;
          if (panel) {
            this.onSelectPanel?.(panel);
          }
        });
      });
    }
  }
}
