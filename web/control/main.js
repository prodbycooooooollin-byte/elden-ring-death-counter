import { connect, on, action, getState } from "/shared/api.js";
import { h, run, isDialogOpen, toast } from "./ui.js";
import overview from "./views/overview.js";
import obs from "./views/overlay.js";
import bosses from "./views/bosses.js";
import save from "./views/save.js";
import settings from "./views/settings.js";
import { pickBoss } from "./views/pick-boss.js";

// Order follows what a streamer needs most during a stream.
const views = [overview, obs, bosses, save, settings];
const menu = document.getElementById("menu");
const content = document.getElementById("content");
const keys = document.getElementById("keys");
const el = (id) => document.getElementById(id);

let active = null;
let connected = false;
let lastTotal = null;

for (const [i, view] of views.entries()) {
  menu.append(h("a.menu-item", { href: `#${view.id}`, dataset: { view: view.id } }, view.title, h("span.menu-key", String(i + 1))));
}

function show(id) {
  const view = views.find((v) => v.id === id) || views[0];
  if (active === view) return;
  if (active && active.unmount) active.unmount();
  active = view;
  for (const item of menu.children) {
    if (item.dataset.view === view.id) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  const root = h("section.view");
  content.replaceChildren(root);
  view.mount(root);
  const state = getState();
  if (state) view.update(state);
  document.title = `${view.title} · Death Counter`;
}

window.addEventListener("hashchange", () => show(location.hash.slice(1)));

// ---------------------------------------------------------------- status strip

const FEED = {
  watching: ["live", "Liest Spielstand"],
  searching: ["warn", "Sucht Spielstand"],
  manual: ["warn", "Manuelle Zählung"],
  error: ["bad", "Lesefehler"],
  idle: ["", "Startet …"],
};

function time(seconds) {
  return new Date(seconds * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderStrip(state) {
  const s = state.save;
  const character = s.character;
  if (character) {
    el("who-name").textContent = character.name;
    el("who-meta").textContent = `Stufe ${character.level}, Slot ${character.slot}${s.slot_pinned ? ", fest gewählt" : ", automatisch erkannt"}`;
  } else {
    el("who-name").textContent = "Kein Charakter";
    el("who-meta").textContent = s.status === "error" ? "Spielstand nicht lesbar" : "Tode werden von Hand gezählt";
  }
  const total = state.counts.total;
  el("fig-total").textContent = total;
  if (lastTotal !== null && total > lastTotal) {
    el("fig-total").classList.remove("flare");
    void el("fig-total").offsetWidth;
    el("fig-total").classList.add("flare");
  }
  lastTotal = total;
  el("fig-session").textContent = state.counts.session;
  renderFeed(state);
}

function renderFeed(state) {
  const feed = el("feed");
  if (!connected) {
    feed.className = "feed bad";
    el("feed-text").textContent = "Server nicht erreichbar";
    el("feed-detail").textContent = "Läuft das Fenster des Counters noch?";
    return;
  }
  const s = state ? state.save : { status: "idle" };
  const [cls, text] = FEED[s.status] || FEED.idle;
  feed.className = `feed ${cls}`;
  el("feed-text").textContent = text;
  let detail = "";
  if (s.status === "watching") detail = s.updated ? `Zuletzt gelesen um ${time(s.updated)}` : "";
  else if (s.status === "error") detail = s.message;
  else if (s.status === "searching") detail = "Bis dahin zählst du von Hand";
  else if (s.status === "manual") detail = "Kein Spielstand verbunden";
  el("feed-detail").textContent = detail;
  el("feed-detail").title = detail;
}

on("connection", (ok) => {
  connected = ok;
  renderFeed(getState());
});

on("state", (state) => {
  renderStrip(state);
  if (active) active.update(state);
});

// ---------------------------------------------------------------- keyboard

const shortcuts = [
  { keys: ["Leertaste"], match: (e) => e.code === "Space" || e.key === "+", label: "Tod zählen", run: () => run(action("death_add")) },
  { keys: ["−"], match: (e) => e.key === "-" || e.key === "Backspace", label: "Einen abziehen", run: () => run(action("death_remove")) },
  { keys: ["F"], match: (e) => e.key.toLowerCase() === "f", label: "Gegner gefällt", run: felled },
  { keys: ["B"], match: (e) => e.key.toLowerCase() === "b", label: "Gegner wählen", run: () => pickBoss() },
];

async function felled() {
  const state = getState();
  if (!state || !state.current_boss) {
    toast("Wähle zuerst einen Gegner.", "error");
    return;
  }
  await run(action("boss_felled"));
}

keys.replaceChildren(
  ...shortcuts.map((s) => h("span", ...s.keys.map((k) => h("kbd", k)), s.label)),
  h("span", h("kbd", "1–5"), "Bereich"),
);

document.addEventListener("keydown", (event) => {
  if (isDialogOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target.closest && target.closest("input, textarea, select, [contenteditable]")) return;
  if (/^[1-5]$/.test(event.key)) {
    location.hash = views[Number(event.key) - 1].id;
    return;
  }
  if (event.code === "Space" && target.closest && target.closest("button, a, .picker")) return;
  const shortcut = shortcuts.find((s) => s.match(event));
  if (shortcut) {
    event.preventDefault();
    if (!event.repeat) shortcut.run();
  }
});

show(location.hash.slice(1) || "overview");
connect();
