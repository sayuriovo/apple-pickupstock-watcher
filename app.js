// Extension page: Status, History and Settings.
// The functions in the first part are pure and are tested in test/app.test.js without Chrome.

const { DEFAULTS, mergeSettings, parseCenter, centerText } =
  (typeof self !== "undefined" && self.ASW_CONFIG) || require("./config.js").ASW_CONFIG || globalThis.ASW_CONFIG;

const MIN = 60 * 1000;

// ---------- formatting ----------
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const fmtTime = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtStamp = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
const fmtDur = (ms) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
};
const fmtAgo = (ms) => (ms < MIN ? "just now" : `${fmtDur(ms)} ago`);

// ---------- watching state ----------
// A check counts as recent when it happened within three intervals plus five minutes,
// the same limit the background watchdog uses before it steps in.
function staleLimit(intervalMin) {
  return ((Number(intervalMin) || DEFAULTS.intervalMin) * 3 + 5) * MIN;
}

function watchState(st, t) {
  const limit = staleLimit(st.interval);
  if (!st.lastOk) return { key: "idle", tone: "warn" };
  if ((st.blockedUntil || 0) > t) return { key: "waiting", tone: "warn", until: st.blockedUntil };
  if (st.stalled) return { key: "stalled", tone: "warn" };
  if (!st.active) return { key: "stopped", tone: "warn" };
  if (t - st.lastOk > limit) return { key: "late", tone: "warn" };
  return { key: "ok", tone: "ok" };
}
const isFresh = (st, t) => watchState(st, t).key === "ok";

// ---------- history ----------
// Pair each "in" event with the next "out" event for the same store and part. Newest first.
function buildRows(history) {
  const open = new Map();
  const rows = [];
  for (const e of history || []) {
    const k = e.store + "|" + e.part;
    if (e.type === "in") {
      if (open.has(k)) continue;  // already open; ignore a duplicate "in"
      const row = { store: e.store, part: e.part, from: e.t, to: null };
      open.set(k, row);
      rows.push(row);
    } else if (e.type === "out" && open.has(k)) {
      open.get(k).to = e.t;
      open.delete(k);
    }
  }
  return rows.reverse();
}

function hourCounts(rows) {
  const counts = Array(24).fill(0);
  for (const r of rows) counts[new Date(r.from).getHours()]++;
  return counts;
}

// Text for a row that has no "sold out" time yet. Only say "in stock now" when watching is current.
function openLabel(st, t) {
  return isFresh(st, t) ? "In stock now" : `Unknown, last check ${fmtStamp(st.lastOk || t)}`;
}

