import { connect, on, serverNow } from "/shared/api.js";
import { t, formatDuration, deathsPerHour } from "/shared/i18n.js";
import { playDeath, playFelled, playBoss, setVolume, unlock } from "/shared/sound.js";

// URL options:  ?only=counter | ?only=banners   ?muted=1   ?bg=dark | ?bg=light (preview only)
const params = new URLSearchParams(location.search);
const only = params.get("only");
const muted = params.get("muted") === "1";
const bg = params.get("bg");
if (bg === "dark" || bg === "light") document.body.classList.add(`bg-${bg}`);

// Status icon "Death Blight" from the game's HUD (see assets/QUELLEN.md).
const GAME_ICON = "/game/death-blight.png";

const stage = document.getElementById("stage");
const counter = document.getElementById("counter");
const banner = document.getElementById("banner");
const announce = document.getElementById("announce");
const vignette = document.getElementById("vignette");
const offline = document.getElementById("offline");

let state = null;
let layoutKey = "";
let assets = {};
const customAudio = {};

function fit() {
  stage.style.setProperty("--fit", String(window.innerWidth / 1920));
}
window.addEventListener("resize", fit);
fit();

// ------------------------------------------------------------ optional files from ./assets

async function loadAssets() {
  try {
    assets = await (await fetch("/api/assets")).json();
  } catch {
    assets = {};
  }
  for (const slot of ["font-display", "font-text"]) {
    if (!assets[slot]) continue;
    try {
      const face = new FontFace(`Custom ${slot}`, `url(${assets[slot]})`);
      await face.load();
      document.fonts.add(face);
      if (slot === "font-display") document.documentElement.style.setProperty("--serif-display", `"Custom ${slot}"`);
      else document.documentElement.style.setProperty("--serif", `"Custom ${slot}", "EB Garamond", serif`);
    } catch (error) {
      console.warn("Schrift nicht ladbar", slot, error);
    }
  }
  if (assets["font-display"]) {
    const style = document.createElement("style");
    style.textContent = ".hud-num, .banner-title, .banner-ghost, .announce-name, .bossbar-name { font-family: var(--serif-display), var(--serif); }";
    document.head.append(style);
  }
  for (const slot of ["death", "felled", "boss"]) {
    if (assets[slot]) customAudio[slot] = Object.assign(new Audio(assets[slot]), { preload: "auto" });
  }
  if (assets.banner) {
    const band = banner.querySelector(".banner-band");
    band.classList.add("custom");
    band.style.backgroundImage = `url(${assets.banner})`;
  }
  layoutKey = "";
  if (state) renderCounter(state);
}

// ------------------------------------------------------------ counter

function iconSrc(s) {
  const o = s.settings.overlay;
  if (o.show_logo && s.logo) return s.logo.url;
  if (!o.show_icon) return null;
  return assets.icon || GAME_ICON;
}

function template(s) {
  const o = s.settings.overlay;
  const w = t(s.settings.language);
  const label = escapeHtml(o.label || w.deaths);
  const src = iconSrc(s);
  const icon = src ? `<img class="hud-icon" src="${src}" alt="" onerror="this.remove()">` : "";
  if (o.layout === "bossbar") {
    return `
<div class="bossbar hud-text-edge">
  <div class="bossbar-head">
    <span class="bossbar-name" data-f="bossbar-name"></span>
    <span class="bossbar-figures">
      <span data-show="boss" class="boss">${escapeHtml(w.tries)}<b class="num" data-f="boss-deaths"></b></span>
      <span data-show="session">${escapeHtml(w.session)}<b class="num" data-f="session"></b></span>
      <span data-show="total">${src ? `<img class="bossbar-icon" src="${src}" alt="" onerror="this.remove()">` : ""}${label}<b class="num" data-f="total" data-flare></b></span>
    </span>
  </div>
  <div class="bossbar-track"><div class="bossbar-fill"></div></div>
</div>`;
  }
  if (o.layout === "emblem") {
    // Reference layout: emblem, spaced label, large number, tapered gold rule underneath.
    return `
<div class="emblem">
  ${src ? `<img class="emblem-art" src="${src}" alt="" onerror="this.remove()">` : ""}
  <div class="emblem-body">
    <div class="emblem-top">
      <span class="emblem-label metal">${label}</span>
      <span class="emblem-num metal num" data-f="total" data-flare></span>
    </div>
    <div class="emblem-rule"></div>
    <div class="emblem-sub" data-show="sub">
      <span data-show="session">${escapeHtml(w.session)}<b class="num" data-f="session"></b></span>
      <span data-show="rate"><b class="num" data-f="rate" style="margin:0 6px 0 0"></b>${escapeHtml(w.rate)}</span>
      <span data-show="timer">${escapeHtml(w.time)}<b class="num" data-f="timer"></b></span>
      <span data-show="boss" class="boss"><span data-f="boss-name"></span><b class="num" data-f="boss-deaths"></b></span>
    </div>
  </div>
</div>`;
  }
  if (o.layout === "compact") {
    return `<div class="compact hud-text-edge">${icon}<span class="hud-num num" data-f="total" data-flare aria-label="${label}"></span></div>`;
  }
  return `
<div class="hud hud-text-edge">
  ${icon}
  <div class="hud-main">
    <span class="hud-label">${label}</span>
    <span class="hud-num num" data-f="total" data-flare></span>
  </div>
  <div class="hud-sub" data-show="sub">
    <span data-show="session">${escapeHtml(w.session)}<b class="num" data-f="session"></b></span>
    <span data-show="rate"><b class="num" data-f="rate" style="margin:0 6px 0 0"></b>${escapeHtml(w.rate)}</span>
    <span data-show="timer">${escapeHtml(w.time)}<b class="num" data-f="timer"></b></span>
    <span data-show="boss" class="boss"><span data-f="boss-name"></span><b class="num" data-f="boss-deaths"></b></span>
  </div>
</div>`;
}

