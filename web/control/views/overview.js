import { action, getState, serverNow } from "/shared/api.js";
import { formatDuration, deathsPerHour } from "/shared/i18n.js";
import { h, block, viewHead, run, confirmDialog, clock, kbd, deathsWord, itemView } from "../ui.js";
import { pickBoss } from "./pick-boss.js";

let refs = null;
let timer = null;
let lastTotal = null;

function mount(root) {
  refs = {};
  refs.total = h("b.num", "0");
  refs.session = h("b.num", "0");
  refs.start = h("div");
  refs.boss = h("div");
  refs.log = h("ul.log");
  refs.logCount = h("span");
  refs.time = h("span");

  root.append(
    viewHead("Stream"),
    refs.start,
    h("section.hero",
      h("img.hero-emblem", { src: "/assets/icon.png", alt: "", width: 96, height: 96, onerror: (e) => { e.target.src = "/game/death-blight.png"; e.target.onerror = () => e.target.remove(); } }),
      h("div.hero-figures",
        h("div.hero-figure", h("span", "Tode gesamt"), refs.total),
        h("div.hero-figure.small", h("span", "Diese Session"), refs.session)),
      h("div.hero-actions",
        h("button.btn.btn-main", { type: "button", onclick: () => run(action("death_add")) }, "Tod zählen", kbd("Leertaste")),
        h("button.btn", { type: "button", onclick: () => run(action("death_remove")) }, "Einen abziehen", kbd("−")))),
    h("div.cols",
      h("div",
        block("Aktueller Gegner", null, refs.boss),
        block(null, null,
          h("div.field", h("div.label", h("span", "Session läuft seit"), h("small", "Tode pro Stunde werden daraus berechnet")), h("div.control", refs.time)),
          h("div.row", h("button.btn", { type: "button", onclick: newSession }, "Neue Session starten")))),
      h("div", block("Chronik dieser Session", refs.logCount, refs.log))),
  );
  timer = setInterval(tick, 1000);
}

async function newSession() {
  const ok = await confirmDialog("Neue Session starten? Sessionzähler und Chronik beginnen bei null. Gesamtstand und Bosse bleiben.", "Neue Session", "Abbrechen");
  if (ok) run(action("session_new"), "Neue Session gestartet");
}

function tick() {
  const state = getState();
  if (!state || !refs) return;
  const now = serverNow();
  const rate = deathsPerHour(state.counts.session, state.session.started, now);
  refs.time.textContent = `${formatDuration(now - state.session.started)}  ·  ${rate.toFixed(1).replace(".", ",")} pro Stunde`;
}

function renderStart(state) {
  const s = state.save;
  let view = null;
  if (s.status === "searching") {
    view = itemView("Noch kein Spielstand gefunden",
      "Der Counter sucht im Ordner von Elden Ring und verbindet sich, sobald das Spiel zum ersten Mal gespeichert hat. Bis dahin zählst du von Hand.");
  } else if (s.status === "error") {
    view = itemView("Spielstand gerade nicht lesbar", `${s.message} Der letzte Stand bleibt sichtbar, der Counter versucht es jede Sekunde erneut.`);
    view.classList.add("bad");
  }
  refs.start.replaceChildren(...(view ? [view] : []));
}

function renderBoss(state) {
  const boss = state.bosses.find((b) => b.id === state.current_boss);
  if (!boss) {
    refs.boss.replaceChildren(
      h("div.encounter-empty", "Kein Gegner gewählt. Mit Gegner zählt jeder Tod zusätzlich für ihn."),
      h("div.row", h("button.btn", { type: "button", onclick: () => pickBoss() }, "Gegner wählen", kbd("B"))));
    return;
  }
  refs.boss.replaceChildren(
    h("div.encounter",
      h("div", h("div.encounter-name", boss.name), boss.region ? h("div.encounter-region", boss.region) : null),
      h("div.encounter-count.num", String(boss.deaths), h("small", boss.deaths === 1 ? "Tod" : "Tode"))),
    h("div.row",
      h("button.btn", { type: "button", onclick: () => run(action("boss_felled"), `${boss.name} gefällt`) },
        boss.great ? "Großer Feind gefällt" : "Feind gefällt", kbd("F")),
      h("button.btn", { type: "button", onclick: () => pickBoss() }, "Wechseln", kbd("B"))),
  );
}

function renderLog(state) {
  const entries = state.session.log.slice().reverse();
  const deaths = state.counts.session;
  refs.logCount.textContent = `${deaths} ${deathsWord(deaths)}`;
  if (!entries.length) {
    refs.log.replaceChildren(h("li.empty", "Noch kein Tod in dieser Session."));
    return;
  }
  refs.log.replaceChildren(...entries.map((e) => h("li",
    h("time", clock(e.t)),
    h(`span.amt${e.amount < 0 ? ".neg" : ""}`, e.amount > 0 ? `+${e.amount}` : `−${-e.amount}`),
    h("span.what", e.amount < 0 ? "Korrektur" : (e.boss || "Unterwegs")),
    h("span.src", e.source === "save" ? "Spielstand" : "von Hand"))));
}

function update(state) {
  if (!refs) return;
  const total = state.counts.total;
  refs.total.textContent = String(total);
  if (lastTotal !== null && total > lastTotal) {
    refs.total.classList.remove("flare");
    void refs.total.offsetWidth;
    refs.total.classList.add("flare");
  }
  lastTotal = total;
  refs.session.textContent = String(state.counts.session);
  renderStart(state);
  renderBoss(state);
  renderLog(state);
  tick();
}

function unmount() {
  clearInterval(timer);
  refs = null;
  lastTotal = null;
}

export default { id: "overview", title: "Stream", mount, update, unmount };
