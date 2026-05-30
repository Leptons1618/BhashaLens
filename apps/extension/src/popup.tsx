import { useDictionaryLookup } from "@bhashalens/react";
import type { ActivationMode, DictionaryEntry } from "@bhashalens/core";
import { FormEvent, useCallback, useEffect, useState } from "react";
import "./popup.css";
import { DEFAULT_SETTINGS, readExtensionSettings, writeExtensionSettings } from "./settings.js";

const activationOptions: Array<{ label: string; value: ActivationMode; hint: string }> = [
  { label: "Select", value: "selection", hint: "Highlight text" },
  { label: "Click", value: "click", hint: "Click a word" },
  { label: "Both", value: "both", hint: "Select or click" }
];

type ConnectionStatus = "unknown" | "checking" | "online" | "offline";

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
            <li key={example} lang="bn">
              {example}
            </li>
          ))}
        </ul>
      ) : null}
      {entry.synonyms?.length ? (
        <p className="synonyms">
          <span>Synonyms</span> {entry.synonyms.slice(0, 6).join(", ")}
        </p>
      ) : null}
      {entry.source ? <span className="source">{entry.source}</span> : null}
    </article>
  );
}

function Popup() {
  const [activation, setActivation] = useState<ActivationMode>(DEFAULT_SETTINGS.activation);
  const [enabled, setEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_SETTINGS.apiBaseUrl);
  const [saved, setSaved] = useState(false);
  const [testWord, setTestWord] = useState("ভালোবাসা");
  const [connection, setConnection] = useState<ConnectionStatus>("unknown");
  const { error, lookup, result, status } = useDictionaryLookup({ baseUrl: apiBaseUrl, lang: "bn" });

  const checkConnection = useCallback(async (baseUrl: string) => {
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!url) {
      setConnection("offline");
      return;
    }
    setConnection("checking");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      setConnection(response.ok ? "online" : "offline");
    } catch {
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    void readExtensionSettings().then((settings) => {
      setActivation(settings.activation);
      setEnabled(settings.enabled);
      setApiBaseUrl(settings.apiBaseUrl);
      void checkConnection(settings.apiBaseUrl);
    });
  }, [checkConnection]);

  async function updateActivation(nextActivation: ActivationMode): Promise<void> {
    setActivation(nextActivation);
    await writeExtensionSettings({ activation: nextActivation });
    setSaved(true);
  }

  async function updateEnabled(nextEnabled: boolean): Promise<void> {
    setEnabled(nextEnabled);
    await writeExtensionSettings({ enabled: nextEnabled });
    setSaved(true);
  }

  async function saveEndpoint(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = apiBaseUrl.trim() || DEFAULT_SETTINGS.apiBaseUrl;
    setApiBaseUrl(next);
    await writeExtensionSettings({ apiBaseUrl: next });
    setSaved(true);
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
    <main className={`popup${enabled ? "" : " disabled"}`}>
      <header className="header">
        <div>
          <p className="eyebrow">BhashaLens</p>
          <h1>Inline Bengali dictionary</h1>
        </div>
        <label className="switch" title={enabled ? "Lookups enabled" : "Lookups paused"}>
          <input checked={enabled} onChange={(event) => void updateEnabled(event.currentTarget.checked)} type="checkbox" />
          <span />
        </label>
      </header>

      <section className="section">
        <div className="fieldHead">
          <label>Trigger</label>
          <span>{activation === "selection" ? "Best UX" : "Advanced"}</span>
        </div>
        <div className="segmented" role="group" aria-label="Lookup trigger mode">
          {activationOptions.map((option) => (
            <button
              aria-pressed={activation === option.value}
              className={activation === option.value ? "active" : ""}
              key={option.value}
              onClick={() => void updateActivation(option.value)}
              title={option.hint}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <form onSubmit={(event) => void saveEndpoint(event)}>
          <div className="fieldHead">
            <label htmlFor="api-url">Lookup API</label>
            <span className={`status status-${connection}`}>
              <i className="dot" /> {connectionLabel[connection]}
            </span>
          </div>
          <div className="row">
            <input
              id="api-url"
              onChange={(event) => {
                setApiBaseUrl(event.currentTarget.value);
                setSaved(false);
                setConnection("unknown");
              }}
              spellCheck={false}
              type="url"
              value={apiBaseUrl}
            />
            <button type="submit">Save</button>
          </div>
        </form>
        {saved ? <p className="note">Settings saved. Open tabs update automatically.</p> : null}
        {connection === "offline" ? (
          <p className="note warn">Can’t reach the API. Start it with <code>pnpm --filter @bhashalens/api dev</code>.</p>
        ) : null}
      </section>

      <section className="section">
        <form onSubmit={(event) => void runLookup(event)}>
          <label htmlFor="test-word">Test lookup</label>
          <div className="row">
            <input
              id="test-word"
              lang="bn"
              onChange={(event) => setTestWord(event.currentTarget.value)}
              placeholder="বাংলা শব্দ লিখুন"
              value={testWord}
            />
            <button disabled={status === "loading"} type="submit">
              {status === "loading" ? "…" : "Lookup"}
            </button>
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
                {result.matchedCandidate && result.matchedCandidate.reason !== "exact"
                  ? ` · root: ${result.lookupWord ?? ""}`
                  : ""}
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
    </main>
  );
}

export default Popup;
