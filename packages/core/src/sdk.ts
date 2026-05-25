import { bengaliAdapter } from "./bengali.js";
import { FloatingDictionaryPopup } from "./popup.js";
import type {
  ActivationMode,
  DictionaryProvider,
  ExternalLookupLink,
  LanguageAdapter,
  LanguageCode,
  LookupCandidate,
  LookupResponse,
  MorphologyAnalysis,
  MorphologyCandidate,
  PopupController,
  PopupLookupState,
  WordSpan
} from "./types.js";

export interface BhashaLensOptions {
  activation?: ActivationMode;
  adapter?: LanguageAdapter;
  document?: Document;
  maxSelectionChars?: number;
  minWordLength?: number;
  highlight?: boolean;
  onError?: (error: unknown) => void;
  onLookupComplete?: (candidate: LookupCandidate, state: PopupLookupState) => void;
  onLookupStart?: (candidate: LookupCandidate) => void;
  popup?: PopupController;
  provider: DictionaryProvider;
}

const DEFAULT_MAX_SELECTION_CHARS = 64;
const DEFAULT_MIN_WORD_LENGTH = 1;
const CLICK_HIT_TEST_TOLERANCE_PX = 2;
const HIGHLIGHT_Z_INDEX = "2147483646";

function getWindow(doc: Document): Window | null {
  return doc.defaultView ?? null;
}

function getRangeFromPoint(doc: Document, x: number, y: number): Range | null {
  const rangeFromPoint = "caretRangeFromPoint" in doc ? doc.caretRangeFromPoint(x, y) : null;
  if (rangeFromPoint) {
    return rangeFromPoint;
  }

  const caretPositionFromPoint = doc.caretPositionFromPoint?.(x, y);
  if (!caretPositionFromPoint) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(caretPositionFromPoint.offsetNode, caretPositionFromPoint.offset);
  range.collapse(true);
  return range;
}

