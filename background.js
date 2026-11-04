// Settings are edited on the extension page (click the extension icon, then Settings) and saved
// in chrome.storage.local under "settings". Defaults are in config.js.
importScripts("config.js");
const { mergeSettings } = self.ASW_CONFIG;

const BUY_PREFIX = "https://www.apple.com/shop/buy-iphone/";
const now = () => Date.now();
const fmt = (t) => new Date(t).toLocaleString("en-US", { hour12: false });
const store = chrome.storage.local;
const getSettings = async () => mergeSettings((await store.get(["settings"])).settings);

async function notify(title, msg, url) {
  const cfg = await getSettings();
  if (cfg.ntfyTopic) {
    const headers = { Title: title };
    if (url) headers.Click = url;
    fetch("https://ntfy.sh/" + encodeURIComponent(cfg.ntfyTopic), { method: "POST", body: msg, headers })
      .catch((err) => console.log("ntfy failed", err));
  }

  // Only "in stock" triggers Pushover: emergency priority, repeats every 30 s until acknowledged (up to 1 hour)
  if (title === "iPhone in stock" && cfg.pushoverToken && cfg.pushoverUser) {
    const body = new URLSearchParams({
      token: cfg.pushoverToken,
      user: cfg.pushoverUser,
      title: "iPhone in stock!",
      message: msg,
      priority: "2",
      retry: "30",
      expire: "3600",
      sound: cfg.pushoverSound,
    });
    if (url) { body.set("url", url); body.set("url_title", "Open the Apple buy page"); }
    fetch("https://api.pushover.net/1/messages.json", { method: "POST", body })
      .then((r) => r.text())
      .then((t) => console.log("pushover", t))
      .catch((err) => console.log("pushover failed", err));
  }
}

// "Send test notification" on the Settings page. Sends one plain message to each channel that is set up
// and reports back what each service answered. The Pushover test uses normal priority, so it does not ring.
async function sendTest() {
  const cfg = await getSettings();
  const result = { ntfy: "off", pushover: "off" };
  const text = "Test from Apple Pickup Watcher. If you can read this, notifications work.";
  const jobs = [];
  if (cfg.ntfyTopic) {
    jobs.push(fetch("https://ntfy.sh/" + encodeURIComponent(cfg.ntfyTopic), {
      method: "POST", body: text, headers: { Title: "Apple watcher test" },
    }).then((r) => { result.ntfy = r.ok ? "sent" : "failed (" + r.status + ")"; })
      .catch(() => { result.ntfy = "failed (network)"; }));
  }
  if (cfg.pushoverToken && cfg.pushoverUser) {
    const body = new URLSearchParams({
      token: cfg.pushoverToken, user: cfg.pushoverUser, title: "Apple watcher test", message: text, priority: "0",
    });
    jobs.push(fetch("https://api.pushover.net/1/messages.json", { method: "POST", body })
      .then((r) => { result.pushover = r.ok ? "sent" : "failed (" + r.status + ")"; })
      .catch(() => { result.pushover = "failed (network)"; }));
  }
  await Promise.all(jobs);
  return result;
}

const isBuyPage = (tab) => !!(tab && tab.url && tab.url.startsWith(BUY_PREFIX));

async function getTab(id) {
  if (id == null) return null;
  try { return await chrome.tabs.get(id); } catch { return null; }
}

// Open the buy page in the background, unless an Apple buy page tab is already open
async function openBuyPage(url) {
  if (!url) return;
  const open = await chrome.tabs.query({ url: BUY_PREFIX + "*" });
  if (open.length) return;
  const wins = await chrome.windows.getAll();
  if (wins.length) await chrome.tabs.create({ url, active: false });
  else await chrome.windows.create({ url, state: "minimized" });
  console.log("Reopened the buy page", fmt(now()));
}

// Decide which buy page tab does the checking (only one at a time)
async function claim(tab) {
  if (!tab) return { watcher: true };
  const st = await store.get(["watcherTabId"]);
  if (st.watcherTabId === tab.id) return { watcher: true };
  const current = await getTab(st.watcherTabId);
  if (isBuyPage(current)) return { watcher: false };
  await store.set({ watcherTabId: tab.id });
  return { watcher: true };
}

