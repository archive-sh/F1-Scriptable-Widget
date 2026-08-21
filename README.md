# F1 Scriptable Widget

Two iOS home-screen widgets showing Formula 1 championship standings, session
results, race order, lap progress, and a live countdown. Both require a medium
or large Scriptable widget and cache successful responses for offline use.

- `F1 Widget.js` reads live timing directly from Formula 1's SignalR Core feed.
- `F1 Widget OpenF1.js` uses OpenF1 for session timing and results.

## Widget behavior

- Outside a race weekend, the left side shows the top five drivers and the right
   side counts down to lights out. Large widgets show the top six drivers and top
   six constructors. Driver and constructor names use their current team colors.
- The main content uses equal-width left and right columns. The countdown is
   vertically centered in its column and displays `DD:HH:MM:SS`.
- During practice, the existing left-side data remains unchanged. Once practice
   finishes, its top five results appear on medium widgets and top ten on large.
- Sprint qualifying, sprints, and qualifying show their latest order while active
   and retain their classified results afterward. The section heading identifies
   the session being shown.
- Once the race starts, both columns become the latest race order: top ten on
   medium and top twenty on large. `LAPS 6/60` means the leader has completed 6
   of 60 scheduled laps.
- Large race widgets mark warnings with a yellow `!` and penalties with a red `!`
   when the selected timing source publishes a matching race-control message.
- Race results remain through the end of the phone's local calendar day. The
   widget returns to standings and the next-race countdown the following day.

## Data sources

Both scripts use [Jolpica F1](https://jolpi.ca/) for schedules and championship
standings. It is the maintained successor to the Ergast API. Session timing
comes from one of these sources:

- Formula 1's SignalR Core live timing feed in `F1 Widget.js`.
- [OpenF1](https://openf1.org/) for session timing, drivers, classifications,
  completed laps, and race-control messages in `F1 Widget OpenF1.js`.

Relevant endpoints include:

- Season schedule: `https://api.jolpi.ca/ergast/f1/current.json`
- Driver standings: `https://api.jolpi.ca/ergast/f1/current/driverstandings.json`
- Official live stream: `wss://livetiming.formula1.com/signalrcore`
- OpenF1 sessions: `https://api.openf1.org/v1/sessions?meeting_key=...`
- OpenF1 documentation: <https://openf1.org/>
- Jolpica documentation: <https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md>

Jolpica asks clients to stay within 4 requests per second and 500 requests per
hour. Each script requests a refresh after 2 minutes during active competitive
sessions and after 15 minutes otherwise. iOS controls actual widget refreshes,
so the displayed order is the latest fetched snapshot rather than continuous
second-by-second live timing. Only the countdown updates every second, using
Scriptable's native timer text without network requests or a JavaScript timer.
The day field is calculated by the script and prefixed to the native ticking
hours, minutes, and seconds timer.

### Official F1 live access

`F1 Widget.js` opens the official SignalR stream briefly and subscribes only to
driver, timing, lap-count, race-control, session-info, and session-status topics.
It does not request car telemetry or position data. This is an undocumented
consumer API and Formula 1 can change it without notice.

The script first attempts an unauthenticated connection. Formula 1 may return
empty or partial data unless the connection includes a subscription token from
an active F1TV Access, Pro, or Premium account. To configure a token:

1. Obtain the `subscriptionToken` JWT from an authenticated F1TV session.
   FastF1 documents its current browser-assisted login workflow at
   <https://docs.fastf1.dev/>.
2. Run `F1 Widget` inside the Scriptable app.
3. Choose **Configure Official F1 Token**, paste the token, and refresh the
   Home Screen widget.

The token is stored only in iOS Keychain. It expires according to Formula 1's
JWT expiry and must then be replaced. The widget does not ask for or store F1TV
account credentials.

### OpenF1 live access

OpenF1 restricts its entire unauthenticated API from 30 minutes before a live
session until 30 minutes after it ends. Without paid credentials, the widget
continues to show its schedule, standings, countdown, and cached results. The
session panel says `LIVE DATA LOCKED` while current timing is unavailable.

To enable live practice, sprint, qualifying, and race data:

1. Obtain an OpenF1 real-time subscription from <https://openf1.org/>.
2. Run `F1 Widget OpenF1` inside the Scriptable app.
3. Choose **Configure OpenF1 Live Access** and enter the OpenF1 username and
   password issued with the subscription.
4. Refresh the Home Screen widget.

Credentials and one-hour OAuth access tokens are stored only in iOS Keychain;
they are not written to this script, its cache, or the repository. Run the
script in Scriptable again to replace or remove the saved credentials.

## Install on iPhone

1. Install [Scriptable](https://scriptable.app/) from the App Store.
2. Move one or both JavaScript files into the `Scriptable` folder in iCloud
   Drive. Keep their filenames so they appear as `F1 Widget` and
   `F1 Widget OpenF1` in Scriptable.
3. Run the script once in Scriptable to verify the preview and grant network
   access if prompted.
4. Add a Scriptable widget to the Home Screen.
5. Long-press the widget, choose **Edit Widget**, and select either script.
   Choose medium or large; a small widget intentionally shows an unsupported-
   size message.

All displayed times use the iPhone's current time zone. Tapping the widget opens
the next race's reference page supplied by the API.

## Development

There are no npm packages or build steps. Edit either JavaScript file, then sync
it to Scriptable through iCloud Drive or AirDrop. The code uses Scriptable
globals such as `ListWidget`, `Request`, `WebView`, `FileManager`, and
`DateFormatter`, so it is intended to run inside Scriptable rather than Node.js.
