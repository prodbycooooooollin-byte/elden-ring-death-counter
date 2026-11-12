// Small local web server. OBS can only show an overlay from a URL, so the app serves it here.
// The app window itself talks to the main process over IPC, not over this server.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { Tracker } from "./tracker";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// GET shortcuts for Stream Deck ("Website" action, fetch in background).
const QUICK: Record<string, Parameters<Tracker["apply"]>[0]> = {
  add: { type: "deathAdd", amount: 1 },
  undo: { type: "deathRemove" },
  felled: { type: "bossFelled" },
  session: { type: "sessionNew" },
};

export function startOverlayServer(tracker: Tracker, overlayDir: string, emblemPath: string, port: number): Promise<Server> {
  const clients = new Set<ServerResponse>();
  const send = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  tracker.on("state", (state) => clients.forEach((res) => send(res, "state", state)));
  tracker.on("death", (death) => clients.forEach((res) => send(res, "death", death)));
  setInterval(() => clients.forEach((res) => res.write(": ping\n\n")), 15000).unref();

  const reply = (res: ServerResponse, status: number, body: string | Buffer, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return reply(res, 405, "{}");
    if (path === "/api/state") return reply(res, 200, JSON.stringify(tracker.publicState()));
    if (path === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      send(res, "state", tracker.publicState());
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (path.startsWith("/api/quick/")) {
      const action = QUICK[path.slice("/api/quick/".length)];
      if (!action) return reply(res, 404, JSON.stringify({ error: "Unbekannter Kurzbefehl." }));
      try {
        tracker.apply(action);
        return reply(res, 200, JSON.stringify({ ok: true }));
      } catch (error) {
        return reply(res, 400, JSON.stringify({ error: (error as Error).message }));
      }
    }
    if (path === "/emblem.png") return reply(res, 200, await readFile(emblemPath), "image/png");
    if (path === "/" || path === "/overlay") {
      res.writeHead(302, { Location: "/overlay/" });
      return res.end();
    }
    if (path.startsWith("/overlay/")) {
      const relative = path.slice("/overlay/".length) || "index.html";
      const file = normalize(join(overlayDir, relative));
      if (!file.startsWith(normalize(overlayDir) + sep)) return reply(res, 404, "");
      try {
        return reply(res, 200, await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
      } catch {
        return reply(res, 404, "Not found", "text/plain");
      }
    }
    reply(res, 404, "Not found", "text/plain");
  };

  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) reply(res, 500, "");
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
