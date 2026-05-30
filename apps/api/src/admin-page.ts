/**
 * Self-contained admin dictionary editor page served at `/admin`.
 * No build step or external assets — plain HTML/CSS/JS that talks to the
 * `/admin/entries` CRUD API on the same origin. User data is rendered via
 * textContent (never innerHTML), so entries cannot inject markup.
 */
export const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BhashaLens · Dictionary Admin</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: linear-gradient(180deg, #fffdf7 0%, #fbf2e2 100%);
    color: #271b12;
    font-family: ui-sans-serif, system-ui, "Noto Sans Bengali", sans-serif;
    margin: 0;
    min-height: 100vh;
    padding: 24px;
  }
  h1 { font-family: "Noto Serif Bengali", Georgia, serif; font-size: 22px; margin: 0; }
  .wrap { margin: 0 auto; max-width: 1080px; }
  header { align-items: center; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 6px; }
  .eyebrow { color: #8a6244; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; margin: 0 0 4px; text-transform: uppercase; }
  .stats { color: #6b513d; font-size: 13px; margin: 0 0 18px; }
  .toolbar { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  input, select, textarea, button {
    border: 1px solid rgba(39, 27, 18, 0.2); border-radius: 8px; color: #271b12; font: inherit; padding: 9px 11px;
  }
  input, textarea, select { background: #fffef9; }
  input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid #27745d; outline-offset: 1px; }
  #search { flex: 1; min-width: 220px; }
  .grow { flex: 1; }
  button {
    background: #271b12; border: 0; color: #fffaf0; cursor: pointer; font-weight: 700; padding: 9px 14px;
  }
  button.secondary { background: rgba(39, 27, 18, 0.08); color: #4a3526; }
  button.danger { background: transparent; color: #9f2d20; border: 1px solid rgba(159, 45, 32, 0.3); padding: 6px 10px; }
  button.ghost { background: transparent; border: 1px solid rgba(39, 27, 18, 0.2); color: #4a3526; padding: 6px 10px; }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  table { background: #fffef9; border: 1px solid rgba(39, 27, 18, 0.12); border-collapse: collapse; border-radius: 10px; overflow: hidden; width: 100%; }
  th, td { font-size: 13px; padding: 10px 12px; text-align: left; vertical-align: top; }
  th { background: #f4ead8; color: #604631; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
  tbody tr { border-top: 1px solid rgba(39, 27, 18, 0.08); }
  tbody tr:hover { background: rgba(39, 116, 93, 0.04); }
  .word { font-family: "Noto Serif Bengali", Georgia, serif; font-size: 16px; font-weight: 700; }
  .def { max-width: 360px; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .badge { background: rgba(39, 116, 93, 0.12); border-radius: 6px; color: #245f4d; font-size: 11px; font-weight: 700; padding: 3px 7px; white-space: nowrap; }
  .actions { white-space: nowrap; }
  .actions button + button { margin-left: 6px; }
  .pager { align-items: center; display: flex; gap: 12px; justify-content: flex-end; margin-top: 14px; }
  .pager span { color: #6b513d; font-size: 13px; }
  .empty { color: #8a6244; padding: 28px; text-align: center; }
  .error { background: #fde8e4; border: 1px solid #f0bcb2; border-radius: 8px; color: #9f2d20; display: none; font-size: 13px; margin-bottom: 12px; padding: 9px 12px; }
  /* Modal */
  .overlay { background: rgba(29, 20, 12, 0.4); display: none; inset: 0; padding: 24px; position: fixed; z-index: 50; }
  .overlay.open { align-items: flex-start; display: flex; justify-content: center; }
  .modal { background: #fffaf0; border-radius: 12px; box-shadow: 0 24px 60px rgba(29, 20, 12, 0.3); max-width: 560px; padding: 20px; width: 100%; }
  .modal h2 { font-size: 17px; margin: 0 0 14px; }
  .field { margin-bottom: 12px; }
  .field label { color: #604631; display: block; font-size: 12px; font-weight: 700; margin-bottom: 5px; }
  .field input, .field textarea, .field select { width: 100%; }
  .field textarea { min-height: 56px; resize: vertical; }
  .row2 { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
  .hint { color: #8a6244; font-size: 11px; margin-top: 3px; }
  .token { width: 150px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <p class="eyebrow">BhashaLens</p>
      <h1>Dictionary Admin</h1>
    </div>
    <input id="token" class="token" type="password" placeholder="Admin token (if set)" title="Sent as x-admin-token" />
  </header>
  <p class="stats" id="stats">Loading…</p>

  <div class="error" id="error"></div>

  <div class="toolbar">
    <input id="search" type="search" placeholder="Search word, transliteration, or definition…" />
    <select id="sourceFilter"><option value="">All sources</option></select>
    <button id="addBtn">+ Add entry</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>Word</th><th>Translit</th><th>IPA</th><th>POS</th><th>Definition</th><th>Source</th><th></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <div class="pager">
    <span id="pageInfo"></span>
    <button class="ghost" id="prevBtn">← Prev</button>
    <button class="ghost" id="nextBtn">Next →</button>
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="modal" role="dialog" aria-modal="true">
    <h2 id="modalTitle">Add entry</h2>
    <div class="error" id="formError"></div>
    <div class="field">
      <label for="f_word">Word (Bengali) *</label>
      <input id="f_word" lang="bn" />
    </div>
    <div class="row2">
      <div class="field"><label for="f_translit">Transliteration</label><input id="f_translit" /></div>
      <div class="field"><label for="f_ipa">IPA</label><input id="f_ipa" /></div>
    </div>
    <div class="row2">
      <div class="field"><label for="f_pos">Part of speech</label><input id="f_pos" placeholder="noun, verb, adjective…" /></div>
      <div class="field"><label for="f_source">Source</label><input id="f_source" placeholder="manual" /></div>
    </div>
    <div class="field">
      <label for="f_def">Definition *</label>
      <textarea id="f_def"></textarea>
    </div>
    <div class="field">
      <label for="f_syn">Synonyms</label>
      <input id="f_syn" />
      <div class="hint">Comma-separated</div>
    </div>
    <div class="field">
      <label for="f_ex">Examples</label>
      <textarea id="f_ex"></textarea>
      <div class="hint">One per line</div>
    </div>
    <div class="modal-actions">
      <button class="secondary" id="cancelBtn">Cancel</button>
      <button id="saveBtn">Save</button>
    </div>
  </div>
</div>

<script>
(function () {
  var state = { q: "", source: "", limit: 25, offset: 0, total: 0, editingId: null };
  var $ = function (id) { return document.getElementById(id); };

  function token() { return $("token").value.trim(); }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    var t = token();
    if (t) { opts.headers["x-admin-token"] = t; }
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (text) {
        var body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (e) { body = {}; }
        if (!r.ok) { throw new Error(body.error || ("HTTP " + r.status)); }
        return body;
      });
    });
  }

  function showError(message) {
    var el = $("error");
    el.textContent = message;
    el.style.display = "block";
    setTimeout(function () { el.style.display = "none"; }, 6000);
  }

  function cell(text, cls) {
    var td = document.createElement("td");
    if (cls) { td.className = cls; }
    td.textContent = text || "—";
    return td;
  }

  function actionButton(label, cls, onClick) {
    var b = document.createElement("button");
    b.textContent = label;
    b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderTable(entries) {
    var tbody = $("rows");
    tbody.innerHTML = "";
    if (!entries.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 7;
      td.className = "empty";
      td.textContent = "No entries match.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    entries.forEach(function (e) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(e.word, "word"));
      tr.appendChild(cell(e.transliteration, "mono"));
      tr.appendChild(cell(e.ipa, "mono"));
      tr.appendChild(cell(e.partOfSpeech));
      tr.appendChild(cell(e.definition, "def"));
      var srcTd = document.createElement("td");
      var span = document.createElement("span");
      span.className = "badge";
      span.textContent = e.source || "—";
      srcTd.appendChild(span);
      tr.appendChild(srcTd);
      var actions = document.createElement("td");
      actions.className = "actions";
      actions.appendChild(actionButton("Edit", "ghost", function () { openModal(e); }));
      actions.appendChild(actionButton("Delete", "danger", function () { removeEntry(e); }));
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
  }

  function updatePager(shown) {
    var from = state.total === 0 ? 0 : state.offset + 1;
    var to = state.offset + shown;
    $("pageInfo").textContent = from + "–" + to + " of " + state.total;
    $("prevBtn").disabled = state.offset <= 0;
    $("nextBtn").disabled = to >= state.total;
  }

  function loadEntries() {
    var params = new URLSearchParams();
    if (state.q) { params.set("q", state.q); }
    if (state.source) { params.set("source", state.source); }
    params.set("limit", String(state.limit));
    params.set("offset", String(state.offset));
    api("/admin/entries?" + params.toString()).then(function (res) {
      state.total = res.total;
      renderTable(res.entries);
      updatePager(res.entries.length);
    }).catch(function (err) { showError(err.message); });
  }

  function loadSources() {
    api("/admin/sources").then(function (res) {
      var counts = res.counts || [];
      var total = counts.reduce(function (sum, c) { return sum + (c.count || 0); }, 0);
      $("stats").textContent = total + " entries across " + counts.length + " sources";
      var sel = $("sourceFilter");
      sel.innerHTML = "";
      var all = document.createElement("option");
      all.value = "";
      all.textContent = "All sources";
      sel.appendChild(all);
      counts.forEach(function (c) {
        if (!c.source) { return; }
        var opt = document.createElement("option");
        opt.value = c.source;
        opt.textContent = c.source + " (" + c.count + ")";
        sel.appendChild(opt);
      });
      sel.value = state.source;
    }).catch(function () { /* stats are best-effort */ });
  }

  function openModal(entry) {
    state.editingId = entry ? entry.id : null;
    $("modalTitle").textContent = entry ? "Edit entry" : "Add entry";
    $("formError").style.display = "none";
    $("f_word").value = entry ? entry.word : "";
    $("f_translit").value = entry ? entry.transliteration : "";
    $("f_ipa").value = entry ? entry.ipa : "";
    $("f_pos").value = entry ? entry.partOfSpeech : "";
    $("f_source").value = entry ? entry.source : "manual";
    $("f_def").value = entry ? entry.definition : "";
    $("f_syn").value = entry && entry.synonyms ? entry.synonyms.join(", ") : "";
    $("f_ex").value = entry && entry.examples ? entry.examples.join("\\n") : "";
    $("overlay").classList.add("open");
    $("f_word").focus();
  }

  function closeModal() {
    $("overlay").classList.remove("open");
  }

  function save() {
    var body = {
      word: $("f_word").value,
      transliteration: $("f_translit").value,
      ipa: $("f_ipa").value,
      partOfSpeech: $("f_pos").value,
      source: $("f_source").value,
      definition: $("f_def").value,
      synonyms: $("f_syn").value,
      examples: $("f_ex").value
    };
    var editing = state.editingId;
    var path = editing ? "/admin/entries/" + editing : "/admin/entries";
    api(path, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }).then(function () {
      closeModal();
      loadEntries();
      loadSources();
    }).catch(function (err) {
      var fe = $("formError");
      fe.textContent = err.message;
      fe.style.display = "block";
    });
  }

  function removeEntry(entry) {
    if (!window.confirm("Delete \\"" + entry.word + "\\" (" + entry.partOfSpeech + ")?")) { return; }
    api("/admin/entries/" + entry.id, { method: "DELETE" }).then(function () {
      loadEntries();
      loadSources();
    }).catch(function (err) { showError(err.message); });
  }

  var searchTimer = null;
  $("search").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    var value = e.target.value;
    searchTimer = setTimeout(function () {
      state.q = value.trim();
      state.offset = 0;
      loadEntries();
    }, 250);
  });
  $("sourceFilter").addEventListener("change", function (e) {
    state.source = e.target.value;
    state.offset = 0;
    loadEntries();
  });
  $("prevBtn").addEventListener("click", function () {
    state.offset = Math.max(0, state.offset - state.limit);
    loadEntries();
  });
  $("nextBtn").addEventListener("click", function () {
    state.offset = state.offset + state.limit;
    loadEntries();
  });
  $("addBtn").addEventListener("click", function () { openModal(null); });
  $("cancelBtn").addEventListener("click", closeModal);
  $("saveBtn").addEventListener("click", save);
  $("overlay").addEventListener("click", function (e) { if (e.target === $("overlay")) { closeModal(); } });
  $("token").addEventListener("change", function () {
    localStorage.setItem("bl_admin_token", token());
    loadSources();
    loadEntries();
  });

  $("token").value = localStorage.getItem("bl_admin_token") || "";
  loadSources();
  loadEntries();
})();
</script>
</body>
</html>`;
