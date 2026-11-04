# Apple Pickup Watcher

[中文说明](README.zh-CN.md)

A Chrome extension that watches in-store pickup availability at Apple Stores. When the iPhone you want comes into stock, your phone gets a push notification right away. With Pushover, it can even wake you up like an alarm.

## How it works

The extension runs in your own Chrome, on an Apple iPhone buy page. Every few minutes it checks pickup availability at nearby stores. The checks use your browser's real session, and Apple's own page scripts keep the cookies fresh, so you never have to copy cookies or keep refreshing by hand.

When stock is found:

- **ntfy**: your phone gets a normal push notification with the store and the model.
- **Pushover** (optional): your phone plays an emergency alert that ignores silent mode and Do Not Disturb. It repeats every 30 seconds until you acknowledge it.

## Before you start

- This is an unofficial tool. It relies on undocumented endpoints on Apple's website and may break if Apple changes them. Every check uses `/shop/retail/pickup-message` first. It only tries the older `/shop/fulfillment-messages` when the newer one returns something unexpected. If Apple is limiting you (status 541), it waits instead of spending another request on the older endpoint.
- Checking too often gets you temporarily blocked by Apple (status code 541; even normal browsing stops showing pickup info). The default is about once every 10 minutes, at random intervals. In the author's testing, about every 5 minutes with one search center ran for about two days with only occasional blocks. Going below 5 minutes is not recommended.
- Chrome must stay open and the computer must not sleep. If the buy page tab is closed or Chrome restarts, the extension reopens it by itself.
- Currently supports iPhone buy pages on the US Apple Store website only, and has only been tested with US stores. Apple Store websites in other countries or regions have not been tested and may not work.

---

## Step 1: Install the extension

1. Download this project and unzip it. On GitHub, click **Code → Download ZIP**. The unzipped folder may be named `apple-pickupstock-watcher-main`; that is fine.
2. Go to `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top right.
4. Click **Load unpacked** and select the unzipped folder (the level where you can see `manifest.json`).

All settings are entered on the extension's own page, so you don't need to edit any files. To open it, click the extension icon in the Chrome toolbar (if it is hidden, click the puzzle icon and pin Apple Pickup Watcher). The page has three sections on the left: **Status**, **History** and **Settings**.

When you update the extension to a new version, go to `chrome://extensions`, click the reload button ↻ on the extension card, then refresh the Apple buy page.

**Updating from 1.6 or earlier:** version 1.7 no longer reads settings from `main.js` and `background.js`. Enter your models, area, ntfy topic and Pushover keys once on the Settings page.

## Step 2: Choose the models to watch

On the Settings page, enter them under **Part numbers**, one per line. These are Apple's internal part numbers. Each color, capacity and version has its own.

**How to find a part number:**

1. In Chrome, open the iPhone buy page on Apple's website and pick the model, color and capacity.
2. Press **F12** (on Mac: Command + Option + I) and open the **Network** tab.
3. Type `fulfillment` in the filter box, then press **F5** to reload the page. If nothing shows up, try `pickup-message` instead.
4. Click the `fulfillment-messages` (or `pickup-message`) request. In its URL, find the value after `parts.0=`, for example `MK1E4LL/A`. If it shows as `MK1E4LL%2FA`, the `%2F` is just `/`.
5. To watch several colors or capacities, switch the configuration and repeat.

Enter them one per line, then click **Save settings**:

```
MK1E4LL/A
MK1F4LL/A
```

## Step 3: Choose the store area

On the Settings page, enter a 5-digit ZIP code or a store ID (such as `R191`) under **Search area**:

```
10001
```

- For each center, Apple returns the **12 nearest** stores.
- Each center costs one request per check, so **one center is recommended**.
- To cover two areas, try a ZIP code halfway between them first. The "Watcher started" notification tells you how many stores are covered, and the buy page console (F12) lists them in a line starting with `[Apple Watcher] ... Stores:`.
- You can add more lines, e.g. `10001` and `19103`. Results are merged and duplicates removed, but every extra center adds requests and raises the chance of being blocked.

## Step 4: Set up phone notifications

You need a push notification app on your phone to receive alerts. Two kinds are useful:

