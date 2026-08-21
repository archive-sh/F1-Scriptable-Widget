// Session-aware F1 schedule, standings, and live-order widget for Scriptable.
const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const F1_SIGNALR_ORIGIN = "https://livetiming.formula1.com";
const F1_SIGNALR_TOKEN_KEY = "f1-widget-signalr-token";
const SIGNALR_TOPICS = [
  "DriverList",
  "TimingData",
  "LapCount",
  "RaceControlMessages",
  "SessionInfo",
  "SessionStatus",
];
const CACHE_FILE = "f1-widget-signalr-cache.json";
const ACTIVE_REFRESH_MINUTES = 2;
const IDLE_REFRESH_MINUTES = 15;

const COLORS = {
  background: new Color("111111"),
  red: new Color("e10600"),
  yellow: new Color("ffd60a"),
  primary: new Color("ffffff"),
  secondary: new Color("a8a8ad"),
};

const TEAM_COLORS = {
  alpine: "00a1e8",
  aston_martin: "229971",
  audi: "f50537",
  cadillac: "f2f2f2",
  ferrari: "e8002d",
  haas: "b6babd",
  mclaren: "ff8000",
  mercedes: "00d2be",
  racing_bulls: "6c98ff",
  rb: "6c98ff",
  red_bull: "4781d7",
  sauber: "52e252",
  williams: "64a8ff",
};

const COLUMN_WIDTH = 142;
const COLUMN_GAP = 5;
const LARGE_COLUMN_GAP = 22;

const RACE_LAPS = {
  "Albert Park": 58,
  Melbourne: 58,
  Shanghai: 56,
  Suzuka: 53,
  Miami: 57,
  Montreal: 70,
  Monaco: 78,
  Barcelona: 66,
  Catalunya: 66,
  "Red Bull Ring": 71,
  Spielberg: 71,
  Silverstone: 52,
  Spa: 44,
  "Spa-Francorchamps": 44,
  Hungaroring: 70,
  Zandvoort: 72,
  Monza: 53,
  Madrid: 57,
  Madring: 57,
  Baku: 51,
  Singapore: 62,
  Austin: 56,
  Mexico: 71,
  "Mexico City": 71,
  Interlagos: 71,
  "Las Vegas": 50,
  Lusail: 57,
  "Yas Marina": 58,
};

async function requestJSON(url) {
  const request = new Request(url);
  request.timeoutInterval = 12;
  return request.loadJSON();
}

function signalRToken() {
  const parameter = (args.widgetParameter || "").trim();
  if (parameter) return parameter;
  return Keychain.contains(F1_SIGNALR_TOKEN_KEY) ? Keychain.get(F1_SIGNALR_TOKEN_KEY) : "";
}

async function configureSignalRToken() {
  const alert = new Alert();
  alert.title = "Official F1 Live Timing";
  alert.message = "Paste an F1TV subscription token. It is stored only in iOS Keychain.";
  alert.addSecureTextField("Subscription token");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  if (await alert.presentAlert() !== 0) return false;

  const token = alert.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(F1_SIGNALR_TOKEN_KEY, token);
  return true;
}

async function interactiveAction() {
  const menu = new Alert();
  menu.title = "F1 Widget";
  menu.addAction("Preview Medium");
  menu.addAction("Preview Large");
  menu.addAction("Configure Official F1 Token");
  if (Keychain.contains(F1_SIGNALR_TOKEN_KEY)) menu.addDestructiveAction("Remove Official F1 Token");
  const choice = await menu.presentSheet();
  if (choice === 2) {
    await configureSignalRToken();
    return "medium";
  }
  if (choice === 3) {
    Keychain.remove(F1_SIGNALR_TOKEN_KEY);
    return "medium";
  }
  return choice === 1 ? "large" : "medium";
}

