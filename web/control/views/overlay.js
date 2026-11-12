import { saveSettings } from "/shared/api.js";
import { h, viewHead, block, run, picker, onOff, slider, textInput, field, copy } from "../ui.js";

let controls = [];
let refs = null;

const overlaySetting = (key) => (value) => run(saveSettings({ overlay: { [key]: value } }));
const bannerSetting = (key) => (value) => run(saveSettings({ banners: { [key]: value } }));

function bind(control, read) {
  controls.push({ control, read });
  return control;
}

function urlRow(label, path) {
  const url = `${location.origin}${path}`;
  return h("div.url",
    h("span.url-label", label),
    h("input", { type: "text", value: url, readOnly: true, "aria-label": label, onfocus: (e) => e.target.select() }),
    h("button.btn", { type: "button", onclick: () => copy(url) }, "Kopieren"));
}

function mount(root) {
  controls = [];
  refs = {};
  root.classList.add("wide");
  const iframe = h("iframe", { src: "/overlay/?muted=1&bg=light", title: "Overlay-Vorschau", tabIndex: -1 });
  refs.preview = h("div.preview", iframe);
  refs.logoToggle = h("div");

  root.append(
    viewHead("OBS-Overlay", "Das sehen deine Zuschauer. Änderungen erscheinen sofort im Stream, ohne OBS neu zu laden."),
    block("In OBS einbinden", null,
      h("div.embed",
        urlRow("Zähler und Einblendungen", "/overlay/"),
        urlRow("Nur der Zähler", "/overlay/?only=counter"),
        urlRow("Nur die Einblendungen", "/overlay/?only=banners")),
      h("ol.steps",
        h("li", "In OBS bei Quellen auf ", h("b", "+"), " klicken und ", h("b", "Browser"), " wählen."),
        h("li", "Eine der Adressen oben bei ", h("b", "URL"), " einfügen."),
        h("li", "Breite ", h("b", "1920"), " und Höhe ", h("b", "1080"), " eintragen, dann die Quelle über die ganze Szene ziehen."),
        h("li", "Der Hintergrund bleibt durchsichtig. Dieses Fenster des Counters muss während des Streams laufen."))),
    h("div.cols", { style: { marginTop: "34px" } },
      h("div",
        block("Zähler", null,
          field("Darstellung", bind(picker({
            label: "Darstellung",
            options: [["emblem", "Emblem"], ["hud", "HUD-Leiste"], ["compact", "Nur Zahl"], ["bossbar", "Bossleiste"]],
            onChange: overlaySetting("layout"),
          }), (s) => s.settings.overlay.layout), "Emblem: Bild, Beschriftung, Zahl und Goldlinie"),
          field("Position", bind(picker({
            label: "Position",
            options: [["tr", "Oben rechts"], ["br", "Unten rechts"], ["bl", "Unten links"], ["tl", "Oben links"]],
            onChange: overlaySetting("position"),
          }), (s) => s.settings.overlay.position), "Oben links liegen im Spiel die Lebens- und Ausdauerleisten"),
          field("Größe", bind(slider({ min: 40, max: 250, step: 5, label: "Größe", format: (v) => `${v} %`, onChange: overlaySetting("scale") }), (s) => s.settings.overlay.scale)),
          field("Hintergrund", bind(slider({ min: 0, max: 100, step: 5, label: "Deckkraft des Hintergrunds", format: (v) => `${v} %`, onChange: overlaySetting("backdrop") }), (s) => s.settings.overlay.backdrop), "Dunkles Band hinter der Zahl"),
          field("Beschriftung", bind(textInput({ placeholder: "Tode", maxLength: 24, label: "Beschriftung", onCommit: overlaySetting("label") }), (s) => s.settings.overlay.label), "Leer lassen für den Standard der Sprache"),
          field("Bild", bind(picker({ label: "Bild neben der Zahl", options: onOff, onChange: overlaySetting("show_icon") }), (s) => s.settings.overlay.show_icon), "assets/icon.png, sonst das Todesfäule-Icon aus dem Spiel"),
          refs.logoToggle),
        block("Zusätzliche Werte", null,
          field("Diese Session", bind(picker({ label: "Diese Session", options: onOff, onChange: overlaySetting("show_session") }), (s) => s.settings.overlay.show_session)),
          field("Aktueller Gegner", bind(picker({ label: "Aktueller Gegner", options: onOff, onChange: overlaySetting("show_boss") }), (s) => s.settings.overlay.show_boss)),
          field("Tode pro Stunde", bind(picker({ label: "Tode pro Stunde", options: onOff, onChange: overlaySetting("show_rate") }), (s) => s.settings.overlay.show_rate), "In Emblem und HUD-Leiste"),
          field("Laufzeit", bind(picker({ label: "Laufzeit", options: onOff, onChange: overlaySetting("show_timer") }), (s) => s.settings.overlay.show_timer), "In Emblem und HUD-Leiste"),
          field("Gesamtstand", bind(picker({ label: "Gesamtstand", options: onOff, onChange: overlaySetting("show_total") }), (s) => s.settings.overlay.show_total), "Nur in der Bossleiste abschaltbar")),
        block("Einblendungen", null,
          field("Bei jedem Tod", bind(picker({ label: "Einblendung bei jedem Tod", options: onOff, onChange: bannerSetting("you_died") }), (s) => s.settings.banners.you_died)),
          field("Text beim Tod", bind(textInput({ placeholder: "YOU DIED", maxLength: 40, label: "Text beim Tod", onCommit: bannerSetting("you_died_text") }), (s) => s.settings.banners.you_died_text)),
          field("Feind gefällt", bind(picker({ label: "Feind gefällt", options: onOff, onChange: bannerSetting("felled") }), (s) => s.settings.banners.felled), "Erscheint, wenn du einen Gegner als gefällt markierst"),
          field("Neuer Gegner", bind(picker({ label: "Ankündigung neuer Gegner", options: onOff, onChange: bannerSetting("boss_intro") }), (s) => s.settings.banners.boss_intro), "Name und Gebiet beim Wechsel des Gegners"),
          field("Dauer", bind(slider({ min: 1.5, max: 12, step: 0.5, label: "Dauer", format: (v) => `${String(v).replace(".", ",")} s`, onChange: bannerSetting("duration") }), (s) => s.settings.banners.duration)))),
      h("div.sticky",
        block("Vorschau", null,
          refs.preview,
          h("div.preview-bar",
            picker({
              label: "Vorschau-Hintergrund",
              options: [["light", "Helles Gameplay"], ["dark", "Dunkles Gameplay"], ["clear", "Durchsichtig"]],
              value: "light",
              onChange: (v) => {
                refs.preview.classList.toggle("checker", v === "clear");
                iframe.src = `/overlay/?muted=1${v === "clear" ? "" : `&bg=${v}`}`;
              },
            }),
            h("span", "Die Vorschau zeigt die echten Daten"))))),
  );
}

function update(state) {
  if (!refs) return;
  for (const { control, read } of controls) control.set(read(state));
  if (state.logo) {
    if (!refs.logoControl) {
      refs.logoControl = picker({ label: "Eigenes Logo", options: onOff, onChange: overlaySetting("show_logo") });
      refs.logoToggle.replaceChildren(field("Eigenes Logo", refs.logoControl, "Ersetzt das Spiel-Icon"));
    }
    refs.logoControl.set(state.settings.overlay.show_logo);
  } else if (refs.logoControl || !refs.logoToggle.childElementCount) {
    refs.logoControl = null;
    refs.logoToggle.replaceChildren(field("Eigenes Logo", h("a", { href: "#settings" }, "Unter Einstellungen hochladen")));
  }
}

function unmount() {
  controls = [];
  refs = null;
}

export default { id: "obs", title: "OBS-Overlay", mount, update, unmount };
