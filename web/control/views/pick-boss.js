import { action, getState } from "/shared/api.js";
import { h, modal, run } from "../ui.js";

/** Searchable list of encounters. Enter picks the highlighted one or creates a new one. */
export function pickBoss() {
  const state = getState();
  if (!state) return Promise.resolve();
  return modal((close) => {
    const search = h("input", { type: "search", placeholder: "Gegner suchen oder neu anlegen", "aria-label": "Gegner suchen", autofocus: true });
    const list = h("ul.picklist", { role: "listbox" });
    let items = [];
    let hl = 0;

    const choose = async (item) => {
      if (!item) return;
      if (item.create) await run(action("boss_add", { name: item.create, select: true }), `${item.create} angelegt`);
      else await run(action("boss_set", { id: item.id }));
      close(true);
    };

    const render = () => {
      const q = search.value.trim().toLowerCase();
      const bosses = getState().bosses;
      items = bosses
        .filter((b) => !q || b.name.toLowerCase().includes(q) || b.region.toLowerCase().includes(q))
        .sort((a, b) => Number(a.felled) - Number(b.felled));
      if (q && !bosses.some((b) => b.name.toLowerCase() === q)) items.push({ create: search.value.trim() });
      hl = Math.min(hl, Math.max(0, items.length - 1));
      list.replaceChildren(...items.map((item, i) => {
        const button = item.create
          ? h("button", { type: "button", role: "option" }, h("span", `Neuen Gegner anlegen: ${item.create}`), h("span.meta", "Enter"))
          : h("button", { type: "button", role: "option" },
            h(`span${item.felled ? ".felled" : ""}`, item.name),
            h("span.meta", item.felled ? "gefällt" : `${item.deaths} ${item.deaths === 1 ? "Tod" : "Tode"}`));
        if (i === hl) button.classList.add("hl");
        button.addEventListener("click", () => choose(item));
        return h("li", button);
      }));
      const current = list.querySelector(".hl");
      if (current) current.scrollIntoView({ block: "nearest" });
    };

    search.addEventListener("input", () => { hl = 0; render(); });
    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); hl = Math.min(items.length - 1, hl + 1); render(); }
      if (event.key === "ArrowUp") { event.preventDefault(); hl = Math.max(0, hl - 1); render(); }
      if (event.key === "Enter") { event.preventDefault(); choose(items[hl]); }
    });
    render();
    return [
      h("h2", "Gegner wählen"),
      search,
      list,
      h("div.row", { style: { justifyContent: "space-between", marginTop: "16px" } },
        h("button.btn.btn-quiet", { type: "button", onclick: async () => { await run(action("boss_set", { id: null })); close(true); } }, "Ohne Gegner zählen"),
        h("button.btn.btn-quiet", { type: "button", onclick: () => close() }, "Schließen")),
    ];
  }, { wide: true });
}
