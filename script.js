// ============================================================
// Routine Tracker — data model & persistence
// ============================================================
//
// Primary storage: routine-data.json file on the user's phone.
// Secondary: localStorage as a session cache so mid-session changes
// aren't lost if the page refreshes before Save is tapped.
//
// Flow:
//   App starts → show "Load file or start fresh" banner
//   User loads file → parse JSON → populate state → cache in localStorage
//   User taps Save → download routine-data.json → overwrite old file
//   localStorage is always written on every change as a safety net.

const STORAGE_KEY = "routine-tracker-data";
const FILE_NAME = "routine-data.json";

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyState() {
  return { habits: [], days: {} };
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.habits || !parsed.days) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
}

// saveData = always write to localStorage (session cache)
function saveData() {
  saveToLocalStorage();
}

// saveToFile = download routine-data.json to device
function saveToFile() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function applyLoadedData(parsed) {
  if (!parsed.habits) parsed.habits = [];
  if (!parsed.days) parsed.days = {};
  state = parsed;
  saveToLocalStorage();
  renderHabits();
  renderExercises();
  updateStreakPill();
}

function ensureDay(dateKey) {
  if (!state.days[dateKey]) {
    state.days[dateKey] = { habits: {}, exercises: [] };
  }
  return state.days[dateKey];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

let state = emptyState();
const TODAY = todayKey();

// ============================================================
// Standard routine — 5-day bro split (Mon–Fri), weekend rest
// ============================================================

const STANDARD_ROUTINE = [
  {
    day: "Monday",
    focus: "Chest",
    exercises: [
      { name: "Bench Press", sets: 4, reps: 8, weight: 0 },
      { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: 0 },
      { name: "Cable Fly", sets: 3, reps: 12, weight: 0 },
      { name: "Push-ups", sets: 3, reps: 15, weight: 0 },
    ],
  },
  {
    day: "Tuesday",
    focus: "Back",
    exercises: [
      { name: "Deadlift", sets: 4, reps: 6, weight: 0 },
      { name: "Lat Pulldown", sets: 3, reps: 10, weight: 0 },
      { name: "Barbell Row", sets: 3, reps: 10, weight: 0 },
      { name: "Face Pull", sets: 3, reps: 15, weight: 0 },
    ],
  },
  {
    day: "Wednesday",
    focus: "Legs",
    exercises: [
      { name: "Squat", sets: 4, reps: 8, weight: 0 },
      { name: "Leg Press", sets: 3, reps: 12, weight: 0 },
      { name: "Lunges", sets: 3, reps: 12, weight: 0 },
      { name: "Calf Raise", sets: 4, reps: 15, weight: 0 },
    ],
  },
  {
    day: "Thursday",
    focus: "Shoulders",
    exercises: [
      { name: "Overhead Press", sets: 4, reps: 8, weight: 0 },
      { name: "Lateral Raise", sets: 3, reps: 12, weight: 0 },
      { name: "Front Raise", sets: 3, reps: 12, weight: 0 },
      { name: "Shrugs", sets: 3, reps: 15, weight: 0 },
    ],
  },
  {
    day: "Friday",
    focus: "Arms",
    exercises: [
      { name: "Barbell Curl", sets: 3, reps: 10, weight: 0 },
      { name: "Tricep Pushdown", sets: 3, reps: 12, weight: 0 },
      { name: "Hammer Curl", sets: 3, reps: 10, weight: 0 },
      { name: "Skull Crushers", sets: 3, reps: 10, weight: 0 },
    ],
  },
  { day: "Saturday", focus: "Rest", exercises: [] },
  { day: "Sunday", focus: "Rest", exercises: [] },
];

// ============================================================
// Tabs
// ============================================================

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    panels.forEach(p => p.classList.remove("active"));

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.getElementById(tab.dataset.tab).classList.add("active");

    if (tab.dataset.tab === "history") renderHistory();
    if (tab.dataset.tab === "routine") renderRoutine();
  });
});

// ============================================================
// Today view
// ============================================================

const habitListEl = document.getElementById("habit-list");
const habitEmptyEl = document.getElementById("habit-empty");
const workoutTableEl = document.getElementById("workout-table");
const exerciseEmptyEl = document.getElementById("exercise-empty");
const streakPillEl = document.getElementById("streak-pill");
const todayDateEl = document.getElementById("today-date");

