import { action, saveSettings, uploadLogo, removeLogo } from "/shared/api.js";
import { h, viewHead, block, run, picker, onOff, slider, field, copy, confirmDialog } from "../ui.js";

let controls = [];
let refs = null;

function bind(control, read) {
  controls.push({ control, read });
  return control;
}

function quickRow(label, path) {
  const url = `${location.origin}/api/quick/${path}`;
  return h("div.url",
    h("span.url-label", label),
    h("input", { type: "text", value: url, readOnly: true, "aria-label": label, onfocus: (e) => e.target.select() }),
    h("button.btn", { type: "button", onclick: () => copy(url) }, "Kopieren"));
}

function mount(root) {
  controls = [];
  refs = {};
  refs.logo = h("div.logo-box");
  refs.update = h("div");
  refs.game = h("div");
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true });
  file.addEventListener("change", async () => {
    if (file.files[0]) await run(uploadLogo(file.files[0]), "Logo hochgeladen");
    file.value = "";
  });
  refs.file = file;

  root.append(
    viewHead("Einstellungen"),
    refs.game,
    block("Updates", null, refs.update),
    block("Overlay", null,
      field("Sprache", bind(picker({ label: "Sprache des Overlays", options: [["de", "Deutsch"], ["en", "English"]], onChange: (v) => run(saveSettings({ language: v })) }), (s) => s.settings.language), "Für alle Texte, die Zuschauer sehen"),
      field("Eigenes Logo", h("div", refs.logo, file), "PNG mit durchsichtigem Hintergrund. Ersetzt im Overlay das Spiel-Icon.")),
    block("Ton", null,
      field("Klänge im Overlay", bind(picker({ label: "Klänge", options: onOff, onChange: (v) => run(saveSettings({ sound: { enabled: v } })) }), (s) => s.settings.sound.enabled), "Standardmäßig aus"),
      field("Lautstärke", bind(slider({ min: 0, max: 100, step: 5, label: "Lautstärke", format: (v) => `${v} %`, onChange: (v) => run(saveSettings({ sound: { volume: v } })) }), (s) => s.settings.sound.volume))),
    block("Session", null,
      field("Beim Start neu beginnen", bind(picker({ label: "Session beim Start neu beginnen", options: onOff, onChange: (v) => run(saveSettings({ session: { reset_on_start: v } })) }), (s) => s.settings.session.reset_on_start), "Aus: Session und Chronik laufen nach einem Neustart weiter")),
    block("Stream Deck und Bots", null,
      h("p.hint", "Diese Adressen lösen eine Aktion aus, sobald sie aufgerufen werden. Beim Stream Deck die Aktion „Website“ nehmen und „Im Hintergrund abrufen“ aktivieren."),
      quickRow("Tod zählen", "add"),
      quickRow("Einen abziehen", "undo"),
      quickRow("Gegner gefällt", "felled"),
      quickRow("Neue Session", "session")),
    block("Programm", null,
      h("p.hint", "Schließt du dieses Fenster, läuft der Counter weiter, solange OBS das Overlay zeigt, und beendet sich danach von selbst. Hier beendest du ihn sofort."),
      h("div.row", h("button.btn", { type: "button", onclick: quit }, "Death Counter beenden"))),
    block("Zurücksetzen", null,
      h("div.row", { style: { marginTop: "12px" } }, h("button.btn.btn-danger", { type: "button", onclick: resetSettings }, "Alle Einstellungen zurücksetzen")),
      h("p.hint", "Zähler, Bosse und Spielstand bleiben unverändert.")),
  );
}

async function quit() {
  if (await confirmDialog("Death Counter beenden? Das Overlay in OBS zeigt dann keine Tode mehr an.", "Beenden")) {
    await run(action("quit"), "Death Counter wird beendet");
  }
}

async function resetSettings() {
  if (await confirmDialog("Alle Einstellungen auf den Ausgangszustand setzen?", "Zurücksetzen")) run(action("settings_reset"), "Einstellungen zurückgesetzt");
}

async function install(u) {
  if (await confirmDialog(`Version ${u.latest} jetzt installieren? Der Counter startet danach neu. Zähler, Bosse und Einstellungen bleiben erhalten.`, "Installieren")) {
    run(action("update_install"), "Update wird installiert …");
  }
}

function renderUpdate(u) {
  if (!u) {
    refs.update.replaceChildren(h("p.hint", "Updates sind in dieser Installation nicht verfügbar."));
    return;
  }
  const rows = [field("Installierte Version", h("span.num", u.current))];
  if (u.status === "checking") rows.push(h("p.hint", "Suche nach Updates …"));
  else if (u.status === "installing") rows.push(h("p.hint", "Update wird installiert. Der Counter startet gleich neu."));
  else if (u.status === "error") rows.push(h("p.hint", `Update-Prüfung fehlgeschlagen: ${u.message}`));
  else if (u.available) {
    rows.push(field(`Version ${u.latest} verfügbar`,
      h("div.row", h("button.btn", { type: "button", onclick: () => install(u) }, "Jetzt installieren"),
        u.url ? h("a", { href: u.url, target: "_blank", rel: "noreferrer" }, "Was ist neu") : null)));
  } else if (u.latest) rows.push(h("p.hint", "Du hast die neueste Version."));
  rows.push(field("Automatisch installieren", bind(picker({ label: "Updates automatisch installieren", options: onOff, onChange: (v) => run(saveSettings({ updates: { auto_install: v } })) }), (s) => s.settings.updates.auto_install), "Neue Versionen beim Start ohne Nachfrage einspielen"));
  rows.push(h("div.row", { style: { marginTop: "10px" } }, h("button.btn", { type: "button", onclick: () => run(action("update_check")) }, "Jetzt prüfen")));
  refs.update.replaceChildren(...rows);
}

function update(state) {
  if (!refs) return;
  const key = JSON.stringify(state.update || null);
  if (refs.updateKey !== key) {
    refs.updateKey = key;
    controls = controls.filter((c) => refs.update.contains(c.control) === false);
    renderUpdate(state.update);
  }
  for (const { control, read } of controls) control.set(read(state));
  const missing = state.game_assets_missing || [];
  if (refs.gameKey !== missing.join()) {
    refs.gameKey = missing.join();
    refs.game.replaceChildren(...(missing.length ? [block("Spiel-Icons fehlen", null,
      h("p.hint", "Overlay und Pult nutzen zwei Original-Icons aus Elden Ring: das Statussymbol Todesfäule und den Talisman Opferzweig. Sie gehören FromSoftware und Bandai Namco und liegen deshalb nicht im Download. Der Knopf lädt sie einmalig von eldenring.wiki.gg in den Ordner assets/game."),
      h("div.row", h("button.btn", { type: "button", onclick: () => run(action("game_assets_fetch"), "Spiel-Icons geladen") }, "Spiel-Icons laden")))] : []));
  }
  const url = state.logo && state.logo.url;
  if (refs.logoUrl !== url) {
    refs.logoUrl = url;
    refs.logo.replaceChildren(
      url ? h("img", { src: url, alt: "Eigenes Logo" }) : h("div.ph", "Kein Logo"),
      h("div.row",
        h("button.btn", { type: "button", onclick: () => refs.file.click() }, url ? "Ersetzen" : "Bild wählen"),
        url ? h("button.btn.btn-quiet.btn-danger", { type: "button", onclick: () => run(removeLogo(), "Logo entfernt") }, "Entfernen") : null));
  }
}

function unmount() {
  controls = [];
  refs = null;
}

export default { id: "settings", title: "Einstellungen", mount, update, unmount };
