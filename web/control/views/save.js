import { action } from "/shared/api.js";
import { h, viewHead, block, run, field, playtime, confirmDialog } from "../ui.js";

let refs = null;

const STATUS = {
  watching: ["live", "Spielstand verbunden", "Neue Tode erscheinen, sobald Elden Ring speichert. Das passiert meist wenige Sekunden nach dem Tod."],
  searching: ["warn", "Suche läuft", "Noch kein Spielstand im Ordner von Elden Ring. Der Counter verbindet sich von selbst, sobald das Spiel gespeichert hat."],
  manual: ["warn", "Manuelle Zählung", "Du hast die automatische Suche ausgeschaltet. Zähle mit der Leertaste oder einem Stream-Deck-Knopf."],
  error: ["bad", "Spielstand nicht lesbar", ""],
  idle: ["", "Startet …", ""],
};

function mount(root) {
  refs = {};
  refs.notice = h("div.notice");
  refs.mode = h("div");
  refs.path = h("input", { type: "text", autocomplete: "off", spellcheck: "false", name: "save-path", placeholder: "…\\AppData\\Roaming\\EldenRing\\<Steam-ID>\\ER0000.sl2", "aria-label": "Pfad zum Spielstand" });
  refs.found = h("ul.found");
  refs.slots = h("ul.slots");
  refs.slotMode = h("span");
  refs.total = h("input", { type: "number", min: 0, max: 999999, "aria-label": "Gesamtstand", style: { width: "150px" } });

  const applyPath = (event) => {
    event.preventDefault();
    if (!refs.path.value.trim()) return;
    run(action("save_set", { path: refs.path.value }), "Spielstand übernommen");
  };
  const setTotal = async (event) => {
    event.preventDefault();
    const value = Number(refs.total.value);
    if (await confirmDialog(`Gesamtstand auf ${value} setzen?`, "Setzen")) run(action("set_total", { value }), "Gesamtstand gesetzt");
  };

  root.append(
    viewHead("Spielstand", "Elden Ring speichert für jeden Charakter, wie oft er gestorben ist. Der Counter liest diese Zahl aus deinem Spielstand und verändert die Datei nie."),
    refs.notice,
    block("Charakter", refs.slotMode, refs.slots,
      h("p.hint", "Der Counter erkennt selbst, welchen Charakter du spielst: Nur dessen Spielzeit läuft weiter. Wählst du einen Charakter fest, bleibt er dabei.")),
    block("Spielstanddatei", null, refs.mode,
      h("form.url", { onsubmit: applyPath, style: { gridTemplateColumns: "minmax(0, 1fr) auto" } },
        refs.path, h("button.btn", { type: "submit" }, "Diese Datei nutzen")),
      refs.found),
    block("Gesamtstand korrigieren", null,
      h("p.hint", "Nur für die Zählung ohne Spielstand nötig, etwa wenn du vorher schon gestorben bist. Mit Spielstand verschiebt das die Anzeige, neue Tode zählen weiter."),
      field("Gesamtstand", h("form.row", { onsubmit: setTotal }, refs.total, h("button.btn", { type: "submit" }, "Setzen")))),
  );
}

function update(state) {
  if (!refs) return;
  const save = state.save;
  const [cls, title, text] = STATUS[save.status] || STATUS.idle;
  refs.notice.className = `notice ${cls}`;
  refs.notice.replaceChildren(h("h3", title), h("p", save.status === "error" ? `${save.message} Der letzte Stand bleibt sichtbar.` : text));

  refs.mode.replaceChildren(
    save.auto
      ? h("p.hint", "Automatisch: Der Counter nimmt den zuletzt gespeicherten Spielstand aus ", h("code", "%APPDATA%\\EldenRing"), ". Seamless Coop (ER0000.co2) wird mit erkannt.")
      : h("div.row", { style: { margin: "10px 0 14px" } },
        h("span", { style: { color: "var(--text-dim)" } }, save.path ? "Fest gewählte Datei." : "Ohne Spielstand."),
        h("button.btn", { type: "button", onclick: () => run(action("save_auto"), "Automatische Suche an") }, "Automatisch suchen")),
  );
  if (document.activeElement !== refs.path) refs.path.value = save.path || "";
  if (document.activeElement !== refs.total) refs.total.value = state.counts.total;

  const others = save.found.filter((p) => p !== save.path);
  refs.found.replaceChildren(
    ...others.map((p) => h("li", h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("save_set", { path: p }), "Spielstand übernommen") }, `Andere gefundene Datei: ${p}`))),
    save.path ? h("li", h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("save_set", { path: "" }), "Manuelle Zählung aktiv") }, "Ohne Spielstand von Hand zählen")) : null,
  );

  refs.slotMode.replaceChildren(save.slot_pinned
    ? h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("slot_set", { slot: null }), "Charakter wird automatisch erkannt") }, "Wieder automatisch erkennen")
    : document.createTextNode(save.characters.length ? "Automatisch erkannt" : ""));

  if (!save.path || !save.characters.length) {
    refs.slots.replaceChildren(h("li.empty", save.path ? "Noch keine Charaktere gelesen." : "Sobald ein Spielstand gefunden ist, erscheinen hier deine Charaktere."));
    return;
  }
  refs.slots.replaceChildren(...save.characters.map((c) => {
    const active = c.slot === save.slot;
    return h(`li.slot${active ? ".active" : ""}`,
      h("span.slot-no", `Slot ${c.slot}`),
      h("span.slot-name", c.name),
      h("span.slot-meta", `Stufe ${c.level}`),
      h("span.slot-meta", playtime(c.playtime)),
      active
        ? h("span.slot-meta", "Wird gezählt")
        : h("button.btn", { type: "button", onclick: () => run(action("slot_set", { slot: c.slot }), `${c.name} fest gewählt`) }, "Fest wählen"));
  }));
}

function unmount() {
  refs = null;
}

export default { id: "save", title: "Spielstand", mount, update, unmount };
