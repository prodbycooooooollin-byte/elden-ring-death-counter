// Auto-update from GitHub releases (electron-updater, NSIS installer).

import { app } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateInfo } from "../shared/types";

const { autoUpdater } = electronUpdater;
const SIX_HOURS = 6 * 60 * 60 * 1000;

export class Updates {
  info: UpdateInfo = { current: app.getVersion(), status: "idle", latest: null, progress: 0, message: "" };

  constructor(private readonly emit: (info: UpdateInfo) => void, private readonly autoInstall: () => boolean) {
    if (!app.isPackaged) {
      this.info.status = "dev";
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.set({ status: "checking", message: "" }));
    autoUpdater.on("update-not-available", () => this.set({ status: "latest" }));
    autoUpdater.on("update-available", (i) => this.set({ status: "available", latest: i.version }));
    autoUpdater.on("download-progress", (p) => this.set({ status: "downloading", progress: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => {
      this.set({ status: "ready", latest: i.version, progress: 100 });
      if (this.autoInstall() && !this.startedCounting) autoUpdater.quitAndInstall(true, true);
    });
    autoUpdater.on("error", (e) => this.set({ status: "error", message: String(e?.message ?? e).slice(0, 200) }));
  }

  /** Updates found right at start install silently; later ones wait so a running stream is not interrupted. */
  private startedCounting = false;

  start() {
    if (this.info.status === "dev") return;
    this.check();
    setTimeout(() => (this.startedCounting = true), 60_000);
    setInterval(() => this.check(), SIX_HOURS).unref();
  }

  check() {
    if (this.info.status === "dev") return;
    autoUpdater.checkForUpdates().catch((e) => this.set({ status: "error", message: String(e?.message ?? e).slice(0, 200) }));
  }

  install() {
    if (this.info.status === "ready") autoUpdater.quitAndInstall(true, true);
  }

  private set(change: Partial<UpdateInfo>) {
    this.info = { ...this.info, ...change };
    this.emit(this.info);
  }
}
