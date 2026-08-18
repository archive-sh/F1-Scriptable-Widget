# F1 Scriptable Widget

An iOS home-screen widget showing Formula 1 championship standings, session
results, race order, lap progress, and a live countdown. It requires a medium or
large Scriptable widget and caches successful responses for offline use.

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
   when OpenF1 publishes a matching race-control message.
- Race results remain through the end of the phone's local calendar day. The
   widget returns to standings and the next-race countdown the following day.

## Data source

The widget uses two free APIs; neither requires a key:

- [Jolpica F1](https://jolpi.ca/) for schedules and championship standings. It
   is the maintained successor to the Ergast API.
- [OpenF1](https://openf1.org/) for session timing, drivers, classifications,
   position changes, completed laps, and race-control messages.

Relevant endpoints include:

- Season schedule: `https://api.jolpi.ca/ergast/f1/current.json`
- Driver standings: `https://api.jolpi.ca/ergast/f1/current/driverstandings.json`
- OpenF1 sessions: `https://api.openf1.org/v1/sessions?meeting_key=...`
- OpenF1 documentation: <https://openf1.org/>
- Jolpica documentation: <https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md>

Jolpica asks clients to stay within 4 requests per second and 500 requests per
hour. The script requests a refresh after 2 minutes during active competitive
sessions and after 15 minutes otherwise. iOS controls actual widget refreshes,
so the displayed order is the latest fetched snapshot rather than continuous
second-by-second live timing. Only the countdown updates every second, using
Scriptable's native timer text without network requests or a JavaScript timer.
The day field is calculated by the script and prefixed to the native ticking
hours, minutes, and seconds timer.

## Install on iPhone

1. Install [Scriptable](https://scriptable.app/) from the App Store.
2. Move `F1 Widget.js` into the `Scriptable` folder in iCloud Drive, or create a
   new Scriptable script named `F1 Widget` and paste in the file contents.
3. Run the script once in Scriptable to verify the preview and grant network
   access if prompted.
4. Add a Scriptable widget to the Home Screen.
5. Long-press the widget, choose **Edit Widget**, and select `F1 Widget` as the
   script. Choose medium or large; a small widget intentionally shows an
   unsupported-size message.

All displayed times use the iPhone's current time zone. Tapping the widget opens
the next race's reference page supplied by the API.

## Development

There are no npm packages or build steps. Edit `F1 Widget.js`, then sync it to
Scriptable through iCloud Drive or AirDrop. The code uses Scriptable globals such
as `ListWidget`, `Request`, `FileManager`, and `DateFormatter`, so it is intended
to run inside Scriptable rather than Node.js.