async function loadSignalRSnapshot() {
  const webView = new WebView();
  await webView.loadURL(`${F1_SIGNALR_ORIGIN}/signalrcore/negotiate`);
  const token = signalRToken();
  const tokenLiteral = JSON.stringify(token);
  const script = `
    const done = (value) => completion(JSON.stringify(value));
    const merge = (target, source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) return source;
      const output = target && typeof target === "object" && !Array.isArray(target) ? target : {};
      for (const key of Object.keys(source)) output[key] = merge(output[key], source[key]);
      return output;
    };
    (async () => {
      const topics = ${JSON.stringify(SIGNALR_TOPICS)};
      const token = ${tokenLiteral};
      const headers = token ? { Authorization: "Bearer " + token } : {};
      const response = await fetch("/signalrcore/negotiate?negotiateVersion=1", { method: "POST", headers });
      if (!response.ok) throw new Error("SignalR negotiate failed: " + response.status);
      const negotiation = await response.json();
      const id = encodeURIComponent(negotiation.connectionToken || negotiation.connectionId);
      const access = token ? "&access_token=" + encodeURIComponent(token) : "";
      const socket = new WebSocket("wss://livetiming.formula1.com/signalrcore?id=" + id + access);
      const state = {};
      let subscribed = false;
      const timer = setTimeout(() => { socket.close(); done({ ok: true, state }); }, 6500);
      socket.onopen = () => socket.send(JSON.stringify({ protocol: "json", version: 1 }) + "\\u001e");
      socket.onerror = () => { clearTimeout(timer); done({ ok: false, error: "SignalR WebSocket failed" }); };
      socket.onmessage = (event) => {
        for (const frame of event.data.split("\\u001e").filter(Boolean)) {
          const message = JSON.parse(frame);
          if (!subscribed && Object.keys(message).length === 0) {
            subscribed = true;
            socket.send(JSON.stringify({ type: 1, target: "Subscribe", arguments: [topics], invocationId: "1" }) + "\\u001e");
            continue;
          }
          if (message.type === 3 && message.invocationId === "1" && message.result) {
            for (const key of Object.keys(message.result)) state[key] = merge(state[key], message.result[key]);
          }
          if (message.type === 1 && String(message.target).toLowerCase() === "feed") {
            const args = message.arguments || [];
            const topic = args[0];
            if (topic) state[topic] = merge(state[topic], args[1]);
          }
        }
      };
    })().catch((error) => done({ ok: false, error: String(error.message || error) }));
  `;
  const raw = await webView.evaluateJavaScript(script, true);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(result.error || "Official F1 stream unavailable");
  return result.state || {};
}

function readCache(fileManager, cachePath) {
  if (!fileManager.fileExists(cachePath)) return {};
  try {
    return JSON.parse(fileManager.readString(cachePath));
  } catch (_) {
    return {};
  }
}

function racesFrom(response) {
  return response?.MRData?.RaceTable?.Races || [];
}

