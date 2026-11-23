const MAX = 12;
const KEY = "dozen.tasks.v1";

let tasks = load();
let today = new Date();
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = iso(today);

const $ = (id) => document.getElementById(id);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {}
}
function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
const forDay = (date) => tasks.filter((t) => t.date === date);

function renderCalendar() {
  $("monthLabel").textContent = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const grid = $("grid");
  grid.innerHTML = "";
  const first = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

  for (let i = 0; i < first; i++) {
    const b = document.createElement("button");
    b.className = "cell blank";
    b.tabIndex = -1;
    grid.appendChild(b);
  }
  for (let d = 1; d <= days; d++) {
    const date = iso(new Date(view.getFullYear(), view.getMonth(), d));
    const list = forDay(date);
    const allDone = list.length > 0 && list.every((t) => t.done);
    const b = document.createElement("button");
    b.className = "cell" + (date === iso(today) ? " today" : "") + (date === selected ? " sel" : "");
    b.innerHTML = `<span>${d}</span><span class="pip">${
      list.slice(0, 4).map(() => `<i class="${allDone ? "all" : ""}"></i>`).join("")
    }</span>`;
    b.setAttribute("aria-label", `${date}, ${list.length} tasks`);
    b.onclick = () => { selected = date; render(); };
    grid.appendChild(b);
  }
}

function renderDay() {
  const d = new Date(selected + "T00:00:00");
  $("dayLabel").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const list = forDay(selected).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const doneCount = list.filter((t) => t.done).length;
  $("dots").innerHTML = Array.from({ length: MAX }, (_, i) =>
    `<i class="${i < doneCount ? "done" : i < list.length ? "used" : ""}"></i>`).join("");
  $("count").textContent = `${doneCount} done · ${list.length} of ${MAX} planned`;

  const ul = $("list");
  ul.innerHTML = "";
  list.forEach((t) => {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    li.innerHTML = `<input type="checkbox" ${t.done ? "checked" : ""} aria-label="Mark done">
      <span class="t"></span><span class="when">${t.time || ""}</span>
      <button aria-label="Delete task">&times;</button>`;
    li.querySelector(".t").textContent = t.text; // textContent keeps user input safe
    li.querySelector("input").onchange = () => { t.done = !t.done; save(); render(); };
    li.querySelector("button").onclick = () => { tasks = tasks.filter((x) => x.id !== t.id); save(); render(); };
    ul.appendChild(li);
  });
  $("empty").hidden = list.length > 0;
}

function render() { renderCalendar(); renderDay(); }

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  if (forDay(selected).length >= MAX) {
    $("msg").textContent = "That's a full dozen for this day. Finish or delete one, or pick another day.";
    return;
  }
  $("msg").textContent = "";
  tasks.push({ id: Date.now(), text, date: selected, time: $("time").value, done: false, notified: false });
  save();
  if (tasks.some((t) => t.time) && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  $("text").value = "";
  $("time").value = "";
  render();
});

$("prev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCalendar(); };
$("next").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCalendar(); };
$("today").onclick = () => {
  today = new Date();
  selected = iso(today);
  view = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
};

// Reminders: checks every 20s while the tab is open
setInterval(() => {
  const now = new Date();
  const date = iso(now);
  const hhmm = now.toTimeString().slice(0, 5);
  tasks.forEach((t) => {
    if (!t.done && !t.notified && t.date === date && t.time && t.time <= hhmm) {
      t.notified = true;
      save();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Dozen reminder", { body: t.text });
      } else {
        alert("Reminder: " + t.text);
      }
    }
  });
}, 20000);

render();
