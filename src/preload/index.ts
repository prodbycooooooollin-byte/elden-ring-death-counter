import { contextBridge, ipcRenderer } from "electron";
import type { DeathCounterApi, State, UpdateInfo } from "../shared/types";

const api: DeathCounterApi = {
  getState: () => ipcRenderer.invoke("state"),
  getInfo: () => ipcRenderer.invoke("info"),
  action: (action) => ipcRenderer.invoke("action", action),
  onState(fn) {
    const listener = (_: unknown, state: State) => fn(state);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
  onUpdate(fn) {
    const listener = (_: unknown, info: UpdateInfo) => fn(info);
    ipcRenderer.on("update", listener);
    ipcRenderer.invoke("update-info").then(fn);
    return () => ipcRenderer.removeListener("update", listener);
  },
  update: (command) => ipcRenderer.invoke("update", command),
  copy: (text) => ipcRenderer.invoke("copy", text),
  openPath: (which) => ipcRenderer.invoke("open-path", which),
  window: (command) => ipcRenderer.invoke("window", command),
};

contextBridge.exposeInMainWorld("deathCounter", api);
