import { action, getState, serverNow } from "/shared/api.js";
import { formatDuration, deathsPerHour } from "/shared/i18n.js";
import { h, block, run, confirmDialog, clock, kbd, deathsWord, itemView } from "../ui.js";
import { pickBoss } from "./pick-boss.js";

let refs = null;
let timer = null;

function mount(root) {
  refs = {};
  refs.boss = h("div.encounter");
  refs.log = h("ul.log");
  refs.logCount = h("span");
  refs.rate = h("span");
  refs.time = h("span");
  refs.start = h("div");

  root.append(
    refs.start,
    h("div.cols",
      h("div",
        block("Zählen", h("span", "Session läuft seit ", refs.time, ", ", refs.rate),
          h("div.count-actions",
            h("button.btn.btn-main", { type: "button", onclick: () => run(action("death_add")) }, "Tod zählen", kbd("Leertaste")),
            h("button.btn", { type: "button", onclick: () => run(action("death_remove")) }, "Einen abziehen", kbd("−"))),
          h("p.hint", "Mit verbundenem Spielstand zählt der Counter von selbst. Die Knöpfe sind für Korrekturen und für die Zählung ohne Spielstand.")),
        block("Aktueller Gegner", null, refs.boss)),
      h("div",
        block("Chronik dieser Session", refs.logCount, refs.log),
        h("div.row", { style: { marginTop: "16px" } },
          h("button.btn", { type: "button", onclick: newSession }, "Neue Session starten")))),
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
  refs.time.textContent = formatDuration(now - state.session.started);
  const rate = deathsPerHour(state.counts.session, state.session.started, now);
  refs.rate.textContent = `${rate.toFixed(1).replace(".", ",")} Tode pro Stunde`;
}

function renderStart(state) {
  // Start and fault states get the item view so they cannot be missed.
  const s = state.save;
  let view = null;
  if (s.status === "searching") {
    view = itemView("Noch kein Spielstand gefunden",
      "Der Counter sucht im Ordner von Elden Ring und verbindet sich, sobald das Spiel zum ersten Mal gespeichert hat. Bis dahin kannst du von Hand zählen.");
  } else if (s.status === "error") {
    view = itemView("Spielstand gerade nicht lesbar",
      `${s.message} Der letzte Stand bleibt sichtbar, der Counter versucht es jede Sekunde erneut.`);
  }
  refs.start.replaceChildren(...(view ? [view] : []));
}

function renderBoss(state) {
  const boss = state.bosses.find((b) => b.id === state.current_boss);
  if (!boss) {
    refs.boss.replaceChildren(
      h("p.encounter-empty", "Kein Gegner gewählt. Wählst du einen, zählt jeder Tod zusätzlich für ihn."),
      h("div.row", h("button.btn", { type: "button", onclick: () => pickBoss() }, "Gegner wählen", kbd("B"))),
    );
    return;
  }
  refs.boss.replaceChildren(
    h("h3.encounter-name", boss.name),
    boss.region ? h("div.encounter-region", boss.region) : null,
    h("div.encounter-count", h("b.num", String(boss.deaths)), boss.deaths === 1 ? "Tod an diesem Gegner" : "Tode an diesem Gegner"),
    h("div.row",
      h("button.btn", { type: "button", onclick: () => run(action("boss_felled"), `${boss.name} gefällt`) },
        boss.great ? "Großer Feind gefällt" : "Feind gefällt", kbd("F")),
      h("button.btn", { type: "button", onclick: () => pickBoss() }, "Gegner wechseln", kbd("B"))),
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
    h("span.what",
      e.amount < 0 ? "Korrektur" : (e.boss || "Unterwegs"),
      h("span.src", e.source === "save" ? "Spielstand" : "von Hand")))));
}

function update(state) {
  if (!refs) return;
  renderStart(state);
  renderBoss(state);
  renderLog(state);
  tick();
}

function unmount() {
  clearInterval(timer);
  refs = null;
}

export default { id: "overview", title: "Stream", mount, update, unmount };
