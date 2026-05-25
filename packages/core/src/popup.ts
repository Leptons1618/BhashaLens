import { autoUpdate, computePosition, flip, offset, shift, type VirtualElement } from "@floating-ui/dom";
import type { PopupController, PopupLookupState } from "./types.js";

const POPUP_Z_INDEX = "2147483647";

export interface FloatingDictionaryPopupOptions {
  onHide?: () => void;
}

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
    return `<div class="bl-status">No dictionary entry yet.</div>`;
  }

  return state.response.entries
    .slice(0, 3)
    .map((entry) => {
      const synonyms = entry.synonyms?.length
        ? `<div class="bl-synonyms">${entry.synonyms.map(escapeHtml).join(", ")}</div>`
        : "";

      return `
        <article class="bl-entry">
          <div class="bl-entry-meta">
            <span>${escapeHtml(entry.transliteration)}</span>
            <span>${escapeHtml(entry.partOfSpeech)}</span>
          </div>
          <p>${escapeHtml(entry.definition)}</p>
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

function renderExternalLinks(state: PopupLookupState): string {
  if (!state.externalLinks?.length) {
    return "";
  }

  return `
    <nav class="bl-links" aria-label="External lookups">
      ${state.externalLinks
        .map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`)
        .join("")}
    </nav>
  `;
}

function template(state: PopupLookupState): string {
  return `
    <style>
      :host {
        all: initial;
      }

      .bl-shell {
        background: #fffaf0;
        border: 1px solid rgba(45, 31, 19, 0.16);
        border-radius: 8px;
        box-shadow: 0 18px 50px rgba(29, 25, 20, 0.22), 0 2px 10px rgba(29, 25, 20, 0.12);
        color: #261b12;
        font-family: "Noto Serif Bengali", "Noto Sans Bengali", Georgia, serif;
        max-width: min(360px, calc(100vw - 20px));
        min-width: 230px;
        overflow: hidden;
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

      .bl-links {
        border-top: 1px solid rgba(45, 31, 19, 0.1);
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 11px;
        padding-top: 10px;
      }

      .bl-links a {
        background: rgba(39, 116, 93, 0.1);
        border-radius: 6px;
        color: #245f4d;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        padding: 7px 8px;
        text-decoration: none;
      }

      .bl-links a:hover {
        background: rgba(39, 116, 93, 0.16);
      }
    </style>
    <section class="bl-shell" role="dialog" aria-label="BhashaLens dictionary result">
      <header class="bl-head">
        <div>
          <h2 class="bl-word">${escapeHtml(state.word)}</h2>
          <div class="bl-lang">Bengali</div>
        </div>
        <button class="bl-close" type="button" aria-label="Close dictionary popup">×</button>
      </header>
      <div class="bl-body">
        ${renderMorphology(state)}
        ${renderEntries(state)}
        ${renderExternalLinks(state)}
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
  private shadow?: ShadowRoot;

  constructor(doc: Document = document, options: FloatingDictionaryPopupOptions = {}) {
    this.doc = doc;
    this.onHide = options.onHide;
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
  }
}
