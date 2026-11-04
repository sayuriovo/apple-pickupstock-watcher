// Default settings and helpers shared by the page script, the background worker and the extension page.
// Users change settings on the extension page (click the extension icon, then Settings).
// Values saved there override these defaults; anything left out falls back to the value here.
(function (root) {
  const DEFAULTS = Object.freeze({
    // What to watch
    parts: ["MK1E4LL/A", "MK1F4LL/A"],   // Example: iPhone Duo 256GB Star White, Night Sky
    centers: [{ location: "10001" }],    // Example: New York NY. Each center returns the 12 nearest stores.
    cppart: "UNLOCKED/US",

    // How often
    intervalMin: 10,          // Average minutes between checks. 5 or higher avoids most blocks.
    jitterPct: 30,            // Randomize each wait by up to this many percent
    reloadMin: 60,            // Average minutes between page reloads
    reloadMinFallback: 20,    // Page reload interval when the older endpoint is in use

    // Notifications
    ntfyTopic: "",
    pushoverToken: "",
    pushoverUser: "",
    pushoverSound: "persistent",
    healthcheckUrl: "",
    heartbeatHours: 12,
    autoReopen: true,
  });

  // Saved settings over the defaults. Unknown keys are dropped; missing keys use the default.
  function mergeSettings(saved) {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
      out[k] = saved && saved[k] !== undefined && saved[k] !== null ? saved[k] : DEFAULTS[k];
    }
    return out;
  }

  // Turn "10001" or "R191" into a search center. Returns null when it is neither.
  function parseCenter(text) {
    const s = String(text || "").trim();
    if (/^\d{5}$/.test(s)) return { location: s };
    if (/^R\d{3,4}$/i.test(s)) return { store: s.toUpperCase() };
    return null;
  }
  const centerText = (c) => (c && (c.location || c.store)) || "";

  root.ASW_CONFIG = Object.freeze({ DEFAULTS, mergeSettings, parseCenter, centerText });
})(typeof self !== "undefined" ? self : this);
