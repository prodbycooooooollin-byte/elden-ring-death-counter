// OBS browser source. Shows the counter only; no pop-ups, no sound.
// URL options: ?bg=dark | ?bg=light (preview backdrops used by the app)

const params = new URLSearchParams(location.search);
const bg = params.get("bg");
if (bg === "dark" || bg === "light") document.body.classList.add(`bg-${bg}`);

const WORDS = {
  de: { deaths: "Tode", session: "Heute", rate: "pro Stunde", time: "Stream", tries: "Versuche" },
  en: { deaths: "Deaths", session: "Today", rate: "per hour", time: "Stream", tries: "Attempts" },
};

const stage = document.getElementById("stage");
const counter = document.getElementById("counter");
const offline = document.getElementById("offline");
let state = null;
let layoutKey = "";
let clockOffset = 0;
let lastTotal = null;

const fit = () => stage.style.setProperty("--fit", String(window.innerWidth / 1920));
window.addEventListener("resize", fit);
fit();

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function template(s) {
  const o = s.settings.overlay;
  const w = WORDS[s.settings.language] || WORDS.de;
  const label = esc(o.label || w.deaths);
  const icon = o.showIcon ? `<img class="hud-icon" src="/emblem.png" alt="">` : "";
  const sub = `
    <span data-show="session">${w.session}<b class="num" data-f="session"></b></span>
    <span data-show="rate"><b class="num" data-f="rate" style="margin:0 6px 0 0"></b>${w.rate}</span>
    <span data-show="timer">${w.time}<b class="num" data-f="timer"></b></span>
    <span data-show="boss" class="boss"><span data-f="boss-name"></span><b class="num" data-f="boss-deaths"></b></span>`;
  if (o.layout === "emblem") {
    return `
<div class="emblem">
  ${o.showIcon ? `<img class="emblem-art" src="/emblem.png" alt="">` : ""}
  <div class="emblem-body">
    <div class="emblem-top">
      <span class="emblem-label metal">${label}</span>
      <span class="emblem-num metal num" data-f="total" data-flare></span>
    </div>
    <div class="emblem-rule"></div>
    <div class="emblem-sub" data-show="sub">${sub}</div>
  </div>
</div>`;
  }
  if (o.layout === "bossbar") {
    return `
<div class="bossbar hud-text-edge">
  <div class="bossbar-head">
    <span class="bossbar-name" data-f="boss-name"></span>
    <span class="bossbar-figures">
      <span data-show="boss" class="boss">${w.tries}<b class="num" data-f="boss-deaths"></b></span>
      <span data-show="session">${w.session}<b class="num" data-f="session"></b></span>
      <span>${label}<b class="num" data-f="total" data-flare></b></span>
    </span>
  </div>
  <div class="bossbar-track"><div class="bossbar-fill"></div></div>
</div>`;
  }
  if (o.layout === "compact") {
    return `<div class="compact hud-text-edge">${icon}<span class="hud-num num" data-f="total" data-flare aria-label="${label}"></span></div>`;
  }
  return `
<div class="hud hud-text-edge">
  ${icon}
  <div class="hud-main"><span class="hud-label">${label}</span><span class="hud-num num" data-f="total" data-flare></span></div>
  <div class="hud-sub" data-show="sub">${sub}</div>
</div>`;
}

function setText(field, value) {
  for (const el of counter.querySelectorAll(`[data-f="${field}"]`)) {
    if (el.textContent !== String(value)) el.textContent = value;
  }
}

function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function tick() {
  if (!state) return;
  const now = Date.now() / 1000 + clockOffset;
  const started = state.session.started;
  setText("timer", duration(now - started));
  const rate = state.counts.session / Math.max((now - started) / 3600, 1 / 6);
  setText("rate", rate < 10 ? rate.toFixed(1).replace(".", state.settings.language === "de" ? "," : ".") : Math.round(rate));
}
setInterval(tick, 1000);

function render(s) {
  const o = s.settings.overlay;
  counter.hidden = false;
  const key = JSON.stringify([o.layout, o.label, o.showIcon, s.settings.language]);
  if (key !== layoutKey) {
    counter.innerHTML = template(s);
    layoutKey = key;
  }
  counter.className = `counter layout-${o.layout} pos-${o.position}${o.position[1] === "r" ? " right" : ""}`;
  counter.style.setProperty("--s", String(o.scale / 100));
  counter.style.setProperty("--back", String(o.backdrop / 100));
  const boss = s.bosses.find((b) => b.id === s.currentBoss) || null;
  const show = { session: o.showSession, rate: o.showRate, timer: o.showTimer, boss: o.showBoss && !!boss };
  show.sub = show.session || show.rate || show.timer || show.boss;
  for (const el of counter.querySelectorAll("[data-show]")) el.hidden = !show[el.dataset.show];
  setText("total", s.counts.total);
  setText("session", s.counts.session);
  setText("boss-name", boss ? boss.name : "");
  setText("boss-deaths", boss ? boss.deaths : "");
  const fill = counter.querySelector(".bossbar-fill");
  if (fill) {
    const share = boss && s.counts.session ? Math.min(1, boss.deaths / Math.max(s.counts.session, boss.deaths)) : 0;
    fill.style.setProperty("--fill", String(boss ? Math.max(share, 0.02) : 0));
  }
  // A short red flare on the number when it goes up; nothing else moves.
  if (lastTotal !== null && s.counts.total > lastTotal) {
    for (const el of counter.querySelectorAll("[data-flare]")) {
      el.classList.remove("flare");
      void el.offsetWidth;
      el.classList.add("flare");
    }
  }
  lastTotal = s.counts.total;
  tick();
}

const source = new EventSource("/api/events");
source.addEventListener("open", () => (offline.hidden = true));
source.addEventListener("error", () => (offline.hidden = false));
source.addEventListener("state", (event) => {
  state = JSON.parse(event.data);
  clockOffset = state.serverTime - Date.now() / 1000;
  render(state);
});
