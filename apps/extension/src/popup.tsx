import { useDictionaryLookup } from "@bhashalens/react";
import type { ActivationMode, DictionaryEntry, PanelId, PopupSize, PopupTheme } from "@bhashalens/core";
import { FormEvent, useCallback, useEffect, useState } from "react";
import "./popup.css";
import { DEFAULT_SETTINGS, readExtensionSettings, writeExtensionSettings, type BhashaLensSettings } from "./settings.js";

type Tab = "general" | "sources" | "test";
type ConnectionStatus = "unknown" | "checking" | "online" | "offline";

const activationOptions: Array<{ label: string; value: ActivationMode }> = [
  { label: "Select", value: "selection" },
  { label: "Click", value: "click" },
  { label: "Both", value: "both" }
];

const sizeOptions: Array<{ label: string; value: PopupSize }> = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" }
];

const themeOptions: Array<{ label: string; value: PopupTheme; swatch: string; ink: string }> = [
  { label: "Parchment", value: "parchment", swatch: "#fffaf0", ink: "#27745d" },
  { label: "Green", value: "green", swatch: "#e2efe6", ink: "#1f7a55" },
  { label: "Dark", value: "dark", swatch: "#20262b", ink: "#3fae86" },
  { label: "Light", value: "light", swatch: "#ffffff", ink: "#1f7a55" }
];

const sourceOptions: Array<{ id: PanelId; label: string; description: string; locked?: boolean }> = [
  { id: "dictionary", label: "Dictionary", description: "Curated + Wiktionary entries", locked: true },
  { id: "translate", label: "Translate", description: "Machine translation fallback" },
  { id: "wikipedia", label: "Wikipedia", description: "Article summary" },
  { id: "web", label: "Web search", description: "DuckDuckGo + Google results" }
];

function EntryCard({ entry }: { entry: DictionaryEntry }) {
  return (
    <article className="entry">
      <div className="entryHead">
        <strong lang="bn">{entry.word}</strong>
        {entry.transliteration ? <span className="chip">{entry.transliteration}</span> : null}
        {entry.ipa ? <span className="chip ipa">{entry.ipa}</span> : null}
        <span className="chip pos">{entry.partOfSpeech}</span>
      </div>
      <p className="def">{entry.definition}</p>
      {entry.examples?.length ? (
        <ul className="examples">
          {entry.examples.slice(0, 2).map((example) => (
            <li key={example} lang="bn">{example}</li>
          ))}
        </ul>
      ) : null}
      {entry.synonyms?.length ? (
        <p className="synonyms"><span>Synonyms</span> {entry.synonyms.slice(0, 6).join(", ")}</p>
      ) : null}
    </article>
  );
}

