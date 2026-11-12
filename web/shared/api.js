// Connection to the local server: live state over server-sent events plus actions.

const listeners = new Map();
let state = null;
let source = null;
let connected = false;

function emit(kind, payload) {
  for (const fn of listeners.get(kind) || []) {
    try { fn(payload); } catch (error) { console.error(error); }
  }
}

export function on(kind, fn) {
  if (!listeners.has(kind)) listeners.set(kind, new Set());
  listeners.get(kind).add(fn);
  if (kind === "state" && state) fn(state);
  if (kind === "connection") fn(connected);
  return () => listeners.get(kind).delete(fn);
}

export function getState() {
  return state;
}

let clockOffset = 0;
/** Current time in seconds on the server's clock (session start times come from the server). */
export function serverNow() {
  return Date.now() / 1000 + clockOffset;
}

export function connect() {
  if (source) return;
  source = new EventSource("/api/events");
  source.addEventListener("open", () => {
    connected = true;
    emit("connection", true);
  });
  source.addEventListener("error", () => {
    if (connected) {
      connected = false;
      emit("connection", false);
    }
    // EventSource reconnects by itself.
  });
  source.addEventListener("state", (event) => {
    state = JSON.parse(event.data);
    clockOffset = state.server_time - Date.now() / 1000;
    emit("state", state);
  });
  for (const kind of ["death", "felled", "boss", "notice"]) {
    source.addEventListener(kind, (event) => emit(kind, JSON.parse(event.data)));
  }
}

export async function action(type, data = {}) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Server antwortet mit ${response.status}.`);
  return body.result;
}

export function saveSettings(patch) {
  return action("settings", { patch });
}

export async function uploadLogo(file) {
  const response = await fetch("/api/logo", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Hochladen fehlgeschlagen.");
}

export async function removeLogo() {
  await fetch("/api/logo", { method: "DELETE" });
}
