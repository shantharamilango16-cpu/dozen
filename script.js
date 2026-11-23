// 1) Paste your two values from Supabase (Project Settings -> API)
const SUPABASE_URL = "https://amdagpndkhpbfruocljg.supabase.co";
const SUPABASE_KEY = "sb_publishable_lOyPMmNw_rQl5KQnK7iztA_HDkgkWC8";

const MAX = 12;
const CATS = { Work: "#4c6ef5", Home: "#f2b705", Study: "#9c5fd6", Personal: "#3f8f6b" };

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let tasks = [];
let user = null;
let filter = "All";
let channel = null;
let today = new Date();
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = iso(today);
const notified = new Set();

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
const forDay = (date) => tasks.filter((t) => t.date === date);

/* ---------- auth ---------- */
async function credentials(e) {
  e && e.preventDefault();
  return { email: $("aEmail").value.trim(), password: $("aPass").value };
}
$("authForm").addEventListener("submit", async (e) => {
  const { error } = await db.auth.signInWithPassword(await credentials(e));
  $("authMsg").textContent = error ? "Could not sign in: " + error.message : "";
});
$("signup").onclick = async () => {
  const { data, error } = await db.auth.signUp(await credentials());
  if (error) $("authMsg").textContent = "Could not create account: " + error.message;
  else if (!data.session) $("authMsg").textContent = "Account created. Check your email to confirm, then sign in.";
};
$("signout").onclick = () => db.auth.signOut();

db.auth.onAuthStateChange((_event, session) => {
  user = session ? session.user : null;
  $("auth").hidden = !!user;
  $("app").hidden = !user;
  $("who").hidden = !user;
  if (user) {
    $("email").textContent = user.email;
    startSync();
  } else {
    tasks = [];
    if (channel) { db.removeChannel(channel); channel = null; }
  }
});

/* ---------- data ---------- */
async function loadTasks() {
  const { data, error } = await db.from("tasks").select("*").order("created_at");
  if (error) { $("msg").textContent = "Could not load tasks: " + error.message; return; }
  tasks = data;
  render();
}
function startSync() {
  loadTasks();
  if (channel) return;
  // live updates when another device changes something
  channel = db.channel("tasks-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadTasks)
    .subscribe();
}
document.addEventListener("visibilitychange", () => { if (user && !document.hidden) loadTasks(); });

/* ---------- render ---------- */
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
      list.slice(0, 4).map(() => `<i class="${allDone ? "all" : ""}"></i>`).join("")}</span>`;
    b.setAttribute("aria-label", `${date}, ${list.length} tasks`);
    b.onclick = () => { selected = date; render(); };
    grid.appendChild(b);
  }
}

function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  ["All", ...Object.keys(CATS)].forEach((name) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(filter === name));
    b.innerHTML = (CATS[name] ? `<i style="background:${CATS[name]}"></i>` : "") + name;
    b.onclick = () => { filter = name; renderDay(); };
    box.appendChild(b);
  });
}

function renderDay() {
  const d = new Date(selected + "T00:00:00");
  $("dayLabel").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const all = forDay(selected);
  const list = all
    .filter((t) => filter === "All" || t.category === filter)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const doneCount = all.filter((t) => t.done).length;
  $("dots").innerHTML = Array.from({ length: MAX }, (_, i) =>
    `<i class="${i < doneCount ? "done" : i < all.length ? "used" : ""}"></i>`).join("");
  $("count").textContent = `${doneCount} done · ${all.length} of ${MAX} planned`;
  renderChips();

  const ul = $("list");
  ul.innerHTML = "";
  list.forEach((t) => {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    li.innerHTML = `<input type="checkbox" ${t.done ? "checked" : ""} aria-label="Mark done">
      <span class="cat" title="${t.category}" style="background:${CATS[t.category] || "#999"}"></span>
      <span class="t"></span><span class="when">${t.time || ""}</span>
      <button aria-label="Delete task">&times;</button>`;
    li.querySelector(".t").textContent = t.text;
    li.querySelector("input").onchange = async () => {
      await db.from("tasks").update({ done: !t.done }).eq("id", t.id);
      loadTasks();
    };
    li.querySelector("button").onclick = async () => {
      await db.from("tasks").delete().eq("id", t.id);
      loadTasks();
    };
    ul.appendChild(li);
  });
  $("empty").hidden = list.length > 0;
}
function render() { renderCalendar(); renderDay(); }

/* ---------- add task ---------- */
$("cat").innerHTML = Object.keys(CATS).map((c) => `<option>${c}</option>`).join("");

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  if (forDay(selected).length >= MAX) {
    $("msg").textContent = "That's a full dozen for this day. Finish or delete one, or pick another day.";
    return;
  }
  $("msg").textContent = "";
  const { error } = await db.from("tasks").insert({
    text, date: selected, time: $("time").value || null, category: $("cat").value,
  });
  if (error) { $("msg").textContent = "Could not save: " + error.message; return; }
  if ($("time").value && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  $("text").value = "";
  $("time").value = "";
  loadTasks();
});

/* ---------- calendar nav ---------- */
$("prev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCalendar(); };
$("next").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCalendar(); };
$("today").onclick = () => {
  today = new Date();
  selected = iso(today);
  view = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
};

/* ---------- reminders (tab must be open) ---------- */
setInterval(() => {
  const now = new Date();
  const date = iso(now);
  const hhmm = now.toTimeString().slice(0, 5);
  tasks.forEach((t) => {
    const time = t.time ? t.time.slice(0, 5) : "";
    if (!t.done && time && t.date === date && time <= hhmm && !notified.has(t.id)) {
      notified.add(t.id);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Dozen reminder", { body: t.text });
      } else {
        alert("Reminder: " + t.text);
      }
    }
  });
}, 20000);