function Popup() {
  const [settings, setSettings] = useState<BhashaLensSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("general");
  const [connection, setConnection] = useState<ConnectionStatus>("unknown");
  const [apiDraft, setApiDraft] = useState(DEFAULT_SETTINGS.apiBaseUrl);
  const [testWord, setTestWord] = useState("ভালোবাসা");
  const { error, lookup, result, status } = useDictionaryLookup({ baseUrl: settings.apiBaseUrl, lang: "bn" });

  const checkConnection = useCallback(async (baseUrl: string) => {
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!url) {
      setConnection("offline");
      return;
    }
    setConnection("checking");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timer);
      setConnection(response.ok ? "online" : "offline");
    } catch {
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    void readExtensionSettings().then((loaded) => {
      setSettings(loaded);
      setApiDraft(loaded.apiBaseUrl);
      void checkConnection(loaded.apiBaseUrl);
    });
  }, [checkConnection]);

  const patch = useCallback(async (next: Partial<BhashaLensSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
    await writeExtensionSettings(next);
  }, []);

  function togglePanel(id: PanelId): void {
    const active = new Set(settings.panels);
    if (active.has(id)) {
      active.delete(id);
    } else {
      active.add(id);
    }
    active.add("dictionary");
    const ordered = (["dictionary", "translate", "wikipedia", "web"] as PanelId[]).filter((panel) => active.has(panel));
    void patch({ panels: ordered });
  }

  async function saveApi(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = apiDraft.trim() || DEFAULT_SETTINGS.apiBaseUrl;
    setApiDraft(next);
    await patch({ apiBaseUrl: next });
    void checkConnection(next);
  }

  async function runLookup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await lookup(testWord);
  }

  const connectionLabel: Record<ConnectionStatus, string> = {
    unknown: "Not checked",
    checking: "Checking…",
    online: "Connected",
    offline: "Offline"
  };

  return (
    <main className={`popup${settings.enabled ? "" : " disabled"}`}>
      <header className="header">
        <div>
          <p className="eyebrow">BhashaLens</p>
          <h1>Inline Bengali dictionary</h1>
        </div>
        <label className="switch" title={settings.enabled ? "Lookups enabled" : "Lookups paused"}>
          <input checked={settings.enabled} onChange={(e) => void patch({ enabled: e.currentTarget.checked })} type="checkbox" />
          <span />
        </label>
      </header>

      <nav className="tabs" role="tablist">
        {(["general", "sources", "test"] as Tab[]).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} type="button">
            {id === "general" ? "General" : id === "sources" ? "Sources" : "Test"}
          </button>
        ))}
      </nav>

      {tab === "general" ? (
        <div className="panel">
          <section className="block">
            <div className="fieldHead"><label>Trigger</label><span>{settings.activation === "selection" ? "Best UX" : "Advanced"}</span></div>
            <div className="segmented" role="group" aria-label="Lookup trigger">
              {activationOptions.map((option) => (
                <button key={option.value} aria-pressed={settings.activation === option.value} className={settings.activation === option.value ? "active" : ""} onClick={() => void patch({ activation: option.value })} type="button">
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {settings.activation !== "click" ? (
            <section className="block">
              <label className="rowToggle">
                <span>
                  Bubble first on select
                  <small>Suppress the browser's native menu (Alt+right-click bypasses)</small>
                </span>
                <input type="checkbox" checked={settings.blockNativeMenu} onChange={(e) => void patch({ blockNativeMenu: e.currentTarget.checked })} />
              </label>
            </section>
          ) : null}

          <section className="block">
            <label>Theme</label>
            <div className="swatches">
              {themeOptions.map((option) => (
                <button key={option.value} className={`swatch${settings.theme === option.value ? " active" : ""}`} style={{ background: option.swatch }} onClick={() => void patch({ theme: option.value })} title={option.label} type="button" aria-pressed={settings.theme === option.value}>
                  <i style={{ background: option.ink }} />
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <label>Bubble size</label>
            <div className="segmented" role="group" aria-label="Bubble size">
              {sizeOptions.map((option) => (
                <button key={option.value} aria-pressed={settings.size === option.value} className={settings.size === option.value ? "active" : ""} onClick={() => void patch({ size: option.value })} type="button">
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="panel">
          <section className="block">
            <form onSubmit={(e) => void saveApi(e)}>
              <div className="fieldHead">
                <label htmlFor="api-url">Lookup API</label>
                <span className={`status status-${connection}`}><i className="dot" /> {connectionLabel[connection]}</span>
              </div>
              <div className="row">
                <input id="api-url" type="url" spellCheck={false} value={apiDraft} onChange={(e) => { setApiDraft(e.currentTarget.value); setConnection("unknown"); }} />
                <button type="submit">Save</button>
              </div>
            </form>
            {connection === "offline" ? <p className="note warn">Can’t reach the API. Run <code>pnpm --filter @bhashalens/api dev</code>.</p> : null}
          </section>

          <section className="block">
            <label>Bubble tabs (data sources)</label>
            <div className="sources">
              {sourceOptions.map((source) => {
                const on = settings.panels.includes(source.id);
                return (
                  <label key={source.id} className={`sourceRow${on ? " on" : ""}${source.locked ? " locked" : ""}`}>
                    <span><strong>{source.label}</strong><small>{source.description}</small></span>
                    <input type="checkbox" checked={on} disabled={source.locked} onChange={() => togglePanel(source.id)} />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="block">
            <div className="row2">
              <div>
                <label htmlFor="wiki-lang">Wikipedia lang</label>
                <input id="wiki-lang" value={settings.wikipediaLang} spellCheck={false} onChange={(e) => void patch({ wikipediaLang: e.currentTarget.value.trim() || "bn" })} />
              </div>
              <div>
                <label htmlFor="tl">Translate to</label>
                <input id="tl" value={settings.translateTo} spellCheck={false} onChange={(e) => void patch({ translateTo: e.currentTarget.value.trim() || "en" })} />
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "test" ? (
        <div className="panel">
          <section className="block">
            <form onSubmit={(e) => void runLookup(e)}>
              <label htmlFor="test-word">Test lookup</label>
              <div className="row">
                <input id="test-word" lang="bn" value={testWord} placeholder="বাংলা শব্দ লিখুন" onChange={(e) => setTestWord(e.currentTarget.value)} />
                <button disabled={status === "loading"} type="submit">{status === "loading" ? "…" : "Lookup"}</button>
              </div>
            </form>
            <div className="result" aria-live="polite">
              {status === "idle" ? <p className="hint">Select Bengali text on a page, or test the API here.</p> : null}
              {status === "loading" ? <p className="hint">Looking up…</p> : null}
              {status === "empty" ? <p className="hint">No entry found for this word.</p> : null}
              {status === "error" ? <p className="error">{error}</p> : null}
              {status === "ready" && result?.entries.length ? (
                <>
                  <div className="resultMeta">
                    {result.entries.length} {result.entries.length === 1 ? "sense" : "senses"}
                    {typeof result.latencyMs === "number" ? ` · ${result.latencyMs} ms` : ""}
                  </div>
                  <div className="entries">
                    {result.entries.slice(0, 4).map((entry, index) => (
                      <EntryCard entry={entry} key={`${entry.word}-${entry.partOfSpeech}-${index}`} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default Popup;
