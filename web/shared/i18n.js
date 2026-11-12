// Viewer-facing words on the overlay. The control panel itself is German.

const words = {
  de: {
    deaths: "Tode",
    session: "Heute",
    rate: "pro Stunde",
    time: "Stream",
    enemyFelled: "FEIND GEFÄLLT",
    greatEnemyFelled: "GROSSER FEIND GEFÄLLT",
    deathNo: (n) => `${n}. Tod`,
    afterDeaths: (n) => (n === 1 ? "nach einem Tod" : n === 0 ? "ohne zu sterben" : `nach ${n} Toden`),
    tries: "Versuche",
    noBoss: "",
  },
  en: {
    deaths: "Deaths",
    session: "Today",
    rate: "per hour",
    time: "Stream",
    enemyFelled: "ENEMY FELLED",
    greatEnemyFelled: "GREAT ENEMY FELLED",
    deathNo: (n) => `Death ${n}`,
    afterDeaths: (n) => (n === 1 ? "after one death" : n === 0 ? "without dying" : `after ${n} deaths`),
    tries: "Attempts",
    noBoss: "",
  },
};

export function t(lang) {
  return words[lang] || words.de;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function deathsPerHour(deaths, startedSeconds, nowSeconds) {
  const hours = Math.max((nowSeconds - startedSeconds) / 3600, 1 / 6); // ignore the first 10 minutes' noise
  return deaths / hours;
}
