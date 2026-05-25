import { bengaliAdapter } from "./bengali.js";
import { FloatingDictionaryPopup } from "./popup.js";
import type {
  ActivationMode,
  DictionaryProvider,
  LanguageAdapter,
  LookupCandidate,
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
  onError?: (error: unknown) => void;
  onLookupComplete?: (candidate: LookupCandidate, state: PopupLookupState) => void;
  onLookupStart?: (candidate: LookupCandidate) => void;
  popup?: PopupController;
  provider: DictionaryProvider;
}

const DEFAULT_MAX_SELECTION_CHARS = 64;
const DEFAULT_MIN_WORD_LENGTH = 1;

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

export class BhashaLens {
  private abortController?: AbortController;
  private readonly activation: ActivationMode;
  private readonly adapter: LanguageAdapter;
  private readonly doc: Document;
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
    this.activation = options.activation ?? "both";
    this.adapter = options.adapter ?? bengaliAdapter;
    this.doc = options.document ?? document;
    this.maxSelectionChars = options.maxSelectionChars ?? DEFAULT_MAX_SELECTION_CHARS;
    this.minWordLength = options.minWordLength ?? DEFAULT_MIN_WORD_LENGTH;
    this.onError = options.onError;
    this.onLookupComplete = options.onLookupComplete;
    this.onLookupStart = options.onLookupStart;
    this.popup = options.popup ?? new FloatingDictionaryPopup(this.doc);
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
    const response = await this.provider.lookup(normalized, this.adapter.lang);

    return {
      normalized,
      response,
      status: response.entries.length > 0 ? "ready" : "empty",
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

    const rect = firstUsableRect(selection.getRangeAt(0));
    if (!rect) {
      return null;
    }

    return {
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
    wordRange.detach();

    if (!rect) {
      return null;
    }

    return {
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
      normalized: candidate.normalized,
      status: "loading",
      word: candidate.word
    };

    this.onLookupStart?.(candidate);
    this.popup.show(candidate.rect, loadingState);

    try {
      const response = await this.provider.lookup(candidate.normalized, candidate.lang, controller.signal);
      if (this.lastLookupKey !== lookupKey) {
        return;
      }

      const nextState: PopupLookupState = {
        normalized: candidate.normalized,
        response,
        status: response.entries.length > 0 ? "ready" : "empty",
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
        normalized: candidate.normalized,
        status: "error",
        word: candidate.word
      };

      this.popup.update(nextState);
      this.onError?.(error);
      this.onLookupComplete?.(candidate, nextState);
    }
  }
}