function toCsv(rows) {
  const iso = (t) => (t ? new Date(t).toISOString() : "");
  const lines = ["store,part,detected_in_stock,detected_sold_out,minutes"];
  for (const r of [...rows].reverse()) {
    const mins = r.to ? Math.round((r.to - r.from) / MIN) : "";
    lines.push([r.store, r.part, iso(r.from), iso(r.to), mins].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

// ---------- settings form ----------
const PART_RE = /^[A-Z0-9]{4,6}[A-Z]{1,2}\/[A-Z]$/;
const lines = (s) => String(s || "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
const num = (v) => (String(v).trim() === "" ? NaN : Number(v));

// Returns { settings, errors, warnings }. errors block saving; warnings do not.
function readForm(v) {
  const errors = {}, warnings = {};
  const parts = lines(v.parts).map((p) => p.toUpperCase());
  if (!parts.length) errors.parts = "Add at least one part number.";
  else {
    const bad = parts.filter((p) => !PART_RE.test(p));
    if (bad.length) errors.parts = `${bad.join(", ")} ${bad.length > 1 ? "do" : "does"} not look like an Apple part number such as MK1E4LL/A.`;
  }

  const centerLines = lines(v.centers);
  const centers = centerLines.map(parseCenter);
  if (!centerLines.length) errors.centers = "Add a ZIP code or a store ID.";
  else {
    const bad = centerLines.filter((_, i) => !centers[i]);
    if (bad.length) errors.centers = `${bad.join(", ")}: use a 5-digit ZIP code or a store ID such as R191.`;
    else if (centers.length > 2) warnings.centers = `${centers.length} areas means ${centers.length} requests per check, which raises the chance of being blocked.`;
  }

  const range = (key, value, lo, hi, label) => {
    if (!Number.isFinite(value) || value < lo || value > hi || Math.round(value) !== value) {
      errors[key] = `${label} must be a whole number from ${lo} to ${hi}.`;
    }
    return value;
  };
  const intervalMin = range("interval", num(v.interval), 1, 120, "The interval");
  if (!errors.interval && intervalMin < 5) warnings.interval = "Below 5 minutes, Apple tends to block requests much sooner.";
  const jitterPct = range("jitter", num(v.jitter), 0, 50, "This");
  const reloadMin = range("reload", num(v.reload), 10, 240, "This");
  const reloadMinFallback = range("reload2", num(v.reload2), 5, 120, "This");
  const heartbeatHours = range("heartbeat", num(v.heartbeat), 1, 168, "This");

  const cppart = String(v.cppart || "").trim() || DEFAULTS.cppart;
  if (!/^[A-Z0-9/_-]+$/i.test(cppart)) errors.cppart = "Use letters, numbers and slashes only, such as UNLOCKED/US.";

  const ntfyTopic = String(v.ntfy || "").trim();
  if (ntfyTopic && !/^[A-Za-z0-9_-]{1,64}$/.test(ntfyTopic)) errors.ntfy = "Use letters, numbers, dashes or underscores, up to 64 characters.";

  const pushoverToken = String(v.ptoken || "").trim();
  const pushoverUser = String(v.puser || "").trim();
  if (pushoverToken && !pushoverUser) errors.puser = "Add the user key too, or clear the token.";
  if (pushoverUser && !pushoverToken) errors.ptoken = "Add the API token too, or clear the user key.";
  if (pushoverToken && !/^[A-Za-z0-9]{30}$/.test(pushoverToken)) errors.ptoken = "A Pushover API token is 30 letters and numbers.";
  if (pushoverUser && !/^[A-Za-z0-9]{30}$/.test(pushoverUser)) errors.puser = "A Pushover user key is 30 letters and numbers.";

  const healthcheckUrl = String(v.hc || "").trim();
  if (healthcheckUrl && !/^https:\/\/hc-ping\.com\/\S+$/.test(healthcheckUrl)) errors.hc = "Use the ping URL from Healthchecks.io. It starts with https://hc-ping.com/.";

  const settings = {
    parts, centers: centers.filter(Boolean), cppart, intervalMin, jitterPct, reloadMin, reloadMinFallback,
    ntfyTopic, pushoverToken, pushoverUser,
    pushoverSound: String(v.psound || "").trim() || DEFAULTS.pushoverSound,
    healthcheckUrl, heartbeatHours, autoReopen: !!v.reopen,
  };
  return { settings, errors, warnings };
}

function formValues(s) {
  return {
    parts: s.parts.join("\n"), centers: s.centers.map(centerText).join("\n"), cppart: s.cppart,
    interval: s.intervalMin, jitter: s.jitterPct, reload: s.reloadMin, reload2: s.reloadMinFallback,
    ntfy: s.ntfyTopic, ptoken: s.pushoverToken, puser: s.pushoverUser, psound: s.pushoverSound,
    hc: s.healthcheckUrl, heartbeat: s.heartbeatHours, reopen: s.autoReopen,
  };
}

if (typeof module !== "undefined") {
  module.exports = { buildRows, hourCounts, openLabel, toCsv, watchState, staleLimit, readForm, formValues, fmtDur };
}

// =====================================================================
// Page code (runs only inside the extension)
// =====================================================================
if (typeof chrome !== "undefined" && chrome.storage && typeof document !== "undefined") {
  const store = chrome.storage.local;
  const KEYS = ["history", "avail", "lastOk", "interval", "stores", "active", "stalled", "blockedUntil", "url", "settings"];
  const $ = (id) => document.getElementById(id);
  let st = {};

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ----- small UI pieces -----
  let toastTimer = 0;
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function confirmBox({ crumb, title, text, ok }) {
    const d = $("confirm");
    $("confirm-crumb").textContent = crumb; $("confirm-title").textContent = title;
    $("confirm-text").textContent = text; $("confirm-ok").textContent = ok;
    return new Promise((resolve) => {
      d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
      d.returnValue = ""; d.showModal();
    });
  }
  function fields(ul, pairs) {
    ul.replaceChildren(...pairs.map(([k, v], i) => {
      const li = el("li");
      li.append(k, el("span", "tu-sep", "│"));
      li.append(el("b", "tu-num", v));
      return li;
    }));
  }

  // ----- Status -----
  function renderStatus() {
    const t = Date.now();
    const cfg = mergeSettings(st.settings);
    const ws = watchState(st, t);
    const state = $("state");
    state.dataset.tone = ws.tone;
    state.textContent = {
      idle: "Not watching yet. Open the Apple iPhone buy page for the models in Settings; the first check runs about 20 seconds after the page loads.",
      waiting: `Apple is limiting requests. Waiting until ${fmtTime(ws.until)} before the next try.`,
      stalled: `Checks stopped at ${fmtStamp(st.lastOk)} and reloading the page did not fix it. Check the computer and the Apple buy page.`,
      stopped: "Stopped. The Apple buy page tab was closed, so nothing is being checked.",
      late: `No successful check since ${fmtStamp(st.lastOk)}. The computer may be asleep or the buy page closed.`,
      ok: `Watching. Checks run about every ${st.interval || cfg.intervalMin} minutes.`,
    }[ws.key];

    const figs = $("figs");
    const fig = (value, unit, label, note) => {
      const d = el("div", "fig"); const b = el("b", null, value);
      if (unit) b.append(el("small", null, unit));
      d.append(b, el("span", "tu-label", label));
      if (note) d.append(el("em", null, note));
      return d;
    };
    const avail = Array.isArray(st.avail) ? st.avail : [];
    figs.replaceChildren(
      fig(st.lastOk ? fmtTime(st.lastOk) : "--", "", "Last check", st.lastOk ? fmtAgo(t - st.lastOk) : "No check yet"),
      fig(st.stores != null ? String(st.stores) : "--", "", "Stores checked", null),
      fig(String(st.interval || cfg.intervalMin), "min", "Interval", "Randomized ±" + cfg.jitterPct + "%"),
      fig(st.lastOk ? String(avail.length) : "--", "", "In stock", st.lastOk ? fmtDate(st.lastOk) + " " + fmtTime(st.lastOk) : null),
    );

    const box = $("instock");
    if (!st.lastOk) {
      box.replaceChildren(Object.assign(el("div", "tu-empty"), { textContent: "Stores with stock will be listed here after the first check." }));
    } else if (!avail.length) {
      box.replaceChildren(Object.assign(el("div", "tu-empty"), { textContent: `None of the watched models were available for pickup at the last check (${fmtStamp(st.lastOk)}).` }));
    } else {
      const wrap = el("div", "tu-table-wrap"); const table = el("table", "tu-table");
      const head = el("thead"); const hr = el("tr");
      ["No.", "Store", "Part"].forEach((h) => hr.append(el("th", null, h)));
      head.append(hr);
      const body = el("tbody");
      avail.forEach((k, i) => {
        const [s, p] = String(k).split("|"); const tr = el("tr");
        tr.append(el("td", "tu-num", pad(i + 1)), el("td", null, s), el("td", "tu-num", p));
        body.append(tr);
      });
      table.append(head, body); wrap.append(table); box.replaceChildren(wrap);
    }

    fields($("watching"), [
      ["Models", cfg.parts.join(", ") || "None set"],
      ["Area", cfg.centers.map(centerText).join(", ") || "None set"],
      ["Alerts", [cfg.ntfyTopic && "ntfy", cfg.pushoverToken && cfg.pushoverUser && "Pushover"].filter(Boolean).join(" + ") || "None set"],
    ]);
    const open = $("open-buy");
    if (st.url) { open.href = st.url; open.hidden = false; } else open.hidden = true;
  }

  // ----- History -----
  function renderHistory() {
    const t = Date.now();
    const history = Array.isArray(st.history) ? st.history : [];
    const rows = buildRows(history);
    const cfg = mergeSettings(st.settings);

    const storesN = new Set(rows.map((r) => r.store)).size;
    fields($("summary"), rows.length
      ? [["Restocks", String(rows.length)], ["Stores", String(storesN)], ["Since", fmtDate(history[0].t)]]
      : [["Restocks", "0"]]);
    $("export").disabled = !rows.length;
    $("clear").disabled = !history.length;

    const counts = hourCounts(rows);
    const max = Math.max(1, ...counts);
    const nowH = new Date(t).getHours();
    const bars = el("div", "bars"); const ticks = el("div", "ticks");
    counts.forEach((c, h) => {
      const i = el("i", c ? (h === nowH ? "now" : "") : (h === nowH ? "now" : "zero"));
      i.style.height = c ? `${(c / max) * 100}%` : "2px";
      i.title = `${pad(h)}:00 to ${pad(h)}:59: ${c} restock${c === 1 ? "" : "s"}`;
      bars.append(i);
      ticks.append(el("span", null, h % 3 === 0 ? pad(h) : ""));
    });
    const chart = $("chart");
    chart.setAttribute("aria-label", `Restocks by hour. Busiest hour: ${rows.length ? pad(counts.indexOf(Math.max(...counts))) + ":00" : "none yet"}.`);
    chart.replaceChildren(bars, ticks);

    const box = $("table");
    if (!rows.length) {
      box.replaceChildren(Object.assign(el("div", "tu-empty"), {
        textContent: "No restocks recorded yet. Each time a watched model comes into stock at a store, a row appears here with when it came in and when it sold out.",
      }));
    } else {
      const wrap = el("div", "tu-table-wrap"); const table = el("table", "tu-table");
      const head = el("thead"); const hr = el("tr");
      ["No.", "Store", "Part", "Detected in stock", "Detected sold out", "Lasted"].forEach((h, i) => {
        const th = el("th", i === 5 ? "tu-right" : null, h); hr.append(th);
      });
      head.append(hr);
      const body = el("tbody");
      rows.forEach((r, i) => {
        const tr = el("tr");
        const lasted = r.to ? fmtDur(r.to - r.from) : "";
        tr.append(
          el("td", "tu-num", pad(rows.length - i)),
          el("td", null, r.store),
          el("td", "tu-num", r.part),
          el("td", "tu-num", fmtStamp(r.from)),
          el("td", r.to ? "tu-num" : "open", r.to ? fmtStamp(r.to) : openLabel(st, t)),
          el("td", "tu-num tu-right", lasted),
        );
        body.append(tr);
      });
      table.append(head, body); wrap.append(table); box.replaceChildren(wrap);
    }
    $("table-note").textContent = `Times are when a check saw the change. Checks run about every ${st.interval || cfg.intervalMin} minutes, so a time can be off by up to that much. History stays in this browser only.`;
  }

  // ----- Settings -----
  const F = {
    parts: "f-parts", centers: "f-centers", cppart: "f-cppart", interval: "f-interval", jitter: "f-jitter",
    reload: "f-reload", reload2: "f-reload2", ntfy: "f-ntfy", ptoken: "f-ptoken", puser: "f-puser",
    psound: "f-psound", hc: "f-hc", heartbeat: "f-heartbeat", reopen: "f-reopen",
  };
  function fillForm(s) {
    const v = formValues(s);
    for (const [k, id] of Object.entries(F)) {
      const n = $(id); if (n.type === "checkbox") n.checked = !!v[k]; else n.value = v[k] ?? "";
    }
    showErrors({}, {});
  }
  function collect() {
    const v = {};
    for (const [k, id] of Object.entries(F)) { const n = $(id); v[k] = n.type === "checkbox" ? n.checked : n.value; }
    return v;
  }
  function showErrors(errors, warnings) {
    for (const k of Object.keys(F)) {
      const msg = $("e-" + k); const input = $(F[k]);
      if (!msg) continue;
      const text = errors[k] || warnings[k] || "";
      msg.textContent = text; msg.hidden = !text;
      msg.classList.toggle("soft", !errors[k] && !!warnings[k]);
      if (errors[k]) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    }
    if (Object.keys(errors).some((k) => ["jitter", "reload", "reload2", "cppart"].includes(k))) {
      document.querySelector(".adv").open = true;
    }
  }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { settings, errors, warnings } = readForm(collect());
    showErrors(errors, warnings);
    const first = Object.keys(errors)[0];
    if (first) { $(F[first]).focus(); toast("Fix the highlighted fields, then save again"); return; }
    await store.set({ settings });
    toast("Settings saved. They apply at the next check.");
  });
  $("reset").addEventListener("click", async () => {
    const ok = await confirmBox({
      crumb: "// Settings", title: "Restore the default settings?",
      text: "Models, area, interval and notification keys go back to the defaults. Restock history is kept.",
      ok: "Restore defaults",
    });
    if (!ok) return;
    await store.remove("settings");
    fillForm(mergeSettings(null));
    toast("Default settings restored");
  });
  $("test").addEventListener("click", async () => {
    const out = $("test-result");
    const { settings, errors } = readForm(collect());
    if (!settings.ntfyTopic && !(settings.pushoverToken && settings.pushoverUser)) {
      out.textContent = "Set up ntfy or Pushover first, then save."; return;
    }
    if (errors.ntfy || errors.ptoken || errors.puser) { showErrors(errors, {}); out.textContent = "Fix the notification fields first."; return; }
    const saved = mergeSettings(st.settings);
    if (saved.ntfyTopic !== settings.ntfyTopic || saved.pushoverToken !== settings.pushoverToken || saved.pushoverUser !== settings.pushoverUser) {
      out.textContent = "Save your settings first, so the test uses them."; return;
    }
    out.textContent = "Sending…";
    const res = await chrome.runtime.sendMessage({ kind: "test" });
    out.textContent = res ? `ntfy: ${res.ntfy} │ Pushover: ${res.pushover}. Check your phone.` : "The extension did not answer. Reload it in chrome://extensions and try again.";
  });

  // ----- History actions -----
  $("export").addEventListener("click", () => {
    const rows = buildRows(st.history || []);  // always the latest data
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    a.download = `apple-restock-history-${fmtDate(Date.now()).replace(/\./g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("clear").addEventListener("click", async () => {
    const ok = await confirmBox({
      crumb: "// History", title: "Clear all restock history?",
      text: "This removes every recorded restock. It cannot be undone. Export a CSV first if you want a copy.",
      ok: "Clear history",
    });
    if (!ok) return;
    // Keep "avail" so items still in stock are not recorded as a new restock at the next check.
    await store.set({ history: [] });
    toast("History cleared");
  });

  // ----- Routing -----
  const VIEWS = ["status", "history", "settings"];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "status";
    for (const name of VIEWS) $("view-" + name).hidden = name !== v;
    document.querySelectorAll("[data-view]").forEach((a) => {
      if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = `${v[0].toUpperCase() + v.slice(1)} · Apple Pickup Watcher`;
  }
  window.addEventListener("hashchange", route);

  // ----- Data -----
  function renderAll() { renderStatus(); renderHistory(); }
  store.get(KEYS, (data) => {
    st = data || {};
    fillForm(mergeSettings(st.settings));
    renderAll();
  });
  // Live updates while the page is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) st[k] = c.newValue;
    renderAll();
  });
  setInterval(renderStatus, 30 * 1000);  // keeps "x min ago" current

  try { $("version").textContent = "v" + chrome.runtime.getManifest().version; } catch {}
  route();
}