function raceDate(race) {
  return new Date(`${race.date}T${race.time || "00:00:00Z"}`);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function relevantRace(schedule, now) {
  const races = racesFrom(schedule);
  const today = localDateKey(now);
  return races.find((race) => localDateKey(raceDate(race)) >= today) || races[races.length - 1] || null;
}

function scheduleSessions(race) {
  if (!race) return [];
  const definitions = [
    ["Practice 1", "Practice", race.FirstPractice, 60],
    ["Practice 2", "Practice", race.SecondPractice, 60],
    ["Practice 3", "Practice", race.ThirdPractice, 60],
    ["Sprint Qualifying", "Qualifying", race.SprintQualifying, 60],
    ["Sprint", "Race", race.Sprint, 60],
    ["Qualifying", "Qualifying", race.Qualifying, 60],
    ["Race", "Race", { date: race.date, time: race.time }, 120],
  ];
  return definitions
    .filter(([, , session]) => session?.date)
    .map(([sessionName, sessionType, session, durationMinutes]) => {
      const start = new Date(`${session.date}T${session.time || "00:00:00Z"}`);
      return {
        session_key: null,
        session_name: sessionName,
        session_type: sessionType,
        date_start: start.toISOString(),
        date_end: new Date(start.getTime() + durationMinutes * 60000).toISOString(),
        circuit_short_name: race.Circuit?.circuitName,
        is_cancelled: false,
        is_schedule_fallback: true,
      };
    });
}

function isPractice(session) {
  return session?.session_type === "Practice";
}

function isRace(session) {
  return session?.session_type === "Race" && !session.session_name.toLowerCase().includes("sprint");
}

function isCompetitive(session) {
  const name = session?.session_name.toLowerCase() || "";
  return isPractice(session) || session?.session_type === "Qualifying" || name.includes("sprint");
}

function deriveState(now, race, rawSessions) {
  const sessions = [...rawSessions]
    .filter((session) => !session.is_cancelled)
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  const raceSession = sessions.find(isRace) || null;
  const activeSession = sessions.find((session) => {
    const start = new Date(session.date_start);
    const end = new Date(session.date_end);
    return now >= start && now <= end;
  }) || null;
  const localRaceDay = race ? localDateKey(raceDate(race)) : null;
  const raceDay = localRaceDay === localDateKey(now);
  const raceHasStarted = raceSession && now >= new Date(raceSession.date_start);

  if (raceDay && raceHasStarted) {
    return {
      mode: "race",
      displaySession: raceSession,
      isActive: now <= new Date(new Date(raceSession.date_end).getTime() + 2 * 3600000),
      isWeekend: true,
    };
  }

  const firstSession = sessions[0];
  const isWeekend = Boolean(firstSession && race && localDateKey(now) >= localDateKey(new Date(firstSession.date_start)) && localDateKey(now) <= localRaceDay);
  if (!isWeekend) return { mode: "standings", displaySession: null, isActive: false, isWeekend: false };

  if (activeSession && !isPractice(activeSession)) {
    return { mode: "session", displaySession: activeSession, isActive: true, isWeekend: true };
  }

  const completed = sessions
    .filter((session) => isCompetitive(session) && new Date(session.date_end) < now)
    .pop();
  return completed
    ? { mode: "session", displaySession: completed, isActive: false, isWeekend: true }
    : { mode: "standings", displaySession: null, isActive: Boolean(activeSession), isWeekend: true };
}

function canonicalSessionName(name) {
  const normalized = String(name || "").trim();
  const aliases = {
    FP1: "Practice 1",
    FP2: "Practice 2",
    FP3: "Practice 3",
    "Sprint Shootout": "Sprint Qualifying",
  };
  return aliases[normalized] || normalized;
}

function officialSessionName(snapshot) {
  return canonicalSessionName(snapshot?.SessionInfo?.Name || snapshot?.SessionInfo?.Type);
}

function officialDrivers(snapshot) {
  const entries = snapshot?.DriverList || {};
  return Object.entries(entries)
    .filter(([, driver]) => driver && typeof driver === "object")
    .map(([number, driver]) => ({
      driver_number: Number(driver.RacingNumber || number),
      name_acronym: driver.Tla || driver.BroadcastName || number,
      team_name: driver.TeamName,
      team_colour: String(driver.TeamColour || "").replace("#", ""),
    }));
}

function officialResults(snapshot) {
  const lines = snapshot?.TimingData?.Lines || {};
  return Object.entries(lines)
    .filter(([, line]) => line && typeof line === "object" && line.Position)
    .map(([number, line]) => ({
      driver_number: Number(number),
      position: Number(line.Position),
      number_of_laps: Number(line.NumberOfLaps || 0),
      gap_to_leader: line.GapToLeader
        || line.IntervalToPositionAhead?.Value
        || line.BestLapTime?.Value
        || null,
      dnf: Boolean(line.Retired || line.Stopped),
      dsq: Boolean(line.Disqualified),
    }))
    .sort((a, b) => a.position - b.position);
}

function officialRaceControl(snapshot) {
  const messages = snapshot?.RaceControlMessages?.Messages || {};
  const values = Array.isArray(messages) ? messages : Object.values(messages);
  return values.map((message) => ({
    driver_number: Number(message.RacingNumber || 0) || null,
    category: message.Category,
    message: message.Message,
  }));
}

async function loadData(now) {
  const fileManager = FileManager.local();
  const cachePath = fileManager.joinPath(fileManager.documentsDirectory(), CACHE_FILE);
  const cached = readCache(fileManager, cachePath);
  const fresh = {};

  async function cachedRequest(key, url) {
    try {
      const value = await requestJSON(url);
      fresh[key] = value;
      return value;
    } catch (_) {
      return cached[key];
    }
  }

  const year = now.getFullYear();
  const [schedule, driverStandings, constructorStandings] = await Promise.all([
    cachedRequest("schedule", `${JOLPICA_BASE}/${year}.json`),
    cachedRequest("driverStandings", `${JOLPICA_BASE}/${year}/driverstandings.json`),
    cachedRequest("constructorStandings", `${JOLPICA_BASE}/${year}/constructorstandings.json`),
  ]);

  if (!schedule) throw new Error("The F1 schedule is unavailable");
  const race = relevantRace(schedule, now);
  const sessions = scheduleSessions(race);
  const state = deriveState(now, race, sessions);
  const sessionSnapshots = { ...(cached.sessionSnapshots || {}) };
  let streamUnavailable = false;

  if (state.isWeekend) {
    try {
      const snapshot = await loadSignalRSnapshot();
      const name = officialSessionName(snapshot);
      if (name) sessionSnapshots[name] = snapshot;
      fresh.sessionSnapshots = sessionSnapshots;
    } catch (_) {
      streamUnavailable = true;
    }
  }

  const selectedSnapshot = state.displaySession
    ? sessionSnapshots[canonicalSessionName(state.displaySession.session_name)] || null
    : null;
  const sessionResults = officialResults(selectedSnapshot);
  const drivers = officialDrivers(selectedSnapshot);
  const raceControl = officialRaceControl(selectedSnapshot);
  const totalLaps = Number(selectedSnapshot?.LapCount?.TotalLaps || 0);
  const currentLap = Number(selectedSnapshot?.LapCount?.CurrentLap || 0);
  if (state.mode === "race" && sessionResults[0] && currentLap) {
    sessionResults[0].number_of_laps = currentLap;
  }

  if (Object.keys(fresh).length > 0) {
    fileManager.writeString(cachePath, JSON.stringify({ ...cached, ...fresh, updatedAt: now.toISOString() }));
  }

  return {
    race,
    sessions: sessions || [],
    state,
    driverStandings,
    constructorStandings,
    sessionResults: sessionResults || [],
    drivers: drivers || [],
    raceControl,
    totalLaps,
    streamUnavailable,
  };
}

function formatDate(date) {
  const formatter = new DateFormatter();
  formatter.dateFormat = "EEE, MMM d";
  return formatter.string(date);
}

function formatTime(date) {
  const formatter = new DateFormatter();
  formatter.useNoDateStyle();
  formatter.useShortTimeStyle();
  return formatter.string(date);
}

function formatRaceDates(race, sessions) {
  const first = sessions[0] ? new Date(sessions[0].date_start) : raceDate(race);
  const last = raceDate(race);
  if (localDateKey(first) === localDateKey(last)) return formatDate(last);
  const formatter = new DateFormatter();
  formatter.dateFormat = "MMM d";
  return `${formatter.string(first)}-${formatter.string(last)}`;
}

function addText(parent, value, size, color = COLORS.primary, weight = "regular") {
  const text = parent.addText(value);
  text.font = weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  text.textColor = color;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
  return text;
}

function teamColor(teamId, apiColor) {
  const value = apiColor || TEAM_COLORS[teamId];
  return value && /^[0-9a-f]{6}$/i.test(value) ? new Color(value) : COLORS.primary;
}

function addHeader(widget, race, sessions, isWeekend) {
  const header = widget.addStack();
  header.layoutVertically();
  const titleRow = header.addStack();
  titleRow.centerAlignContent();
  const mark = titleRow.addStack();
  mark.backgroundColor = COLORS.red;
  mark.size = new Size(5, 19);
  mark.cornerRadius = 2;
  titleRow.addSpacer(7);
  addText(titleRow, isWeekend ? race.raceName : `Next: ${race.raceName}`, 16, COLORS.primary, "bold");
  titleRow.addSpacer();
  header.addSpacer(2);
  addText(header, formatRaceDates(race, sessions), 11, COLORS.secondary, "bold");
}

function driverStandingsFrom(response) {
  return response?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
}

function constructorStandingsFrom(response) {
  return response?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
}

function addStandings(parent, heading, entries, type, limit = 5, rowGap = 3) {
  addText(parent, heading.toUpperCase(), 10, COLORS.red, "bold");
  parent.addSpacer(4);
  for (const entry of entries.slice(0, limit)) {
    const row = parent.addStack();
    addText(row, entry.position, 11, COLORS.secondary, "bold");
    row.addSpacer(6);
    const name = type === "driver" ? (entry.Driver.code || entry.Driver.familyName) : entry.Constructor.name;
    const teamId = type === "driver" ? entry.Constructors?.[0]?.constructorId : entry.Constructor.constructorId;
    addText(row, name, 11, teamColor(teamId), "bold");
    row.addSpacer();
    addText(row, `${entry.points} pts`, 10, COLORS.secondary);
    parent.addSpacer(rowGap);
  }
}

function addCountdown(parent, race) {
  const now = new Date();
  const secondsRemaining = Math.max(0, Math.floor((raceDate(race) - now) / 1000));
  const days = Math.floor(secondsRemaining / 86400);
  const subDaySeconds = secondsRemaining % 86400;
  const hours = Math.floor(subDaySeconds / 3600);
  const minutes = Math.floor((subDaySeconds % 3600) / 60);
  const subDayTarget = new Date(now.getTime() + subDaySeconds * 1000);
  parent.addSpacer();
  const content = parent.addStack();
  content.layoutVertically();
  addText(content, "LIGHTS OUT", 10, COLORS.red, "bold");
  content.addSpacer(4);
  const countdown = content.addStack();
  countdown.centerAlignContent();
  countdown.size = new Size(COLUMN_WIDTH, 24);
  const dayText = addText(countdown, `${String(days).padStart(2, "0")}:`, 19, COLORS.primary, "bold");
  dayText.font = Font.boldMonospacedSystemFont(19);
  dayText.minimumScaleFactor = 0.75;
  const timePrefix = hours === 0
    ? (minutes < 10 ? "00:0" : "00:")
    : (hours < 10 ? "0" : "");
  if (timePrefix) {
    const hourPrefix = addText(countdown, timePrefix, 19, COLORS.primary, "bold");
    hourPrefix.font = Font.boldMonospacedSystemFont(19);
    hourPrefix.minimumScaleFactor = 0.75;
  }
  const timer = countdown.addDate(subDayTarget);
  timer.applyTimerStyle();
  timer.font = Font.boldMonospacedSystemFont(19);
  timer.textColor = COLORS.primary;
  timer.minimumScaleFactor = 0.75;
  content.addSpacer(4);
  addText(content, `${formatDate(raceDate(race))} at ${formatTime(raceDate(race))}`, 9, COLORS.secondary);
  addText(content, `${race.Circuit.Location.locality}, ${race.Circuit.Location.country}`, 9, COLORS.secondary);
  parent.addSpacer();
}

function driverMap(drivers) {
  return Object.fromEntries(drivers.map((driver) => [driver.driver_number, driver]));
}

function incidentMap(messages) {
  const incidents = {};
  for (const item of messages) {
    if (!item.driver_number) continue;
    const message = item.message?.toUpperCase() || "";
    if (item.category === "Penalty" || message.includes("PENALTY")) incidents[item.driver_number] = "penalty";
    else if (/WARNING|BLACK AND WHITE|REPRIMAND/.test(message) && !incidents[item.driver_number]) incidents[item.driver_number] = "warning";
  }
  return incidents;
}

function orderedResults(results) {
  return [...results].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
}

function addResults(parent, heading, results, drivers, limit, incidents = {}) {
  const byNumber = driverMap(drivers);
  if (heading) addText(parent, heading.toUpperCase(), 10, COLORS.red, "bold");
  parent.addSpacer(4);
  for (const result of orderedResults(results).slice(0, limit)) {
    const driver = byNumber[result.driver_number];
    const row = parent.addStack();
    addText(row, String(result.position || "-"), 10, COLORS.secondary, "bold");
    row.addSpacer(5);
    addText(
      row,
      driver?.name_acronym || String(result.driver_number),
      11,
      teamColor(null, driver?.team_colour),
      "bold",
    );
    if (incidents[result.driver_number]) {
      row.addSpacer(3);
      addText(row, "!", 11, incidents[result.driver_number] === "penalty" ? COLORS.red : COLORS.yellow, "bold");
    }
    row.addSpacer();
    const detail = result.dnf ? "DNF" : result.dsq ? "DSQ" : result.gap_to_leader;
    if (detail !== null && detail !== undefined) {
      const value = typeof detail === "number" && detail > 0 ? `+${detail.toFixed(3)}` : String(detail);
      addText(row, value, 9, COLORS.secondary);
    }
    parent.addSpacer(2);
  }
}

function addUnavailableResults(parent, heading, restricted) {
  addText(parent, heading.toUpperCase(), 10, COLORS.red, "bold");
  parent.addSpacer(6);
  addText(parent, restricted ? "OFFICIAL FEED UNAVAILABLE" : "RESULTS PENDING", 11, COLORS.primary, "bold");
  parent.addSpacer(3);
  addText(parent, restricted ? "Add an F1TV token" : "Waiting for timing data", 9, COLORS.secondary);
}

function addRaceResults(parent, results, drivers, family, incidents) {
  const ordered = orderedResults(results);
  const total = family === "large" ? 20 : 10;
  const perColumn = total / 2;
  const columns = parent.addStack();
  for (let index = 0; index < 2; index += 1) {
    const column = columns.addStack();
    column.layoutVertically();
    column.size = new Size(COLUMN_WIDTH, 0);
    addResults(column, index === 0 ? "Race order" : "", ordered.slice(index * perColumn), drivers, perColumn, incidents);
    if (index === 0) columns.addSpacer(family === "large" ? LARGE_COLUMN_GAP : COLUMN_GAP);
  }
}

function addLapProgress(parent, data) {
  const leader = orderedResults(data.sessionResults)[0];
  const total = data.totalLaps || RACE_LAPS[data.state.displaySession?.circuit_short_name];
  addText(parent, `LAPS ${leader?.number_of_laps ?? 0}/${total || "--"}`, 10, COLORS.primary, "bold");
}

function buildWidget(data, family) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.background;
  widget.setPadding(9, 10, 10, 10);
  widget.url = data.race?.url || "https://www.formula1.com/";
  widget.refreshAfterDate = new Date(Date.now() + (data.state.isActive ? ACTIVE_REFRESH_MINUTES : IDLE_REFRESH_MINUTES) * 60000);

  if (family === "small") {
    addText(widget, "F1 requires a medium or large widget.", 14, COLORS.primary, "bold");
    return widget;
  }

  addHeader(widget, data.race, data.sessions, data.state.isWeekend);
  widget.addSpacer(family === "large" ? 12 : 9);

  if (data.state.mode === "race") {
    const status = widget.addStack();
    addText(status, data.state.isActive ? "RACE - LATEST ORDER" : "RACE RESULT", 9, COLORS.red, "bold");
    status.addSpacer();
    addLapProgress(status, data);
    widget.addSpacer(5);
    if (data.sessionResults.length > 0) {
      addRaceResults(widget, data.sessionResults, data.drivers, family, family === "large" ? incidentMap(data.raceControl) : {});
    } else {
      addUnavailableResults(widget, "Race", data.streamUnavailable);
    }
    widget.addSpacer(2);
    return widget;
  }

  const body = widget.addStack();
  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(COLUMN_WIDTH, 0);
  if (data.state.mode === "session") {
    if (data.sessionResults.length > 0) {
      addResults(left, data.state.displaySession.session_name, data.sessionResults, data.drivers, family === "large" ? 10 : 5);
    } else {
      addUnavailableResults(left, data.state.displaySession.session_name, data.streamUnavailable);
    }
  } else {
    const standingsLimit = family === "large" ? 6 : 5;
    const standingsRowGap = family === "large" ? 7 : 3;
    addStandings(left, "Driver standings", driverStandingsFrom(data.driverStandings), "driver", standingsLimit, standingsRowGap);
    if (family === "large") {
      left.addSpacer(13);
      addStandings(left, "Constructor standings", constructorStandingsFrom(data.constructorStandings), "constructor", standingsLimit, standingsRowGap);
    }
  }
  body.addSpacer(family === "large" ? LARGE_COLUMN_GAP : COLUMN_GAP);
  const right = body.addStack();
  right.layoutVertically();
  right.size = new Size(COLUMN_WIDTH, 0);
  addCountdown(right, data.race);
  widget.addSpacer(2);
  return widget;
}

async function run() {
  let widget;
  const family = config.runsInWidget
    ? (config.widgetFamily || "medium")
    : await interactiveAction();
  try {
    widget = buildWidget(await loadData(new Date()), family);
  } catch (_) {
    widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(16, 16, 16, 16);
    addText(widget, "Unable to load F1 data", 15, COLORS.primary, "bold");
    widget.addSpacer(4);
    addText(widget, "Check your connection and refresh.", 11, COLORS.secondary);
  }

  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === "large") await widget.presentLarge();
  else await widget.presentMedium();
  Script.complete();
}

await run();