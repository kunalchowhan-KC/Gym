// ============================================================
// Routine Tracker — data model & persistence
// ============================================================
//
// Data shape stored in localStorage under key "routine-tracker-data":
// {
//   habits: [ { id, name } ],
//   days: {
//     "YYYY-MM-DD": {
//       habits: { [habitId]: true },
//       exercises: [ { id, name, sets, reps, weight } ]
//     }
//   }
// }

const STORAGE_KEY = "routine-tracker-data";

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: [], days: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.habits) parsed.habits = [];
    if (!parsed.days) parsed.days = {};
    return parsed;
  } catch (e) {
    console.error("Failed to load data:", e);
    return { habits: [], days: {} };
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save data:", e);
    showSettingsStatus("Couldn't save — your browser storage may be full or disabled.", true);
  }
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

let state = loadData();
const TODAY = todayKey();

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
// Settings: export / import / reset
// ============================================================

const settingsStatusEl = document.getElementById("settings-status");

function showSettingsStatus(msg, isError = false) {
  settingsStatusEl.textContent = msg;
  settingsStatusEl.classList.toggle("error", isError);
}

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `routine-backup-${TODAY}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showSettingsStatus("Exported. Save this file somewhere safe, or open it on another device.");
});

const importInput = document.getElementById("import-file");
document.getElementById("import-btn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", () => {
  const file = importInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.habits || !parsed.days) throw new Error("Invalid file format");
      state = parsed;
      saveData();
      renderHabits();
      renderExercises();
      updateStreakPill();
      showSettingsStatus("Data imported successfully.");
    } catch (e) {
      showSettingsStatus("Couldn't read that file — make sure it's a Routine export.", true);
    }
  };
  reader.onerror = () => showSettingsStatus("Couldn't read that file.", true);
  reader.readAsText(file);
  importInput.value = "";
});

document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("This will permanently delete all habits, exercises, and history from this browser. Continue?")) return;
  state = { habits: [], days: {} };
  saveData();
  renderHabits();
  renderExercises();
  updateStreakPill();
  showSettingsStatus("All data cleared.");
});

// ============================================================
// Init
// ============================================================

renderHabits();
renderExercises();
updateStreakPill();
