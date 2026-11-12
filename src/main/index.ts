import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { Tracker } from "./tracker";
import { startOverlayServer } from "./server";
import { Updates } from "./updater";
import type { Action, AppInfo } from "../shared/types";

const PORT = 8737;
const resources = app.isPackaged ? process.resourcesPath : join(__dirname, "../..");
const overlayDir = join(resources, "overlay");
const emblemPath = app.isPackaged ? join(resources, "emblem.png") : join(resources, "resources", "emblem.png");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let tracker: Tracker;
let updates: Updates;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(boot);
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0a09",
    title: "Death Counter",
    icon: nativeImage.createFromPath(emblemPath),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#cbbf9f", height: 44 },
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  win.once("ready-to-show", () => win?.show());
  win.on("close", (event) => {
    // Closing hides to the tray so the OBS overlay keeps counting.
    if (quitting) return;
    event.preventDefault();
    win?.hide();
    tray?.displayBalloon?.({ title: "Death Counter läuft weiter", content: "Das Overlay zählt weiter. Beenden über das Symbol im Infobereich." });
  });
  win.on("closed", () => (win = null));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  const hash = process.env.DC_VIEW ?? "";
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
  else win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
  // Development aid: DC_SCREENSHOT=file.png captures the window once and quits.
  const shot = process.env.DC_SCREENSHOT;
  if (shot && !app.isPackaged) {
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      const image = await win!.webContents.capturePage();
      writeFileSync(shot, image.toPNG());
      quitting = true;
      app.quit();
    }, Number(process.env.DC_DELAY ?? 2500)));
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(emblemPath).resize({ width: 16, height: 16 }));
  tray.setToolTip("Death Counter");
  const refresh = () =>
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: `Tode: ${tracker.total()}`, enabled: false },
      { type: "separator" },
      { label: "Öffnen", click: showWindow },
      { label: "Tod zählen", click: () => tracker.apply({ type: "deathAdd" }) },
      { type: "separator" },
      { label: "Beenden", click: () => { quitting = true; app.quit(); } },
    ]));
  refresh();
  tracker.on("state", refresh);
  tray.on("click", showWindow);
}

async function boot() {
  const userData = app.getPath("userData");
  tracker = new Tracker(join(userData, "data"), join(userData, "obs-text"));
  try {
    await startOverlayServer(tracker, overlayDir, emblemPath, PORT);
  } catch {
    dialog.showErrorBox("Death Counter", `Port ${PORT} ist belegt. Läuft noch die alte Version des Death Counters? Bitte beenden und neu starten.`);
    app.quit();
    return;
  }
  tracker.start();
  updates = new Updates((info) => win?.webContents.send("update", info), () => tracker.settings.updates.autoInstall);

  ipcMain.handle("state", () => tracker.publicState());
  ipcMain.handle("info", (): AppInfo => ({
    version: app.getVersion(),
    overlayUrl: `http://127.0.0.1:${PORT}/overlay/`,
    obsTextDir: join(userData, "obs-text"),
  }));
  ipcMain.handle("action", (_e, action: Action) => {
    try {
      tracker.apply(action);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
  ipcMain.handle("update", (_e, command: "check" | "install") => (command === "install" ? updates.install() : updates.check()));
  ipcMain.handle("update-info", () => updates.info);
  ipcMain.handle("copy", (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle("open-path", (_e, which: "obsText" | "data") => shell.openPath(join(userData, which === "obsText" ? "obs-text" : "data")));
  ipcMain.handle("window", (_e, command: string) => {
    if (command === "minimize") win?.minimize();
    else if (command === "maximize") win?.isMaximized() ? win.unmaximize() : win?.maximize();
    else if (command === "close") win?.close();
  });
  tracker.on("state", (state) => win?.webContents.send("state", state));

  createWindow();
  createTray();
  updates.start();
}

app.on("before-quit", () => {
  quitting = true;
  tracker?.stop();
});
app.on("window-all-closed", () => {
  /* keep running in the tray */
});