- **A simple push app**: sends a normal notification when stock is found.
- **An alarm-level alert app**: rings even in silent mode or Do Not Disturb, so it can wake you up.

Any app of these kinds will do in principle. The extension currently has built-in support for **ntfy** and **Pushover**, so this guide uses them as examples. To use a different app, edit the `notify()` function in `background.js`.

### Option A: Simple push notifications (example: ntfy)

1. Install **ntfy** on your phone (App Store on iOS, Google Play on Android).
2. Open the app, tap **+**, and subscribe to a topic. Make up a long, hard-to-guess name, such as `iphone-alert-k7x29q`.
   ntfy topics are public. Anyone who knows the name can read the messages, so avoid simple names.
3. On the Settings page, enter the topic under **ntfy topic** and click **Save settings**.
4. **Test it**: click **Send test notification** on the Settings page. Or run this in a terminal (or Command Prompt). If your phone shows "test", it works:
   ```
   curl -d "test" ntfy.sh/iphone-alert-k7x29q
   ```

### Option B: Alarm-level alerts (example: Pushover)

Use this if you don't want to miss stock while you sleep. Normal notifications stay quiet in silent mode or Sleep Focus. Pushover's emergency notifications can use iOS Critical Alerts, which ignore silent mode and Do Not Disturb.

Pushover has a free trial. After that it is a one-time in-app purchase; check your app store for the price.

1. **Install and sign up**: install **Pushover** on your phone, create an account and log in.
2. **Turn on Critical Alerts (iOS)**: Pushover app → Settings → turn on **Critical Alerts for high-priority**, and tap **Allow** on the system prompt.
   Then go to iPhone Settings → Notifications → Pushover and make sure **Allow Notifications**, **Sounds** and **Critical Alerts** are all on.
3. **Get your User Key**: log in at pushover.net on your computer. The string under **Your User Key** on the right is it.
4. **Get an API Token**: scroll to the bottom of pushover.net → **Create an Application/API Token** → enter any name (e.g. `apple-watcher`) → check the terms box → **Create Application**. The **API Token** at the top of the new page is it.
5. **Enter them on the Settings page** under **Pushover API token** and **Pushover user key**, then click **Save settings**. They are stored in this Chrome profile only.
6. **Test from the website first**: on the pushover.net home page, use Push a Notification on the left, set Priority to **Emergency**, and send. Put your phone on silent; it should still ring, and stop once you open and acknowledge it.

**Optional: use a longer alarm sound**

Pushover emergency alerts repeat at most every 30 seconds, and the built-in sounds are short, so there is a long silence in between. This project includes an original 30-second marimba alarm, `alarm30.mp3`. Upload it to get close to continuous ringing:

1. On pushover.net, find **Your Custom Sounds**, upload `alarm30.mp3`, and name it `alarm30`.
2. Fully close the Pushover app on your phone and open it again so it syncs the new sound.
3. On the Settings page, set **Pushover sound** to `alarm30` and save.

You can use ntfy and Pushover together. Every message goes to ntfy; only the "in stock" message also triggers the Pushover alarm.

### Status notifications (on by default, needs ntfy only)

With ntfy set up, besides stock alerts you also get:

| Notification | When |
|---|---|
| Apple watcher started | The buy page is opened and the first check succeeds |
| Apple watcher still running | Every 12 hours, to confirm it is still working (change it on the Settings page) |
| Apple watcher stopped | No successful check for a while (about 35 minutes by default), and an automatic page reload didn't fix it |
| Apple watcher resumed | Checks work again after a stop |
| Apple watcher blocked | Blocked by Apple 3 times in a row (it keeps retrying less often) |

**ntfy limits:** ntfy.sh applies rate limits to free users; see its website for the exact numbers. This extension normally sends only a few messages a day and won't come close.

### Optional: get alerted when the browser closes, the computer sleeps, or the internet drops (Healthchecks.io)

When the whole browser is closed, the computer sleeps, or the network is down, the extension stops too and cannot send anything. An outside service covers this: after every successful check, the extension pings Healthchecks.io. If the pings stop for too long, Healthchecks.io notifies you through ntfy. Healthchecks.io is one of ntfy's official integrations and is free for personal use.