function formatDisplayDate(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

todayDateEl.textContent = formatDisplayDate(TODAY);

function renderHabits() {
  habitListEl.innerHTML = "";
  const day = ensureDay(TODAY);

  if (state.habits.length === 0) {
    habitEmptyEl.hidden = false;
  } else {
    habitEmptyEl.hidden = true;
  }

  state.habits.forEach(habit => {
    const done = !!day.habits[habit.id];

    const li = document.createElement("li");
    li.className = "habit-item" + (done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "habit-check";
    checkbox.checked = done;
    checkbox.id = `habit-check-${habit.id}`;
    checkbox.addEventListener("change", () => {
      day.habits[habit.id] = checkbox.checked;
      if (!checkbox.checked) delete day.habits[habit.id];
      saveData();
      li.classList.toggle("done", checkbox.checked);
      updateStreakPill();
    });

    const label = document.createElement("label");
    label.className = "habit-name";
    label.htmlFor = checkbox.id;
    label.textContent = habit.name;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.setAttribute("aria-label", `Remove habit ${habit.name}`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.habits = state.habits.filter(h => h.id !== habit.id);
      Object.values(state.days).forEach(d => delete d.habits[habit.id]);
      saveData();
      renderHabits();
      updateStreakPill();
    });

    li.append(checkbox, label, removeBtn);
    habitListEl.appendChild(li);
  });
}

function renderExercises() {
  // Clear all rows except the header
  workoutTableEl.querySelectorAll(".workout-row:not(.workout-row-head)").forEach(r => r.remove());

  const day = ensureDay(TODAY);
  exerciseEmptyEl.hidden = day.exercises.length !== 0;

  day.exercises.forEach(ex => {
    const row = document.createElement("div");
    row.className = "workout-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "workout-name";
    nameSpan.textContent = ex.name;

    const setsInput = makeNumberCell(ex.sets, val => { ex.sets = val; saveData(); });
    const repsInput = makeNumberCell(ex.reps, val => { ex.reps = val; saveData(); });
    const weightInput = makeNumberCell(ex.weight, val => { ex.weight = val; saveData(); }, 0.5);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.setAttribute("aria-label", `Remove ${ex.name}`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      day.exercises = day.exercises.filter(e => e.id !== ex.id);
      saveData();
      renderExercises();
    });

    row.append(nameSpan, setsInput, repsInput, weightInput, removeBtn);
    workoutTableEl.appendChild(row);
  });
}

function makeNumberCell(value, onChange, step = 1) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = String(step);
  input.value = value;
  input.addEventListener("change", () => {
    const num = parseFloat(input.value);
    onChange(isNaN(num) ? 0 : num);
  });
  return input;
}

function updateStreakPill() {
  const streak = computeStreak();
  streakPillEl.textContent = `🔥 ${streak} day${streak === 1 ? "" : "s"} streak`;
}

// A day "counts" toward the streak if at least one habit was completed
// (or if there are exercises logged, when no habits exist).
function dayCounts(dateKey) {
  const day = state.days[dateKey];
  if (!day) return false;
  const habitsDone = Object.values(day.habits || {}).filter(Boolean).length;
  if (state.habits.length > 0) return habitsDone > 0;
  return (day.exercises || []).length > 0;
}

function computeStreak() {
  let streak = 0;
  let cursor = new Date();
  // If today doesn't count yet, start checking from yesterday so an
  // unfinished today doesn't zero out an existing streak.
  if (!dayCounts(todayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dayCounts(todayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ============================================================
// Add Habit dialog
// ============================================================

const habitDialog = document.getElementById("habit-dialog");
const habitForm = document.getElementById("habit-form");

document.getElementById("add-habit-btn").addEventListener("click", () => {
  habitForm.reset();
  habitDialog.showModal();
  document.getElementById("habit-name").focus();
});

habitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("habit-name").value.trim();
  if (!name) return;
  state.habits.push({ id: uid(), name });
  saveData();
  renderHabits();
  updateStreakPill();
  habitDialog.close();
});

// ============================================================
// Add Exercise dialog
// ============================================================

const exerciseDialog = document.getElementById("exercise-dialog");
const exerciseForm = document.getElementById("exercise-form");

document.getElementById("add-exercise-btn").addEventListener("click", () => {
  exerciseForm.reset();
  document.getElementById("exercise-sets").value = 3;
  document.getElementById("exercise-reps").value = 10;
  document.getElementById("exercise-weight").value = 0;
  exerciseDialog.showModal();
  document.getElementById("exercise-name").focus();
});

exerciseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("exercise-name").value.trim();
  if (!name) return;
  const sets = parseFloat(document.getElementById("exercise-sets").value) || 0;
  const reps = parseFloat(document.getElementById("exercise-reps").value) || 0;
  const weight = parseFloat(document.getElementById("exercise-weight").value) || 0;

  const day = ensureDay(TODAY);
  day.exercises.push({ id: uid(), name, sets, reps, weight });
  saveData();
  renderExercises();
  exerciseDialog.close();
});

