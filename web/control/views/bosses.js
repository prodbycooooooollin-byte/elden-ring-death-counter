import { action, getState } from "/shared/api.js";
import { h, viewHead, block, run, confirmDialog, picker, toast } from "../ui.js";

let refs = null;
let filter = "all";
let query = "";
let editing = null;

function mount(root) {
  refs = {};
  refs.list = h("ul.boss-list");
  refs.summary = h("span.eyebrow");

  const name = h("input", { type: "text", placeholder: "Name des Gegners …", autocomplete: "off", name: "boss-name", maxLength: 80, "aria-label": "Name des Gegners" });
  const region = h("input", { type: "text", placeholder: "Gebiet (optional) …", autocomplete: "off", name: "boss-region", maxLength: 60, "aria-label": "Gebiet" });
  const great = h("input", { type: "checkbox" });
  const add = async (event) => {
    event.preventDefault();
    const boss = await run(action("boss_add", { name: name.value, region: region.value, great: great.checked }));
    if (boss) {
      toast(`${boss.name} hinzugefügt`);
      name.value = region.value = "";
      great.checked = false;
      name.focus();
    }
  };

  const search = h("input", { type: "search", placeholder: "Suchen …", autocomplete: "off", name: "boss-filter", value: query, "aria-label": "Gegner suchen" });
  search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); render(getState()); });

  root.append(
    viewHead("Bosse", "Wähle den Gegner, an dem du gerade stirbst. Jeder Tod wird ihm angerechnet, bis du ihn als gefällt markierst."),
    h("div.toolbar",
      search,
      picker({ label: "Filter", options: [["all", "Alle Gegner"], ["open", "Noch offen"], ["felled", "Gefällt"]], value: filter, onChange: (v) => { filter = v; render(getState()); } }),
      refs.summary),
    h("div.group", refs.list),
    block("Gegner hinzufügen", null,
      h("p.hint", "Großer Feind steht für Erinnerungsbosse. Das Overlay zeigt bei ihnen GROSSER FEIND GEFÄLLT."),
      h("form.addform", { onsubmit: add },
        name, region,
        h("label.check", great, "Großer Feind"),
        h("button.btn", { type: "submit" }, "Hinzufügen"))),
    block("Liste verwalten", null,
      h("div.row", { style: { marginTop: "12px" } },
        h("button.btn", { type: "button", onclick: () => run(action("bosses_presets"), "Fehlende Vorlagen ergänzt") }, "Fehlende Vorlagen ergänzen"),
        h("button.btn.btn-danger", { type: "button", onclick: resetAll }, "Alle Bosszähler zurücksetzen"))),
  );
}

async function resetAll() {
  if (await confirmDialog("Alle Tode an Bossen auf null setzen und alle Gegner wieder als offen markieren? Der Gesamtstand bleibt.", "Zurücksetzen")) {
    run(action("bosses_reset"), "Bosszähler zurückgesetzt");
  }
}

async function remove(boss) {
  if (await confirmDialog(`${boss.name} aus der Liste entfernen?`, "Entfernen")) run(action("boss_remove", { id: boss.id }));
}

function editRow(boss) {
  const name = h("input", { type: "text", value: boss.name, maxLength: 80, "aria-label": "Name" });
  const region = h("input", { type: "text", value: boss.region, maxLength: 60, placeholder: "Gebiet", "aria-label": "Gebiet" });
  const deaths = h("input", { type: "number", value: boss.deaths, min: 0, max: 99999, "aria-label": "Tode" });
  const great = h("input", { type: "checkbox", checked: boss.great });
  const save = async (event) => {
    event.preventDefault();
    const ok = await run(action("boss_update", { id: boss.id, name: name.value, region: region.value, deaths: Number(deaths.value) || 0, great: great.checked }).then(() => true));
    if (ok) { editing = null; render(getState()); }
  };
  const cancel = () => { editing = null; render(getState()); };
  const form = h("form.boss-edit", { onsubmit: save, onkeydown: (e) => { if (e.key === "Escape") cancel(); } },
    name, region, deaths, h("label.check", great, "Großer Feind"),
    h("div.row", h("button.btn", { type: "submit" }, "Speichern"), h("button.btn.btn-quiet", { type: "button", onclick: cancel }, "Abbrechen")));
  setTimeout(() => name.focus());
  return h("li.boss.current", form);
}

function row(boss, state, max) {
  if (editing === boss.id) return editRow(boss);
  const current = state.current_boss === boss.id;
  const cls = `li.boss${current ? ".current" : ""}${boss.felled ? ".felled" : ""}`;
  const felledDate = boss.felled_at ? new Date(boss.felled_at * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : "";
  return h(cls,
    h("div", { style: { minWidth: 0 } },
      h("span.boss-name", boss.name, boss.great ? h("span.boss-great", "Großer Feind") : null),
      boss.region ? h("span.boss-region", boss.region) : null),
    h("div.boss-bar", h("b", String(boss.deaths)), h("i", { style: { "--w": `${max ? (boss.deaths / max) * 100 : 0}%` } })),
    h(`span.boss-state${boss.felled ? ".is-felled" : ""}`, boss.felled ? `Gefällt ${felledDate}` : current ? "Aktiv" : "Offen"),
    h("div.boss-actions",
      current
        ? h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("boss_felled", { id: boss.id }), `${boss.name} gefällt`) }, "Gefällt")
        : boss.felled
          ? h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("boss_revive", { id: boss.id })) }, "Wieder öffnen")
          : h("button.btn.btn-quiet", { type: "button", onclick: () => run(action("boss_set", { id: boss.id })) }, "Wählen"),
      h("button.btn.btn-quiet", { type: "button", title: "Nach oben", "aria-label": `${boss.name} nach oben`, onclick: () => run(action("boss_move", { id: boss.id, delta: -1 })) }, "↑"),
      h("button.btn.btn-quiet", { type: "button", title: "Nach unten", "aria-label": `${boss.name} nach unten`, onclick: () => run(action("boss_move", { id: boss.id, delta: 1 })) }, "↓"),
      h("button.btn.btn-quiet", { type: "button", onclick: () => { editing = boss.id; render(getState()); } }, "Bearbeiten"),
      h("button.btn.btn-quiet.btn-danger", { type: "button", onclick: () => remove(boss) }, "Entfernen")),
  );
}

function render(state) {
  if (!refs || !state) return;
  if (editing && refs.list.contains(document.activeElement)) return; // keep the edit form intact
  const all = state.bosses;
  const max = Math.max(1, ...all.map((b) => b.deaths));
  const shown = all.filter((b) =>
    (filter === "all" || (filter === "felled") === b.felled) &&
    (!query || b.name.toLowerCase().includes(query) || b.region.toLowerCase().includes(query)));
  const felled = all.filter((b) => b.felled).length;
  refs.summary.textContent = `${felled} von ${all.length} gefällt`;
  if (!shown.length) {
    refs.list.replaceChildren(h("li.empty", all.length ? "Kein Gegner passt zu Suche und Filter." : "Die Liste ist leer. Füge unten einen Gegner hinzu oder ergänze die Vorlagen."));
    return;
  }
  refs.list.replaceChildren(...shown.map((b) => row(b, state, max)));
}

function update(state) {
  render(state);
}

function unmount() {
  refs = null;
  editing = null;
}

export default { id: "bosses", title: "Bosse", mount, update, unmount };