1. Go to healthchecks.io, sign up and log in.
2. Click **Add Check** and give it any name, such as `apple-watcher`.
3. Change the schedule (Period / Grace):
   - **Period**: `10 minutes` (same as **Check every** on the Settings page)
   - **Grace**: `20 minutes`
4. Copy the check's **Ping URL**, which looks like `https://hc-ping.com/xxxxxxxx-xxxx-...`.
5. Open **Integrations** in your project, find **ntfy**, and click **Add Integration**:
   - Topic: your ntfy topic name
   - Server: keep `https://ntfy.sh`
   - Save
6. Go back to the check and make sure ntfy is turned on under Notifications.
7. Paste the URL into **Healthchecks.io ping URL** on the Settings page and save.

From then on, if the computer goes offline or sleeps for about 30 minutes, Healthchecks.io sends you a "down" notification, and an "up" notification when it recovers. Healthchecks.io also supports Pushover, so you can add it under Integrations if you want offline alerts to ring too.

## Step 5: Start and test

1. Save your settings, then click **Send test notification** and make sure your phone gets it.
2. Open the Apple iPhone buy page from Step 2.
3. Wait about 20 seconds:
   - The tab title gets a prefix like `[No stock 01:04:36]`. This means the check worked.
   - Your phone gets "Watcher started. Checking N stores (endpoint: pickup)." `pickup` means the newer endpoint works. `fulfillment` means it had to use the older one.
4. **Test the in-stock alert**: on the **Apple buy page**, press F12 → Console, paste this line and press Enter:
   ```js
   window.postMessage({__asw:true,title:"iPhone in stock",msg:"test"},"*")
   ```
   If Chrome blocks pasting, type `allow pasting` and press Enter first, then paste.
   ntfy should show "test" and Pushover should start ringing.
   This must be run in the console of the Apple buy page. Running it on any other page does nothing.

## Step 6: Keep it running (required)

If the computer sleeps or Chrome puts the tab to sleep, checking stops. Set these two things before you leave it running.

**1. Stop the computer from sleeping**

- **Mac**: System Settings → Battery → Options → turn on **"Prevent automatic sleeping on power adapter when the display is off"**. Keep the Mac plugged in, and keep a MacBook's lid open.
- **Windows**: Settings → System → Power (or Power & battery) → Screen and sleep → set the sleep option for when plugged in to **Never**.

The screen turning off is fine.

**2. Stop Chrome from putting the tab to sleep**

Chrome Settings → Performance → under **"Always keep these sites active"**, click **Add** and enter `apple.com`. Turning off Memory Saver also works.

## Daily use

- The extension's **Status** page shows when the last check ran, how many stores were checked, what was in stock, and whether it is waiting after a block. It also has the Pause watching / Resume watching button.
- Leave the buy page tab alone. A separate, minimized Chrome window works well. If you close it by accident, the extension reopens it in the background.
- **To stop watching, press Pause watching on the Status page** (click the extension icon). Closing the tab is not enough, because it will be reopened. Resume watching starts again and reopens the buy page if needed. Turning the extension off in `chrome://extensions` also stops everything.
- Checks happen about every 10 minutes. The page reloads itself about every hour (about every 20 minutes if it has to use the older endpoint). The exact times are randomized on purpose.
- If checks stop for a while, the extension reloads or reopens the page once by itself, and only alerts you if that doesn't help.
- You can open another Apple buy page tab to shop. Only one buy page tab does the checking, so this doesn't add requests.
- Tap an in-stock notification to open the buy page, then order quickly. Popular configurations often sell out within minutes. Signing in to the Apple Store app and saving a payment method in advance saves time.

## Restock history

The extension records when each store and model comes into stock and when it sells out. Click the extension icon in the Chrome toolbar and choose **History**. The page shows:

- a chart of how many restocks happened in each hour of the day, which shows when your nearby stores usually restock (the highlighted bar is the current hour),
- a table of every restock with its store, part number, when a check first saw it in stock, when a check first saw it sold out, and how long it lasted,
- buttons to export the history as CSV or clear it.

Notes:

