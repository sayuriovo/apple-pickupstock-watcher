# Changelog

## 1.7 (Nov 4, 2026)

- Settings page. Models, search area, check interval, ntfy topic, Pushover keys, Healthchecks URL and the auto-reopen switch are now entered on the extension's own page instead of in `main.js` and `background.js`. Saved settings apply at the next check, with no reload. Fields are checked before saving, and a warning shows when the interval is below 5 minutes.
- "Send test notification" button on the Settings page. It sends one message to each channel you set up and shows what each service answered. The Pushover test uses normal priority, so it does not ring.
- Status page: whether it is watching, when the last check ran, how many stores were checked, what was in stock, and whether it is waiting after a block.
- Restock history fixes:
  - The page updates by itself while it is open.
  - Export CSV always uses the current history. Before, it could export data from before a clear.
  - Clearing the history no longer records items that are still in stock as a new restock at the next check.
  - The first check after installing only notes what is already in stock. It is no longer counted as a restock.
  - A row without a sell-out time says "In stock now" only while checks are running normally. Otherwise it shows the time of the last check.
- New look for the extension page: one page with Status, History and Settings, light and dark themes, built with [terrain-ui](https://github.com/sayuriovo/terrain-ui). The Saira font is bundled (SIL Open Font License, see `fonts/`), so the page works offline.
- Your ntfy topic and Pushover keys now live in your browser, not in the project files.

**Updating from 1.6:** enter your settings once on the Settings page. Values you edited into `main.js` or `background.js` are no longer read.

## 1.6 (Oct 28, 2026)

- Every check now tries the newer endpoint first. In 1.5, one failed check could switch a tab to the older endpoint for good, and the older one gets blocked much faster.
- If Apple returns 541, 403 or 429, the extension just waits. It no longer tries the older endpoint in that case, since the whole network is usually limited and the extra request only makes it worse.
- New restock history page. Click the extension icon to see when each store got stock, how long it lasted, and a by-hour chart. Can export to CSV.
- README: added a settings reference table.

Ran for about two days at a 5-minute interval with only a few blocks.

## 1.5 (Oct 27, 2026)

- Switched to `/shop/retail/pickup-message`. A few other open-source checkers said the old `/shop/fulfillment-messages` endpoint returns 541 much more often, and that matched what I saw. Falls back to the old endpoint if the new one fails.
- Page reloads every 60 minutes instead of 20 when the new endpoint works. Fewer reloads means fewer wasted requests.
- Reopens the buy page if the tab gets closed or Chrome restarts.
- If checks stop, it reloads the page once on its own before sending a "stopped" alert.
- Only one Apple buy page tab does the checking, so opening another one to actually buy doesn't double the requests.
- Tapping an in-stock notification opens the buy page.

Ran 5+ hours at the same request rate where 1.4 lasted about 2.

## 1.4 (Oct 27, 2026)

- One search center instead of two. One center gives the 12 nearest stores, and a ZIP between two areas can cover both.
- Check times are randomized by ±30% instead of a fixed interval.
- Page reloads every 20 minutes instead of 15.
- Default interval is now 10 minutes.

Still got blocked after about 2 hours at roughly 10 requests per hour. That's what led to trying a different endpoint.

## 1.3 (Oct 27, 2026)

- Tab title shows `[Waiting until HH:MM]` while it's backing off. Before this, the title just went blank and it looked like the extension had died.
- README: opening the page in a new tab clears the waiting state.

## 1.2 (Oct 27, 2026)

- Backs off after being blocked: waits 5, 10, 20, then 30 minutes between tries, and sends nothing while waiting. Before this it retried every minute, which probably kept the block going longer.

## 1.1 (Oct 27, 2026)

- Pushover support for alarm-style alerts. With iOS Critical Alerts on, it rings through silent mode and Sleep Focus, every 30 seconds until you open it.
- Added `alarm30.mp3`, a 30-second marimba alarm, so the gaps between Pushover repeats aren't silent.
- Status messages over ntfy: started, still running (every 12 hours), stopped, resumed, blocked.
- Optional Healthchecks.io ping, so you still get a warning if the computer sleeps or goes offline.
- All extension text in English. Personal keys removed so the code could go on GitHub.

## 1.0 (Oct 27, 2026)

- First Chrome extension. Runs on the Apple buy page in normal Chrome, so it uses the same cookies and session as the page itself. No more copying cookies by hand.
- Checks two search centers every 5 minutes, reloads the page every 15, and sends ntfy notifications.
- Shows the result in the tab title, like `[No stock 01:04:36]`.

## Before 1.0 (Oct 26, 2026)

Tried a few things that didn't hold up:

- Plain Python requests to the endpoint. Got 541 right away.
- Same script with cookies copied from Chrome, every 90 seconds. Worked for about an hour, then blocked.
- Every 5 minutes with a fresh cookie. Stopped after about 25 minutes, around when the cookie expired.
- Playwright driving a browser. Blocked right away, even though normal Chrome on the same computer still worked.

The useful takeaway: requests need to come from a normal browser session, and they need to be a lot less frequent than I first assumed.