// Restock history: record when each store/model comes into stock and when it sells out
const HISTORY_MAX = 3000;
async function recordHistory(available, t) {
  if (!Array.isArray(available)) return;
  const st = await store.get(["avail", "history"]);
  const after = new Set(available.map((a) => a.store + "|" + a.part));
  // The very first check only records what is already in stock. Stock that was there before watching began
  // is not a restock, so it gets no "in" event.
  if (!Array.isArray(st.avail)) {
    await store.set({ avail: [...after], history: st.history || [] });
    return;
  }
  const before = new Set(st.avail);
  const events = [];
  for (const k of after) if (!before.has(k)) events.push({ t, key: k, type: "in" });
  for (const k of before) if (!after.has(k)) events.push({ t, key: k, type: "out" });
  const history = (st.history || []).concat(events.map((e) => {
    const [storeName, part] = e.key.split("|");
    return { t: e.t, store: storeName, part, type: e.type };
  }));
  await store.set({ avail: [...after], history: history.slice(-HISTORY_MAX) });
}

// Click the extension icon to see the restock history
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// A successful check from the page: update status, send heartbeat, ping Healthchecks
async function onCheckOk(m, tab) {
  const t = now();
  const cfg = await getSettings();
  await recordHistory(m.available, t);
  const st = await store.get(["lastHeartbeat", "stalled"]);
  await store.set({
    lastOk: t, interval: m.interval, stores: m.stores, url: m.url || (tab && tab.url),
    watcherTabId: tab ? tab.id : null, active: true, stalled: false, repairTried: false, blockedUntil: 0,
  });

  if (st.stalled) notify("Apple watcher resumed", "Checks are working again.");

  if (!st.lastHeartbeat) {
    await store.set({ lastHeartbeat: t });
  } else if (t - st.lastHeartbeat >= cfg.heartbeatHours * 3600 * 1000) {
    notify("Apple watcher still running", `Still working. Last check ${fmt(t)}, ${m.stores} stores.`);
    await store.set({ lastHeartbeat: t });
  }

  if (cfg.healthcheckUrl) fetch(cfg.healthcheckUrl).catch(() => {});
}

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  const tab = sender.tab;
  if (m.kind === "claim") { claim(tab).then(sendResponse); return true; }
  if (m.kind === "config") { getSettings().then(sendResponse); return true; }
  if (m.kind === "test") { sendTest().then(sendResponse); return true; }
  if (m.kind === "ok") onCheckOk(m, tab);
  else if (m.kind === "blocked") store.set({ blockedUntil: m.until });
  else if (m.title) notify(m.title, m.msg, m.url);
});

// The watching tab was closed
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  const st = await store.get(["watcherTabId", "active", "url"]);
  if (!st.active || st.watcherTabId !== tabId) return;
  const { autoReopen } = await getSettings();
  await store.set({ watcherTabId: null });
  if (info.isWindowClosing) {
    // If Chrome is quitting, onStartup reopens the page next time. If only a window closed, reopen now.
    setTimeout(async () => { if ((await chrome.windows.getAll()).length && autoReopen) openBuyPage(st.url); }, 5000);
    return;
  }
  if (autoReopen) {
    await store.set({ lastOk: now() });  // give the reopened page time to start
    openBuyPage(st.url);
  } else {
    notify("Apple watcher stopped", "The Apple buy page tab was closed. Checking has stopped.");
    await store.set({ active: false, stalled: false });
  }
});

// Chrome started: reopen the buy page if we were watching before
chrome.runtime.onStartup.addListener(async () => {
  const st = await store.get(["active", "url"]);
  if (st.active && (await getSettings()).autoReopen) {
    await store.set({ lastOk: now(), repairTried: false, watcherTabId: null });
    openBuyPage(st.url);
  }
});

// Watchdog: no successful check for a while. Try to fix it once by reloading or reopening the page, then alert.
chrome.alarms.get("watchdog", (a) => {
  if (!a) chrome.alarms.create("watchdog", { periodInMinutes: 5 });
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "watchdog") return;
  const st = await store.get(["lastOk", "interval", "active", "stalled", "repairTried", "blockedUntil", "watcherTabId", "url"]);
  if (!st.active || st.stalled || !st.lastOk) return;
  if (now() < (st.blockedUntil || 0) + 10 * 60 * 1000) return;  // waiting after a block; that has its own alert
  const limitMin = (st.interval || 10) * 3 + 5;
  const mins = Math.round((now() - st.lastOk) / 60000);
  if (mins <= limitMin) return;

  if (!st.repairTried) {
    await store.set({ repairTried: true });
    const tab = await getTab(st.watcherTabId);
    if (isBuyPage(tab)) {
      chrome.tabs.reload(tab.id);
      console.log("Watchdog reloaded the buy page", fmt(now()));
    } else {
      await store.set({ watcherTabId: null });
      openBuyPage(st.url);
    }
    return;
  }
  notify("Apple watcher stopped",
    `No successful check for ${mins} minutes, and reloading the page didn't fix it. Check the computer and the Apple buy page.`);
  await store.set({ stalled: true });
});