- Times are when a check saw the change, so each one can be off by up to one check interval.
- The first check after installing only notes what is already in stock. That is not counted as a restock.
- A row without a sell-out time says **In stock now** only while checks are running normally. If checks have stopped, it shows the time of the last check instead, since the extension cannot know what happened after that.
- Clearing the history keeps track of what is in stock right now, so those items are not recorded as a new restock at the next check.
- The page updates by itself while it is open.

The history is kept in your browser only and is not sent anywhere. It covers only the time the extension was running and not blocked.

## Settings reference

Everything is on the Settings page. Saved settings apply at the next check; you don't need to reload anything. They are stored in this Chrome profile only.

| Field | Default | What it does |
|---|---|---|
| Part numbers | two example part numbers | Models to watch (Step 2) |
| Search area | `10001` | ZIP codes or store IDs; each one covers the 12 nearest stores (Step 3) |
| Check every (minutes) | `10` | Average minutes between checks. Keep it at 5 or higher |
| Randomize by (%) | `30` | Each wait is randomized by up to this much (under Advanced) |
| Reload page every (minutes) | `60` | Average minutes between page reloads (under Advanced) |
| Reload on older endpoint (minutes) | `20` | Page reload interval when the last check had to use the older endpoint (under Advanced) |
| Carrier version | `UNLOCKED/US` | Usually leave as is (under Advanced) |
| ntfy topic | empty | Your ntfy topic. Empty means ntfy is off |
| Pushover API token, user key | empty | Your Pushover keys. Both empty means Pushover is off |
| Pushover sound | `persistent` | Use `alarm30` after uploading `alarm30.mp3` |
| Healthchecks.io ping URL | empty | Empty means off |
| "Still running" message every (hours) | `12` | How often to send "still running" |
| Reopen the buy page | on | Reopen the buy page if its tab is closed or Chrome restarts |

**Restore defaults** on the Settings page resets these fields. It does not touch the restock history.

## FAQ

**Will my iPhone ring when it is on silent?**
Yes, if you set up Pushover (Option B) and turned on Critical Alerts. The alarm also rings when the iPhone is in the default Sleep Focus.

**How do I check whether Apple is limiting me?**
Open the iPhone buy page normally in Chrome and look at the area above the **Add to Bag** button. If you see both a **Delivers to ...** line and a **Pickup: ...** line, you are fine. If both lines are missing and only the Add to Bag button is shown, Apple is temporarily limiting your computer or network. Disable the extension and try again later.

**The tab title shows `[Blocked ...]` or `[Waiting until ...]`. What now?**
The extension waits and retries by itself, with longer waits each time (5, 10, 20, then every 30 minutes). It sends no requests while waiting, and sends an alert after 3 failures in a row. To clear the waiting state and try right away, close the buy page tab and open it again in a new tab. If it keeps happening, disable the extension first. Then check whether Apple is limiting you, as described in the question above. If you are limited, you can only wait and try again later. When it recovers, increase **Check every** on the Settings page.

**The tab title never changes?**
Open the extension's Status page first. Then, on the buy page, press F12 → Console and look for lines starting with `[Apple Watcher]`. If the title says `[No models set ...]` or `[No area set ...]`, fill in those fields on the Settings page. If it says "Another Apple buy page tab is doing the checks", another buy page tab is the one checking, which is normal.

**ntfy works but Pushover does nothing?**
In `chrome://extensions`, click the **Service Worker** link on the extension card to open the background console, then run the test again and look at the line starting with `pushover`. `"status":1` means it was sent. If it says the token or user is invalid, check for copy mistakes.

**Pushover notifies but makes no sound?**
Check item 2 of Option B in Step 4 and make sure Critical Alerts are allowed.

**What should I do before sharing this with friends?**
Nothing. Since 1.7 your ntfy topic and Pushover keys are stored in your browser, not in the project files, so the folder you share contains no keys. Send your friends the GitHub link and let them enter their own on the Settings page.

## Contact

Questions or problems? Email me at jefftsuei217@gmail.com. I don't check this inbox very often, but I will reply to every message I see.

## Disclaimer

This project is for personal learning only and is not affiliated with Apple. Please follow the Apple website's terms of use and keep the checking frequency reasonable.

If this project violates Apple's terms or infringes on any rights, please contact me at jefftsuei217@gmail.com and I will remove it.