function firstUsableRect(range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  for (const item of Array.from(range.getClientRects())) {
    if (item.width > 0 || item.height > 0) {
      return item;
    }
  }

  return null;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function rectContainsPoint(rect: DOMRect, x: number, y: number, tolerance = 0): boolean {
  return (
    x >= rect.left - tolerance &&
    x <= rect.right + tolerance &&
    y >= rect.top - tolerance &&
    y <= rect.bottom + tolerance
  );
}

function usableRectsFromRange(range: Range): DOMRect[] {
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
}

function createExternalLookupLinks(word: string): ExternalLookupLink[] {
  const encoded = encodeURIComponent(word);
  const searchQuery = encodeURIComponent(`${word} বাংলা অর্থ`);

  return [
    {
      label: "Google",
      url: `https://www.google.com/search?q=${searchQuery}`
    },
    {
      label: "Wikipedia",
      url: `https://bn.wikipedia.org/wiki/Special:Search?search=${encoded}`
    },
    {
      label: "Translate",
      url: `https://translate.google.com/?sl=bn&tl=en&text=${encoded}&op=translate`
    }
  ];
}

class RangeHighlighter {
  private host?: HTMLDivElement;
  private readonly doc: Document;

  constructor(doc: Document) {
    this.doc = doc;
  }

  clear(): void {
    this.host?.remove();
    this.host = undefined;
  }

  show(rects: DOMRect[]): void {
    this.clear();

    const usableRects = rects.filter((rect) => rect.width > 0 || rect.height > 0);
    if (usableRects.length === 0) {
      return;
    }

    const host = this.doc.createElement("div");
    host.setAttribute("data-bhashalens-highlight", "");
    host.style.pointerEvents = "none";
    host.style.position = "fixed";
    host.style.zIndex = HIGHLIGHT_Z_INDEX;

    for (const rect of usableRects) {
      const marker = this.doc.createElement("div");
      marker.style.background = "rgba(214, 155, 69, 0.18)";
      marker.style.borderBottom = "2px solid #d69b45";
      marker.style.borderRadius = "3px";
      marker.style.height = `${Math.max(2, Math.round(rect.height))}px`;
      marker.style.left = `${Math.round(rect.left)}px`;
      marker.style.position = "fixed";
      marker.style.top = `${Math.round(rect.top)}px`;
      marker.style.width = `${Math.round(rect.width)}px`;
      host.append(marker);
    }

    this.doc.body.append(host);
    this.host = host;
  }
}

export class BhashaLens {
  private abortController?: AbortController;
  private readonly activation: ActivationMode;
  private readonly adapter: LanguageAdapter;
  private readonly doc: Document;
  private readonly highlighter?: RangeHighlighter;
  private lastLookupKey?: string;
  private mounted = false;
  private readonly maxSelectionChars: number;
  private readonly minWordLength: number;
  private readonly onError?: (error: unknown) => void;
  private readonly onLookupComplete?: (candidate: LookupCandidate, state: PopupLookupState) => void;
  private readonly onLookupStart?: (candidate: LookupCandidate) => void;
  private readonly popup: PopupController;
  private readonly provider: DictionaryProvider;

  constructor(options: BhashaLensOptions) {
    this.activation = options.activation ?? "selection";
    this.adapter = options.adapter ?? bengaliAdapter;
    this.doc = options.document ?? document;
    this.highlighter = options.highlight === false ? undefined : new RangeHighlighter(this.doc);
    this.maxSelectionChars = options.maxSelectionChars ?? DEFAULT_MAX_SELECTION_CHARS;
    this.minWordLength = options.minWordLength ?? DEFAULT_MIN_WORD_LENGTH;
    this.onError = options.onError;
    this.onLookupComplete = options.onLookupComplete;
    this.onLookupStart = options.onLookupStart;
    this.popup = options.popup ?? new FloatingDictionaryPopup(this.doc, { onHide: () => this.highlighter?.clear() });
    this.provider = options.provider;
  }

  destroy(): void {
    if (!this.mounted) {
      return;
    }

    const win = getWindow(this.doc);
    this.doc.removeEventListener("click", this.handleClick, true);
    this.doc.removeEventListener("keydown", this.handleKeyDown, true);
    this.doc.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.doc.removeEventListener("pointerup", this.handlePointerUp, true);
    win?.removeEventListener("scroll", this.handleScroll, true);
    this.abortController?.abort();
    this.highlighter?.clear();
    this.popup.destroy();
    this.mounted = false;
  }

  mount(): void {
    if (this.mounted) {
      return;
    }

    const win = getWindow(this.doc);
    this.doc.addEventListener("click", this.handleClick, true);
    this.doc.addEventListener("keydown", this.handleKeyDown, true);
    this.doc.addEventListener("pointerdown", this.handlePointerDown, true);
    this.doc.addEventListener("pointerup", this.handlePointerUp, true);
    win?.addEventListener("scroll", this.handleScroll, true);
    this.mounted = true;
  }

  async lookup(word: string): Promise<PopupLookupState> {
    const normalized = this.adapter.normalize(word);
    const result = await this.lookupWithFallbacks(normalized, this.adapter.lang);

    return {
      externalLinks: createExternalLookupLinks(normalized),
      lookupWord: result.lookupWord,
      matchedCandidate: result.matchedCandidate,
      morphology: result.morphology,
      normalized,
      response: result.response,
      status: result.response.entries.length > 0 ? "ready" : "empty",
      word
    };
  }

  private buildSelectionCandidate(): LookupCandidate | null {
    const selection = this.doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const text = selection.toString();
    if (text.length > this.maxSelectionChars || !this.adapter.detect(text)) {
      return null;
    }

    const span = this.extractFirstWord(text);
    if (!span) {
      return null;
    }

    const selectionRange = selection.getRangeAt(0);
    const rect = firstUsableRect(selectionRange);
    if (!rect) {
      return null;
    }

    return {
      highlightRects: usableRectsFromRange(selectionRange),
      lang: this.adapter.lang,
      normalized: span.normalized,
      rect,
      source: "selection",
      word: span.text
    };
  }

  private buildPointerCandidate(event: MouseEvent): LookupCandidate | null {
    const range = getRangeFromPoint(this.doc, event.clientX, event.clientY);
    if (!range || !isTextNode(range.startContainer)) {
      return null;
    }

    const textNode = range.startContainer;
    const span = this.adapter.extractWordAt(textNode.data, range.startOffset);
    if (!this.isUsableSpan(span)) {
      return null;
    }

    const wordRange = this.doc.createRange();
    wordRange.setStart(textNode, span.start);
    wordRange.setEnd(textNode, span.end);

    const rect = firstUsableRect(wordRange);
    const highlightRects = usableRectsFromRange(wordRange);
    wordRange.detach();

    if (!rect || !highlightRects.some((item) => rectContainsPoint(item, event.clientX, event.clientY, CLICK_HIT_TEST_TOLERANCE_PX))) {
      return null;
    }

    return {
      highlightRects,
      lang: this.adapter.lang,
      normalized: span.normalized,
      rect,
      source: "pointer",
      word: span.text
    };
  }

  private extractFirstWord(text: string): WordSpan | null {
    const normalizedText = this.adapter.normalize(text);

    for (let index = 0; index < normalizedText.length; index += 1) {
      const span = this.adapter.extractWordAt(normalizedText, index);
      if (this.isUsableSpan(span)) {
        return span;
      }
    }

    return null;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.activation === "selection") {
      return;
    }

    const selection = this.doc.getSelection();
    if (selection && !selection.isCollapsed && this.adapter.detect(selection.toString())) {
      return;
    }

    const candidate = this.buildPointerCandidate(event);
    if (candidate) {
      void this.lookupAndRender(candidate);
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.popup.hide();
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.popup.contains?.(target)) {
      return;
    }

    this.highlighter?.clear();
    this.popup.hide();
  };

  private readonly handlePointerUp = (): void => {
    if (this.activation === "click") {
      return;
    }

    const win = getWindow(this.doc);
    win?.setTimeout(() => {
      const candidate = this.buildSelectionCandidate();
      if (candidate) {
        void this.lookupAndRender(candidate);
      }
    }, 0);
  };

  private readonly handleScroll = (): void => {
    this.highlighter?.clear();
    this.popup.hide();
  };

  private isUsableSpan(span: WordSpan | null): span is WordSpan {
    return Boolean(span && span.normalized.length >= this.minWordLength && this.adapter.detect(span.normalized));
  }

  private async lookupAndRender(candidate: LookupCandidate): Promise<void> {
    const lookupKey = `${candidate.lang}:${candidate.normalized}:${candidate.source}`;
    this.lastLookupKey = lookupKey;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    const loadingState: PopupLookupState = {
      externalLinks: createExternalLookupLinks(candidate.normalized),
      morphology: this.adapter.analyzeMorphology?.(candidate.normalized),
      normalized: candidate.normalized,
      status: "loading",
      word: candidate.word
    };

    this.onLookupStart?.(candidate);
    this.highlighter?.show(candidate.highlightRects.length > 0 ? candidate.highlightRects : [candidate.rect]);
    this.popup.show(candidate.rect, loadingState);

    try {
      const result = await this.lookupWithFallbacks(candidate.normalized, candidate.lang, controller.signal);
      if (this.lastLookupKey !== lookupKey) {
        return;
      }

      const nextState: PopupLookupState = {
        externalLinks: createExternalLookupLinks(candidate.normalized),
        lookupWord: result.lookupWord,
        matchedCandidate: result.matchedCandidate,
        morphology: result.morphology,
        normalized: candidate.normalized,
        response: result.response,
        status: result.response.entries.length > 0 ? "ready" : "empty",
        word: candidate.word
      };

      this.popup.update(nextState);
      this.onLookupComplete?.(candidate, nextState);
    } catch (error) {
      if (controller.signal.aborted || this.lastLookupKey !== lookupKey) {
        return;
      }

      const nextState: PopupLookupState = {
        error: error instanceof Error ? error.message : "Lookup failed",
        externalLinks: createExternalLookupLinks(candidate.normalized),
        morphology: this.adapter.analyzeMorphology?.(candidate.normalized),
        normalized: candidate.normalized,
        status: "error",
        word: candidate.word
      };

      this.popup.update(nextState);
      this.onError?.(error);
      this.onLookupComplete?.(candidate, nextState);
    }
  }

  private async lookupWithFallbacks(
    word: string,
    lang: LanguageCode,
    signal?: AbortSignal
  ): Promise<{
    lookupWord: string;
    matchedCandidate?: MorphologyCandidate;
    morphology?: MorphologyAnalysis;
    response: LookupResponse;
  }> {
    const morphology = this.adapter.analyzeMorphology?.(word);
    const candidates = morphology?.candidates.length
      ? morphology.candidates
      : [
          {
            confidence: 1,
            normalized: word,
            reason: "exact" as const
          }
        ];

    let firstResponse: LookupResponse | undefined;

    for (const candidate of candidates) {
      const response = await this.provider.lookup(candidate.normalized, lang, signal);
      firstResponse ??= response;

      if (response.entries.length > 0) {
        return {
          lookupWord: response.lookupWord ?? candidate.normalized,
          matchedCandidate: response.matchedCandidate ?? candidate,
          morphology: response.morphology ?? morphology,
          response
        };
      }
    }

    return {
      lookupWord: candidates[0]?.normalized ?? word,
      matchedCandidate: firstResponse?.matchedCandidate ?? candidates[0],
      morphology: firstResponse?.morphology ?? morphology,
      response: firstResponse ?? (await this.provider.lookup(word, lang, signal))
    };
  }
}
