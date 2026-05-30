import { autoUpdate, computePosition, flip, offset, shift, type VirtualElement } from "@floating-ui/dom";
import type { PanelDescriptor, PanelId, PopupController, PopupLookupState } from "./types.js";

const POPUP_Z_INDEX = "2147483647";

export interface FloatingDictionaryPopupOptions {
  onHide?: () => void;
  onSelectPanel?: (panel: PanelId) => void;
}

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
  const links = state.panelStates?.web?.links ?? state.externalLinks ?? [];
  if (links.length === 0) {
    return `<div class="bl-status">No web links available.</div>`;
  }

  return `
    <nav class="bl-weblinks" aria-label="External lookups">
      ${links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(link.label)}</span><span aria-hidden="true">↗</span></a>`
        )
        .join("")}
    </nav>
  `;
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

function template(state: PopupLookupState): string {
  const hasRail = (state.panels ?? []).length > 0;
  return `
    <style>
      :host {
        all: initial;
      }

      .bl-shell {
        background: #fffaf0;
        border: 1px solid rgba(45, 31, 19, 0.16);
        border-radius: 10px;
        box-shadow: 0 18px 50px rgba(29, 25, 20, 0.22), 0 2px 10px rgba(29, 25, 20, 0.12);
        color: #261b12;
        display: flex;
        font-family: "Noto Serif Bengali", "Noto Sans Bengali", Georgia, serif;
        max-width: min(400px, calc(100vw - 20px));
        min-width: 268px;
        overflow: hidden;
      }

      .bl-rail {
        background: #f4ead8;
        border-right: 1px solid rgba(45, 31, 19, 0.12);
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 2px;
        padding: 8px 6px;
      }

      .bl-tab {
        align-items: center;
        appearance: none;
        background: transparent;
        border: 0;
        border-radius: 8px;
        color: #8a6a4c;
        cursor: pointer;
        display: inline-flex;
        height: 34px;
        justify-content: center;
        padding: 0;
        transition: background 120ms ease, color 120ms ease;
        width: 34px;
      }

      .bl-tab:hover {
        background: rgba(39, 116, 93, 0.12);
        color: #245f4d;
      }

      .bl-tab.active {
        background: #27745d;
        color: #fffaf0;
      }

      .bl-tab.loading {
        animation: bl-pulse 900ms ease-in-out infinite;
      }

      @keyframes bl-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }

      .bl-main {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-width: 0;
      }

      .bl-head {
        align-items: start;
        border-bottom: 1px solid rgba(45, 31, 19, 0.12);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 12px 14px 10px;
      }

      .bl-word {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.22;
        margin: 0;
      }

      .bl-lang {
        color: #765c45;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
        letter-spacing: 0.08em;
        line-height: 1;
        margin-top: 5px;
        text-transform: uppercase;
      }

      .bl-close {
        align-items: center;
        appearance: none;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: #765c45;
        cursor: pointer;
        display: inline-flex;
        font: 18px/1 ui-sans-serif, system-ui, sans-serif;
        height: 28px;
        justify-content: center;
        padding: 0;
        width: 28px;
      }

      .bl-close:hover {
        background: rgba(83, 62, 42, 0.08);
        color: #261b12;
      }

      .bl-body {
        max-height: 340px;
        overflow-y: auto;
        padding: 11px 14px 13px;
      }

      .bl-morph {
        align-items: center;
        border-bottom: 1px solid rgba(45, 31, 19, 0.1);
        color: #6e4f38;
        display: flex;
        flex-wrap: wrap;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 11px;
        gap: 6px;
        line-height: 1.25;
        margin: -1px 0 10px;
        padding-bottom: 9px;
      }

      .bl-morph span {
        background: rgba(39, 116, 93, 0.08);
        border-radius: 6px;
        padding: 4px 6px;
      }

      .bl-entry + .bl-entry {
        border-top: 1px solid rgba(45, 31, 19, 0.1);
        margin-top: 10px;
        padding-top: 10px;
      }

      .bl-entry-meta {
        align-items: center;
        color: #6e4f38;
        display: flex;
        flex-wrap: wrap;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        gap: 8px;
        line-height: 1.2;
        margin-bottom: 5px;
      }

      .bl-entry-meta span + span {
        border-left: 1px solid rgba(45, 31, 19, 0.18);
        padding-left: 8px;
      }

      .bl-entry p,
      .bl-status,
      .bl-synonyms {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 13px;
        letter-spacing: 0;
        line-height: 1.45;
        margin: 0;
      }

      .bl-examples {
        color: #4a3a2c;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        list-style: none;
        margin: 7px 0 0;
        padding: 0;
      }

      .bl-examples li {
        border-left: 2px solid rgba(39, 116, 93, 0.3);
        margin-top: 5px;
        padding-left: 8px;
      }

      .bl-synonyms {
        color: #765c45;
        margin-top: 6px;
      }

      .bl-status {
        color: #5f4a38;
      }

      .bl-error {
        color: #9f2d20;
      }

      /* Translate panel */
      .bl-translate {
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .bl-tl-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .bl-tl-lang {
        color: #8a6a4c;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .bl-tl-text {
        font-size: 17px;
        line-height: 1.3;
      }

      .bl-tl-out {
        color: #1f5946;
        font-weight: 600;
      }

      .bl-tl-sep {
        color: #b08a5e;
        font-size: 14px;
        margin: 7px 0;
      }

      .bl-badge {
        background: rgba(176, 138, 94, 0.14);
        border-radius: 6px;
        color: #7a5a3a;
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        margin-top: 12px;
        padding: 4px 7px;
        text-transform: uppercase;
      }

      /* Wikipedia panel */
      .bl-wiki {
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .bl-wiki h3 {
        font-size: 15px;
        margin: 0 0 6px;
      }

      .bl-wiki p {
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
      }

      .bl-readmore,
      .bl-weblinks a {
        color: #245f4d;
        font-weight: 700;
        text-decoration: none;
      }

      .bl-readmore {
        display: inline-block;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        margin-top: 10px;
      }

      .bl-weblinks {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .bl-weblinks a {
        align-items: center;
        background: rgba(39, 116, 93, 0.1);
        border-radius: 7px;
        display: flex;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 13px;
        justify-content: space-between;
        padding: 9px 11px;
      }

      .bl-weblinks a:hover {
        background: rgba(39, 116, 93, 0.18);
      }
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

  constructor(doc: Document = document, options: FloatingDictionaryPopupOptions = {}) {
    this.doc = doc;
    this.onHide = options.onHide;
    this.onSelectPanel = options.onSelectPanel;
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

    this.shadow.innerHTML = template(state);
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
