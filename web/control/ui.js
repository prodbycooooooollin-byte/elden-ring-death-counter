// Small DOM toolkit for the control panel.

/** h("div.class#id", {props}, ...children) */
export function h(tag, props = {}, ...children) {
  const [, name = "div", rest = ""] = tag.match(/^([a-z0-9]+)?(.*)$/i);
  const el = document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "html") el.innerHTML = value;
    else if (key === "text") el.textContent = value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Inset grouped list, as in macOS System Settings: a small header and a rounded group. */
export function block(title, aside, ...children) {
  return h("section.block",
    title || aside ? h("div.block-title", title ? h("h2", title) : h("span"), aside ? h("div.block-aside", aside) : null) : null,
    h("div.group", ...children));
}

/** Large title with an optional one-line explanation. */
export function viewHead(title, text) {
  return h("header.view-head", h("h1", title), text ? h("p", text) : null);
}

/** Game item art with a caption, used for empty and start states. */
export function itemView(title, text) {
  return h("div.itemview",
    h("img", { src: "/game/sacrificial-twig.png", alt: "Opferzweig, Talisman aus Elden Ring", width: 72, height: 72, onerror: (e) => e.target.remove() }),
    h("div", h("h3", title), h("p", text)));
}

export function kbd(key) {
  return h("kbd", key);
}

// ---------------------------------------------------------------- feedback

export function toast(message, kind = "") {
  const host = document.getElementById("toasts");
  const el = h(`div.toast${kind ? "." + kind : ""}`, message);
  host.append(el);
  setTimeout(() => el.remove(), 3300);
}

/** Run an async action and surface its error as a toast. Resolves to the result or undefined. */
export async function run(promise, success) {
  try {
    const result = await promise;
    if (success) toast(success);
    return result;
  } catch (error) {
    toast(error.message || String(error), "error");
    return undefined;
  }
}

let dialogOpen = false;
export function isDialogOpen() {
  return dialogOpen;
}

/** Modal shell. `build(close)` returns the dialog content. Resolves with the value passed to close. */
export function modal(build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const back = h("div.dialog-back");
    const box = h(`div.dialog${wide ? ".wide" : ""}`, { role: "dialog", "aria-modal": "true" });
    const close = (value) => {
      dialogOpen = false;
      back.remove();
      document.removeEventListener("keydown", onKey, true);
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(undefined);
      }
    };
    back.addEventListener("mousedown", (event) => {
      if (event.target === back) close(undefined);
    });
    document.addEventListener("keydown", onKey, true);
    box.append(...[].concat(build(close)));
    back.append(box);
    document.body.append(back);
    dialogOpen = true;
    const focusable = box.querySelector("[autofocus], input, button");
    if (focusable) focusable.focus();
  });
}

export function confirmDialog(text, yes = "Ja", no = "Abbrechen") {
  return modal((close) => [
    h("p", text),
    h("div.row",
      h("button.btn", { type: "button", onclick: () => close(true), autofocus: true }, yes),
      h("button.btn.btn-quiet", { type: "button", onclick: () => close(false) }, no)),
  ]).then(Boolean);
}

// ---------------------------------------------------------------- inputs

/**
 * Option control. Two boolean options render as a switch, up to four options as a
 * segmented control, more as a menu (native select). Every variant exposes .set(value).
 */
export function picker({ options, value, onChange, label }) {
  const isBool = options.length === 2 && options.every(([v]) => typeof v === "boolean");
  if (isBool) return toggle({ value: value === undefined ? true : value, onChange, label });
  const length = options.reduce((n, [, text]) => n + text.length, 0);
  if (options.length <= 3 && length <= 36) return segmented({ options, value, onChange, label });
  return menu({ options, value, onChange, label });
}

export function toggle({ value, onChange, label }) {
  const input = h("input.switch", { type: "checkbox", role: "switch", "aria-label": label || "" });
  input.checked = Boolean(value);
  input.addEventListener("change", () => onChange(input.checked));
  input.set = (v) => { input.checked = Boolean(v); };
  return input;
}

export function segmented({ options, value, onChange, label }) {
  const el = h("div.segmented", { role: "radiogroup", "aria-label": label || "" });
  const buttons = options.map(([v, text]) => {
    const b = h("button", { type: "button", role: "radio" }, text);
    b.addEventListener("click", () => {
      el.set(v);
      onChange(v);
    });
    b.dataset.value = JSON.stringify(v);
    return b;
  });
  el.append(...buttons);
  el.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
    const next = buttons[(i + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    next.click();
    next.focus();
  });
  el.set = (v) => {
    for (const b of buttons) {
      const on = b.dataset.value === JSON.stringify(v);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  el.set(value === undefined ? options[0][0] : value);
  return el;
}

export function menu({ options, value, onChange, label }) {
  const select = h("select.menu-select", { "aria-label": label || "" },
    ...options.map(([v, text]) => h("option", { value: JSON.stringify(v) }, text)));
  select.addEventListener("change", () => onChange(JSON.parse(select.value)));
  select.set = (v) => { select.value = JSON.stringify(v); };
  if (value !== undefined) select.set(value);
  return select;
}

export const onOff = [[true, "Ein"], [false, "Aus"]];

export function slider({ min, max, step = 1, value, format = (v) => v, onChange, label }) {
  const input = h("input", { type: "range", min, max, step, value, "aria-label": label || "" });
  const out = h("output");
  const paint = () => {
    out.textContent = format(Number(input.value));
    input.style.setProperty("--p", `${((input.value - min) / (max - min)) * 100}%`);
  };
  input.addEventListener("input", paint);
  input.addEventListener("change", () => onChange(Number(input.value)));
  paint();
  const el = h("div.slider", input, out);
  el.set = (v) => {
    if (document.activeElement !== input && Number(input.value) !== v) {
      input.value = v;
      paint();
    }
  };
  return el;
}

/** Text input that commits on Enter or blur. */
export function textInput({ value = "", placeholder = "", onCommit, maxLength = 120, label }) {
  const input = h("input", { type: "text", value, placeholder, maxLength, autocomplete: "off", spellcheck: "false", name: (label || placeholder).toLowerCase().replace(/\W+/g, "-"), "aria-label": label || placeholder });
  let committed = value;
  const commit = () => {
    if (input.value !== committed) {
      committed = input.value;
      onCommit(input.value);
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  input.addEventListener("blur", commit);
  input.set = (v) => {
    if (document.activeElement !== input) {
      input.value = v;
      committed = v;
    }
  };
  return input;
}

/** One row of a group: label (and hint) on the left, the control trailing. */
export function field(label, control, hint) {
  return h("div.field", h("div.label", h("span", label), hint ? h("small", hint) : null), h("div.control", control));
}

// ---------------------------------------------------------------- formatting

export function clock(seconds) {
  return new Date(seconds * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function playtime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} Std. ${String(m).padStart(2, "0")} Min.`;
}

export function deathsWord(n) {
  return n === 1 ? "Tod" : "Tode";
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h("textarea", { value: text, style: { position: "fixed", opacity: "0" } });
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("In die Zwischenablage kopiert");
}
