(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEYS = { sessions: "devspace.sessions.v1", notes: "devspace.notes.v1" };
  const ACTIVITIES = ["DSA / Coding", "College studies", "Project work", "Data Science / ML", "Break / Personal"];
  let sessions = loadJSON(KEYS.sessions, []);
  let current = null;
  let tickHandle = null;
  let toastHandle = null;
  let focusRemaining = 25 * 60;
  let focusRunning = false;
  let focusHandle = null;
  let deferredInstallPrompt = null;

  function loadJSON(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function saveSessions() {
    try { localStorage.setItem(KEYS.sessions, JSON.stringify(sessions)); return true; }
    catch { showToast("Couldn't save. Export your history and check browser storage."); return false; }
  }
  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function fmtDuration(seconds, short = false) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    if (short) return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  function humanTime(iso) {
    return new Date(iso).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
  }
  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => el.classList.remove("show"), 2500);
  }
  function updateClock() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    $("clockDate").textContent = now.toLocaleDateString([], {weekday:"long", month:"short", day:"numeric"});
    $("dateLabel").textContent = now.toLocaleDateString([], {weekday:"long"}).toUpperCase() + " · YOUR DAY, AT A GLANCE";
    $("todayLabel").textContent = now.toLocaleDateString([], {month:"short", day:"numeric"});
    const hour = now.getHours();
    $("greeting").textContent = hour < 12 ? "Good morning. Start with one thing." : hour < 17 ? "Make room for focused work." : "A little progress still counts.";
  }
  function sessionSeconds(s) { return Math.max(0, Number(s.durationSeconds) || 0); }
  function todaySessions() { const today = dateKey(new Date()); return sessions.filter(s => dateKey(s.startedAt) === today); }
  function refreshSummary() {
    const today = todaySessions();
    const total = today.reduce((sum, s) => sum + sessionSeconds(s), 0);
    $("todayTotal").textContent = fmtDuration(total, true);
    $("todaySessions").textContent = String(today.length);
    const totals = ACTIVITIES.map(name => ({name, seconds: today.filter(s => s.activity === name).reduce((sum,s) => sum + sessionSeconds(s),0)})).filter(x => x.seconds > 0).sort((a,b) => b.seconds-a.seconds);
    const container = $("activityBreakdown");
    if (!totals.length) {
      container.innerHTML = '<p class="empty-state">Your activity breakdown will appear here after your first session.</p>';
      return;
    }
    container.innerHTML = "";
    totals.forEach(item => {
      const row = document.createElement("div"); row.className = "breakdown-row";
      const label = document.createElement("div"); label.className = "breakdown-label";
      const name = document.createElement("span"); name.textContent = item.name;
      const duration = document.createElement("span"); duration.textContent = fmtDuration(item.seconds, true);
      label.append(name, duration);
      const track = document.createElement("div"); track.className = "bar-track";
      const bar = document.createElement("span"); bar.style.width = `${Math.min(100, total ? item.seconds/total*100 : 0)}%`;
      track.append(bar); row.append(label,track); container.append(row);
    });
  }
  function makeHistoryItem(s) {
    const row = document.createElement("div"); row.className = "history-item";
    const dot = document.createElement("span"); dot.className = "history-dot";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = s.task ? `${s.activity} · ${s.task}` : s.activity;
    const meta = document.createElement("small"); meta.textContent = `${humanTime(s.startedAt)} – ${humanTime(s.endedAt)}${s.pausedSeconds ? ` · ${fmtDuration(s.pausedSeconds,true)} paused` : ""}`;
    copy.append(title,meta);
    const duration = document.createElement("span"); duration.className = "history-duration"; duration.textContent = fmtDuration(sessionSeconds(s),true);
    row.append(dot,copy,duration); return row;
  }
  function refreshRecent() {
    const el = $("recentHistory"); el.innerHTML = "";
    const recent = [...sessions].sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt)).slice(0,4);
    if (!recent.length) { el.innerHTML = '<p class="empty-state">Finished sessions will show up here.</p>'; return; }
    recent.forEach(s => el.append(makeHistoryItem(s)));
  }
  function refreshAll() { refreshSummary(); refreshRecent(); }
  function updateSessionTimer() {
    if (!current) { $("sessionTimer").textContent = "00:00:00"; return; }
    const seconds = current.elapsedSeconds + (current.running ? Math.floor((Date.now()-current.segmentStartedAt)/1000) : 0);
    $("sessionTimer").textContent = fmtDuration(seconds);
  }
  function setSessionUI(state) {
    const status = $("sessionStatus");
    status.classList.toggle("running", state === "running");
    status.innerHTML = state === "running" ? "<span></span> Tracking" : state === "paused" ? "<span></span> Paused" : "<span></span> Ready";
    $("startBtn").disabled = state === "running";
    $("pauseBtn").disabled = !current || state !== "running";
    $("finishBtn").disabled = !current;
    $("activitySelect").disabled = !!current;
    $("taskInput").disabled = !!current;
    $("sessionHint").textContent = state === "running" ? "Timer is running. Stay with your task." : state === "paused" ? "Paused. Resume when you're ready." : "Ready when you are.";
  }
  function startSession() {
    if (current && !current.running) {
      const resumedAt = Date.now();
      if (current.lastPausedAt) {
        current.pausedSeconds += Math.floor((resumedAt - current.lastPausedAt) / 1000);
        current.lastPausedAt = null;
      }
      current.running = true; current.segmentStartedAt = resumedAt;
      setSessionUI("running"); showToast("Session resumed."); return;
    }
    if (current) return;
    current = {
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      activity: $("activitySelect").value,
      task: $("taskInput").value.trim(),
      startedAt: new Date().toISOString(),
      segmentStartedAt: Date.now(),
      elapsedSeconds: 0,
      pausedSeconds: 0,
      running: true,
      lastPausedAt: null
    };
    setSessionUI("running");
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(updateSessionTimer, 500);
    updateSessionTimer();
  }
  function pauseSession() {
    if (!current || !current.running) return;
    const now = Date.now();
    current.elapsedSeconds += Math.floor((now-current.segmentStartedAt)/1000);
    current.running = false; current.lastPausedAt = now;
    updateSessionTimer(); setSessionUI("paused");
  }
  function finishSession() {
    if (!current) return;
    const now = Date.now();
    if (current.running) current.elapsedSeconds += Math.floor((now-current.segmentStartedAt)/1000);
    if (current.lastPausedAt) {
      current.pausedSeconds += Math.floor((now-current.lastPausedAt)/1000);
      current.lastPausedAt = null;
    }
    current.running = false;
    const record = {
      id: current.id, activity: current.activity, task: current.task,
      startedAt: current.startedAt, endedAt: new Date(now).toISOString(),
      durationSeconds: Math.max(0,current.elapsedSeconds), pausedSeconds: Math.max(0,current.pausedSeconds)
    };
    if (record.durationSeconds < 1) {
      showToast("That session was under a second, so it wasn't saved.");
    } else {
      sessions.push(record);
      saveSessions();
      showToast(`Saved session · ${fmtDuration(record.durationSeconds,true)}`);
    }
    current = null;
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    updateSessionTimer(); setSessionUI("ready"); refreshAll();
    $("taskInput").value = "";
  }
  function renderFullHistory(filterDate = "") {
    const el = $("fullHistory"); el.innerHTML = "";
    const sorted = [...sessions].sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt));
    const filtered = filterDate ? sorted.filter(s => dateKey(s.startedAt) === filterDate) : sorted;
    if (!filtered.length) { el.innerHTML = '<p class="empty-state">No saved sessions for this date yet.</p>'; return; }
    let lastDay = "";
    filtered.forEach(s => {
      const day = dateKey(s.startedAt);
      if (day !== lastDay) {
        const heading = document.createElement("div"); heading.className = "history-day-heading";
        heading.textContent = day === dateKey(new Date()) ? "TODAY" : new Date(s.startedAt).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric",year:"numeric"}).toUpperCase();
        el.append(heading); lastDay = day;
      }
      const row = document.createElement("div"); row.className = "history-detail";
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = s.task ? `${s.activity} · ${s.task}` : s.activity;
      const meta = document.createElement("small"); meta.textContent = `${humanTime(s.startedAt)} – ${humanTime(s.endedAt)}`;
      copy.append(title,meta);
      const duration = document.createElement("span"); duration.className = "duration"; duration.textContent = fmtDuration(sessionSeconds(s),true);
      row.append(copy,duration); el.append(row);
    });
  }
  function openHistory() {
    $("historyDate").value = dateKey(new Date());
    renderFullHistory($("historyDate").value);
    $("historyDialog").showModal();
  }
  function exportHistory() {
    const data = {format:"DevSpace backup", version:1, exportedAt:new Date().toISOString(), sessions, notes:$("notes").value};
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `devspace-backup-${dateKey(new Date())}.json`;
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast("Backup exported.");
  }
  async function importHistory(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.sessions)) throw new Error("Invalid backup");
      const valid = data.sessions.filter(s => s && typeof s.activity === "string" && typeof s.startedAt === "string" && typeof s.endedAt === "string" && Number.isFinite(Number(s.durationSeconds)) && !Number.isNaN(new Date(s.startedAt).getTime()) && !Number.isNaN(new Date(s.endedAt).getTime()));
      const map = new Map(sessions.map(s => [s.id || `${s.startedAt}|${s.activity}|${s.durationSeconds}`,s]));
      valid.forEach(s => map.set(s.id || `${s.startedAt}|${s.activity}|${s.durationSeconds}`, {...s,durationSeconds:Math.max(0,Number(s.durationSeconds))}));
      sessions = [...map.values()].sort((a,b) => new Date(a.startedAt)-new Date(b.startedAt));
      saveSessions();
      if (typeof data.notes === "string" && !$("notes").value.trim()) { $("notes").value=data.notes; localStorage.setItem(KEYS.notes,data.notes); }
      refreshAll(); renderFullHistory($("historyDate").value);
      showToast(`Imported ${valid.length} session(s).`);
    } catch { showToast("That file doesn't look like a DevSpace backup."); }
    finally { $("importInput").value = ""; }
  }
  function startFocus() {
    if (focusRunning) {
      focusRunning = false; clearInterval(focusHandle); focusHandle = null; $("focusStart").textContent = "Resume focus"; return;
    }
    if (focusRemaining <= 0) focusRemaining = 25*60;
    focusRunning = true; $("focusStart").textContent = "Pause focus";
    focusHandle = setInterval(() => {
      focusRemaining = Math.max(0,focusRemaining-1);
      updateFocus();
      if (focusRemaining === 0) {
        clearInterval(focusHandle); focusHandle = null; focusRunning = false;
        $("focusStart").textContent = "Start again"; $("focusHint").textContent = "25 minutes complete. Take a break if you need one.";
        showToast("Focus timer complete.");
      }
    },1000);
  }
  function updateFocus() {
    const m = Math.floor(focusRemaining/60), s = focusRemaining%60;
    $("focusDisplay").textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    $("focusProgress").style.width = `${(1-focusRemaining/(25*60))*100}%`;
  }
  function resetFocus() {
    clearInterval(focusHandle); focusHandle = null; focusRunning = false; focusRemaining = 25*60;
    $("focusStart").textContent = "Start focus"; $("focusHint").textContent = "Use this if it helps. No streaks or scores."; updateFocus();
  }

  $("startBtn").addEventListener("click", startSession);
  $("pauseBtn").addEventListener("click", pauseSession);
  $("finishBtn").addEventListener("click", finishSession);
  $("notes").value = loadJSON(KEYS.notes, "");
  $("notes").addEventListener("input", () => {
    try { localStorage.setItem(KEYS.notes, JSON.stringify($("notes").value)); $("notesSaved").textContent = "Saved on this device"; }
    catch { $("notesSaved").textContent = "Couldn't save"; }
  });
  // Notes are stored as JSON for safe consistent parsing.
  try {
    const raw = localStorage.getItem(KEYS.notes);
    if (raw) { const parsed = JSON.parse(raw); if (typeof parsed === "string") $("notes").value = parsed; }
  } catch {}
  $("viewHistoryBtn").addEventListener("click", openHistory);
  $("closeHistory").addEventListener("click", () => $("historyDialog").close());
  $("historyDate").addEventListener("change", () => renderFullHistory($("historyDate").value));
  $("allDatesBtn").addEventListener("click", () => { $("historyDate").value = ""; renderFullHistory(); });
  $("exportBtn").addEventListener("click", exportHistory);
  $("dialogExportBtn").addEventListener("click", exportHistory);
  $("importInput").addEventListener("change", (e) => importHistory(e.target.files[0]));
  $("clearHistoryBtn").addEventListener("click", () => {
    if (!sessions.length) { showToast("There is no history to clear."); return; }
    if (confirm("Delete all saved sessions from this browser? This cannot be undone unless you exported a backup.")) {
      sessions = []; saveSessions(); refreshAll(); renderFullHistory($("historyDate").value); showToast("Session history cleared.");
    }
  });
  $("focusStart").addEventListener("click", startFocus);
  $("focusReset").addEventListener("click", resetFocus);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstallPrompt = e; $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; $("installBtn").hidden = true;
  });

  updateClock(); setInterval(updateClock,1000); refreshAll(); setSessionUI("ready"); updateFocus();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();