// Close dialogs via Cancel buttons
document.querySelectorAll("dialog [data-close]").forEach(btn => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});

// ============================================================
// Routine view
// ============================================================

const routineListEl = document.getElementById("routine-list");
const TODAY_DAY_NAME = new Date().toLocaleDateString(undefined, { weekday: "long" });

function renderRoutine() {
  routineListEl.innerHTML = "";

  STANDARD_ROUTINE.forEach(dayPlan => {
    const isRest = dayPlan.exercises.length === 0;
    const isToday = dayPlan.day === TODAY_DAY_NAME;

    const card = document.createElement("div");
    card.className = "routine-day" + (isRest ? " is-rest" : "");

    const head = document.createElement("div");
    head.className = "routine-day-head";

    const dayLabel = document.createElement("span");
    dayLabel.className = "routine-day-name";
    dayLabel.textContent = dayPlan.day + (isToday ? " · Today" : "");

    const focusLabel = document.createElement("span");
    focusLabel.className = "routine-day-focus";
    focusLabel.textContent = dayPlan.focus;

    head.append(dayLabel, focusLabel);
    card.appendChild(head);

    if (isRest) {
      const note = document.createElement("p");
      note.className = "subtle";
      note.style.margin = "8px 0 0";
      note.textContent = "Rest day. Recover, stretch, or take a walk.";
      card.appendChild(note);
    } else {
      const list = document.createElement("ul");
      list.className = "routine-exercise-list";
      dayPlan.exercises.forEach(ex => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = ex.name;
        const stat = document.createElement("span");
        stat.className = "stat";
        stat.textContent = `${ex.sets} × ${ex.reps}`;
        li.append(name, stat);
        list.appendChild(li);
      });
      card.appendChild(list);

      const logBtn = document.createElement("button");
      logBtn.className = "btn btn-primary";
      logBtn.textContent = "Log this workout";

      const status = document.createElement("span");
      status.className = "log-status";

      logBtn.addEventListener("click", () => {
        const day = ensureDay(TODAY);
        dayPlan.exercises.forEach(ex => {
          day.exercises.push({ id: uid(), name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight });
        });
        saveData();
        renderExercises();
        updateStreakPill();
        status.textContent = "Added to Today ✓";
        setTimeout(() => { status.textContent = ""; }, 2500);
      });

      const actions = document.createElement("div");
      actions.style.marginTop = "12px";
      actions.append(logBtn, status);
      card.appendChild(actions);
    }

    routineListEl.appendChild(card);
  });
}

// ============================================================
// History view
// ============================================================

const streakGridEl = document.getElementById("streak-grid");
const workoutHistoryEl = document.getElementById("workout-history");
const workoutHistoryEmptyEl = document.getElementById("workout-history-empty");

function renderHistory() {
  renderStreakGrid();
  renderWorkoutHistory();
}

function renderStreakGrid() {
  streakGridEl.innerHTML = "";

  const totalDays = 26 * 7; // ~6 months, 26 columns x 7 rows
  const today = new Date();

  // Build a list of date keys ending today, oldest first
  const dateKeys = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateKeys.push(todayKey(d));
  }

  // Column-major flow so weeks read top-to-bottom, left-to-right
  streakGridEl.style.gridAutoFlow = "column";

  dateKeys.forEach(dateKey => {
    const cell = document.createElement("div");
    const habitsDone = state.days[dateKey]
      ? Object.values(state.days[dateKey].habits || {}).filter(Boolean).length
      : 0;
    const totalHabits = state.habits.length;

    let level = 0;
    if (totalHabits === 0) {
      const hasWorkout = state.days[dateKey] && (state.days[dateKey].exercises || []).length > 0;
      level = hasWorkout ? 4 : 0;
    } else {
      const ratio = habitsDone / totalHabits;
      if (ratio === 0) level = 0;
      else if (ratio < 0.4) level = 1;
      else if (ratio < 0.7) level = 2;
      else if (ratio < 1) level = 3;
      else level = 4;
    }

    cell.className = `streak-cell l${level}`;
    cell.title = `${dateKey}${totalHabits > 0 ? ` — ${habitsDone}/${totalHabits} habits` : ""}`;
    streakGridEl.appendChild(cell);
  });
}

