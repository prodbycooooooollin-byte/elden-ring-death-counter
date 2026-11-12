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
const el = (id) => document.getElementById(id);

let active = null;
let connected = false;
let lastTotal = null;

// SF-Symbols-like line icons, drawn for this app.
const ICONS = {
  overview: '<path d="M4 12h3l2-6 4 12 2-6h5" />',
  obs: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  bosses: '<path d="M5 19 19 5M14 5h5v5M9 19H5v-4"/>',
  save: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
};

for (const [i, view] of views.entries()) {
  menu.append(h("a.nav-item", { href: `#${view.id}`, dataset: { view: view.id }, title: `${view.title} (${i + 1})` },
    h(`span.nav-icon.i-${view.id}`, { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[view.id]}</svg>` }),
    h("span", view.title)));
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
  watching: ["live", "Live"],
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
    el("who-meta").textContent = `Stufe ${character.level}, Slot ${character.slot}`;
  } else {
    el("who-name").textContent = "Kein Charakter";
    el("who-meta").textContent = s.status === "error" ? "Spielstand nicht lesbar" : "Zählung von Hand";
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
    feed.className = "now-feed bad";
    el("feed-text").textContent = "Server nicht erreichbar";
    el("feed-detail").textContent = "Läuft das Fenster des Counters noch?";
    return;
  }
  const s = state ? state.save : { status: "idle" };
  const [cls, text] = FEED[s.status] || FEED.idle;
  feed.className = `now-feed ${cls}`;
  el("feed-text").textContent = text;
  let detail = "";
  if (s.status === "watching") detail = s.updated ? `Spielstand gelesen um ${time(s.updated)}` : "";
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