function currentBoss(s) {
  return s.bosses.find((b) => b.id === s.current_boss) || null;
}

function setText(field, value) {
  const text = String(value);
  for (const el of counter.querySelectorAll(`[data-f="${field}"]`)) {
    if (el.textContent !== text) el.textContent = text;
  }
}

function renderCounter(s) {
  const o = s.settings.overlay;
  counter.hidden = only === "banners";
  const key = JSON.stringify([o.layout, o.label, o.show_icon, o.show_logo, s.logo && s.logo.url, s.settings.language, assets]);
  if (key !== layoutKey) {
    counter.innerHTML = template(s);
    layoutKey = key;
  }
  counter.className = `counter layout-${o.layout} pos-${o.position}${o.position[1] === "r" ? " right" : ""}`;
  counter.style.setProperty("--s", String(o.scale / 100));
  counter.style.setProperty("--back", String(o.backdrop / 100));

  const boss = currentBoss(s);
  const show = {
    total: o.show_total || o.layout !== "bossbar",
    session: o.show_session,
    rate: o.show_rate,
    timer: o.show_timer,
    boss: o.show_boss && !!boss,
  };
  show.sub = show.session || show.rate || show.timer || show.boss;
  for (const el of counter.querySelectorAll("[data-show]")) el.hidden = !show[el.dataset.show];

  setText("total", s.counts.total);
  setText("session", s.counts.session);
  setText("boss-name", boss ? boss.name : "");
  setText("boss-deaths", boss ? boss.deaths : "");
  setText("bossbar-name", boss ? boss.name : "");
  const fill = counter.querySelector(".bossbar-fill");
  if (fill) {
    // Share of today's deaths spent on this encounter.
    const share = boss && s.counts.session ? Math.min(1, boss.deaths / Math.max(s.counts.session, boss.deaths)) : 0;
    fill.style.setProperty("--fill", String(boss ? Math.max(share, 0.02) : 0));
  }
  tick();
}

function tick() {
  if (!state) return;
  const now = serverNow();
  const started = state.session.started;
  setText("timer", formatDuration(now - started));
  const rate = deathsPerHour(state.counts.session, started, now);
  setText("rate", rate < 10 ? rate.toFixed(1).replace(".", state.settings.language === "de" ? "," : ".") : Math.round(rate));
}
setInterval(tick, 1000);

function flare() {
  for (const el of counter.querySelectorAll("[data-flare]")) {
    el.classList.remove("flare");
    void el.offsetWidth;
    el.classList.add("flare");
  }
}

// ------------------------------------------------------------ banners

const queue = [];
let busy = false;

function enqueue(job) {
  queue.push(job);
  if (!busy) next();
}

function next() {
  const job = queue.shift();
  if (!job) {
    busy = false;
    return;
  }
  busy = true;
  const duration = state ? state.settings.banners.duration : 4.5;
  job(duration);
  setTimeout(next, duration * 1000 + 250);
}

function restart(el, duration) {
  el.classList.remove("show");
  el.style.setProperty("--d", `${duration}s`);
  void el.offsetWidth;
  el.classList.add("show");
}

function showBanner(kind, title, sub, duration) {
  banner.className = `banner ${kind}`;
  banner.querySelector(".banner-title").textContent = title;
  banner.querySelector(".banner-ghost").textContent = title;
  banner.querySelector(".banner-sub").textContent = sub || "";
  restart(banner, duration);
}

function play(slot, fallback) {
  if (muted || !state || !state.settings.sound.enabled) return;
  const audio = customAudio[slot];
  if (audio) {
    audio.volume = Math.pow(state.settings.sound.volume / 100, 1.6);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    fallback();
  }
}

on("state", (s) => {
  state = s;
  setVolume(s.settings.sound.volume);
  renderCounter(s);
});

on("connection", (ok) => {
  offline.hidden = ok || only === "banners";
});

on("death", (e) => {
  if (only !== "banners") setTimeout(flare, 30);
  if (!state || only === "counter" || !state.settings.banners.you_died) return;
  const w = t(state.settings.language);
  enqueue((d) => {
    showBanner("died", state.settings.banners.you_died_text, w.deathNo(e.total), d);
    restart(vignette, d);
    play("death", playDeath);
  });
});

on("felled", (e) => {
  if (!state || only === "counter" || !state.settings.banners.felled) return;
  const w = t(state.settings.language);
  enqueue((d) => {
    showBanner("felled", e.great ? w.greatEnemyFelled : w.enemyFelled, `${e.name}, ${w.afterDeaths(e.deaths)}`, d);
    play("felled", () => playFelled(e.great));
  });
});

on("boss", (e) => {
  if (!state || only === "counter" || !state.settings.banners.boss_intro) return;
  enqueue((d) => {
    announce.querySelector(".announce-region").textContent = e.region || "";
    announce.querySelector(".announce-name").textContent = e.name;
    restart(announce, d);
    play("boss", playBoss);
  });
});

window.addEventListener("pointerdown", unlock, { once: true });

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

loadAssets();
connect();
