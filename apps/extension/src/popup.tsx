import { useDictionaryLookup } from "@bhashalens/react";
import { FormEvent, useEffect, useState } from "react";
import "./popup.css";
import { DEFAULT_SETTINGS, readExtensionSettings, writeExtensionSettings } from "./settings.js";

function Popup() {
  const [enabled, setEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_SETTINGS.apiBaseUrl);
  const [saved, setSaved] = useState(false);
  const [testWord, setTestWord] = useState("ভালো");
  const { error, lookup, result, status } = useDictionaryLookup({ baseUrl: apiBaseUrl, lang: "bn" });

  useEffect(() => {
    void readExtensionSettings().then((settings) => {
      setEnabled(settings.enabled);
      setApiBaseUrl(settings.apiBaseUrl);
    });
  }, []);

  async function updateEnabled(nextEnabled: boolean): Promise<void> {
    setEnabled(nextEnabled);
    await writeExtensionSettings({ enabled: nextEnabled });
    setSaved(true);
  }

  async function saveEndpoint(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await writeExtensionSettings({ apiBaseUrl: apiBaseUrl.trim() || DEFAULT_SETTINGS.apiBaseUrl });
    setSaved(true);
  }

  async function runLookup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await lookup(testWord);
  }

  return (
    <main className="popup">
      <header className="header">
        <div>
          <p className="eyebrow">BhashaLens</p>
          <h1>Inline Bengali dictionary</h1>
        </div>
        <label className="switch" title="Enable content script lookups">
          <input checked={enabled} onChange={(event) => void updateEnabled(event.currentTarget.checked)} type="checkbox" />
          <span />
        </label>
      </header>

      <section className="section">
        <form onSubmit={(event) => void saveEndpoint(event)}>
          <label htmlFor="api-url">Lookup API</label>
          <div className="row">
            <input
              id="api-url"
              onChange={(event) => {
                setApiBaseUrl(event.currentTarget.value);
                setSaved(false);
              }}
              spellCheck={false}
              type="url"
              value={apiBaseUrl}
            />
            <button type="submit">Save</button>
          </div>
        </form>
        {saved ? <p className="note">Settings saved. Open tabs update automatically.</p> : null}
      </section>

      <section className="section">
        <form onSubmit={(event) => void runLookup(event)}>
          <label htmlFor="test-word">Test lookup</label>
          <div className="row">
            <input
              id="test-word"
              lang="bn"
              onChange={(event) => setTestWord(event.currentTarget.value)}
              value={testWord}
            />
            <button disabled={status === "loading"} type="submit">
              {status === "loading" ? "..." : "Lookup"}
            </button>
          </div>
        </form>

        <div className="result" aria-live="polite">
          {status === "idle" ? <p>Click Bengali text on a page, or test the API here.</p> : null}
          {status === "empty" ? <p>No entry found for this word.</p> : null}
          {status === "error" ? <p className="error">{error}</p> : null}
          {status === "ready" && result?.entries[0] ? (
            <article>
              <div className="entryHead">
                <strong>{result.entries[0].word}</strong>
                <span>{result.entries[0].transliteration}</span>
                <span>{result.entries[0].partOfSpeech}</span>
              </div>
              <p>{result.entries[0].definition}</p>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default Popup;