function renderWorkoutHistory() {
  workoutHistoryEl.innerHTML = "";

  const days = Object.keys(state.days)
    .filter(key => (state.days[key].exercises || []).length > 0)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 30);

  workoutHistoryEmptyEl.hidden = days.length !== 0;

  days.forEach(dateKey => {
    const dayData = state.days[dateKey];
    const card = document.createElement("div");
    card.className = "history-day";

    const dateEl = document.createElement("div");
    dateEl.className = "history-day-date";
    dateEl.textContent = formatDisplayDate(dateKey);
    card.appendChild(dateEl);

    dayData.exercises.forEach(ex => {
      const row = document.createElement("div");
      row.className = "history-day-row";

      const name = document.createElement("span");
      name.textContent = ex.name;

      const stat = document.createElement("span");
      stat.className = "stat";
      stat.textContent = `${ex.sets} × ${ex.reps}${ex.weight ? ` @ ${ex.weight}kg` : ""}`;

      row.append(name, stat);
      card.appendChild(row);
    });

    workoutHistoryEl.appendChild(card);
  });
}

// ============================================================
// Settings: save to file / load from file / reset
// ============================================================

const settingsStatusEl = document.getElementById("settings-status");

function showSettingsStatus(msg, isError = false) {
  settingsStatusEl.textContent = msg;
  settingsStatusEl.classList.toggle("error", isError);
}

// Save button in settings (same as FAB)
document.getElementById("export-btn").addEventListener("click", () => {
  saveToFile();
  showSettingsStatus("File saved! Replace the old routine-data.json on your phone with this one.");
});

// Load button in settings
const importInput = document.getElementById("import-file");
document.getElementById("import-btn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", () => {
  const file = importInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.habits || !parsed.days) throw new Error("bad format");
      applyLoadedData(parsed);
      showSettingsStatus("Data loaded successfully.");
    } catch {
      showSettingsStatus("Couldn't read that file — make sure it's a Routine export.", true);
    }
  };
  reader.onerror = () => showSettingsStatus("Couldn't read the file.", true);
  reader.readAsText(file);
  importInput.value = "";
});

document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Delete all habits, exercises, and history from this session? (Your saved file won't be affected.)")) return;
  state = emptyState();
  saveData();
  renderHabits();
  renderExercises();
  updateStreakPill();
  showSettingsStatus("Session cleared. Load your file to restore.");
});

// ============================================================
// Floating save button (Today tab)
// ============================================================

const fabSaveBtn = document.getElementById("fab-save");
const fabHintEl = document.getElementById("fab-hint");

fabSaveBtn.addEventListener("click", () => {
  saveToFile();
  fabHintEl.textContent = "Saved! Replace routine-data.json on your phone with this file.";
  fabHintEl.classList.remove("error");
  setTimeout(() => { fabHintEl.textContent = ""; }, 4000);
});

// ============================================================
// Startup: load banner
// ============================================================

const loadBanner = document.getElementById("load-banner");
const loadFileBtn = document.getElementById("load-file-btn");
const loadSkipBtn = document.getElementById("load-skip-btn");
const loadFileInput = document.getElementById("load-file-input");

function dismissBanner() {
  loadBanner.classList.add("hidden");
}

loadFileBtn.addEventListener("click", () => loadFileInput.click());

loadFileInput.addEventListener("change", () => {
  const file = loadFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.habits || !parsed.days) throw new Error("bad format");
      applyLoadedData(parsed);
      dismissBanner();
      fabHintEl.textContent = "Data loaded from file ✓";
      setTimeout(() => { fabHintEl.textContent = ""; }, 3000);
    } catch {
      alert("Couldn't read that file. Make sure it's your routine-data.json file.");
    }
  };
  reader.onerror = () => alert("Couldn't read the file.");
  reader.readAsText(file);
  loadFileInput.value = "";
});

loadSkipBtn.addEventListener("click", () => {
  // Check if there's a cached session in localStorage to restore silently
  const cached = loadFromLocalStorage();
  if (cached) {
    applyLoadedData(cached);
    fabHintEl.textContent = "Session restored from last time.";
    setTimeout(() => { fabHintEl.textContent = ""; }, 3000);
  }
  dismissBanner();
});

// ============================================================
// Init — show banner every time (file is the source of truth)
// ============================================================

renderHabits();
renderExercises();
updateStreakPill();
// Show the load banner on every startup so user is always reminded to load their file
loadBanner.classList.remove("hidden");
