export type Layout = "emblem" | "hud" | "compact" | "bossbar";
export type Position = "tl" | "tr" | "bl" | "br";
export type SaveStatus = "idle" | "searching" | "watching" | "error";

export interface Settings {
  language: "de" | "en";
  overlay: {
    layout: Layout;
    position: Position;
    scale: number;
    backdrop: number;
    label: string;
    showSession: boolean;
    showBoss: boolean;
    showRate: boolean;
    showTimer: boolean;
    showIcon: boolean;
  };
  session: { resetOnStart: boolean };
  updates: { autoInstall: boolean };
}

export interface Boss {
  id: string;
  name: string;
  great: boolean;
  region: string;
  deaths: number;
  felled: boolean;
  felledAt: number | null;
}

export interface LogEntry {
  t: number;
  amount: number;
  source: "save" | "manual";
  boss: string | null;
}

export interface CharacterInfo {
  slot: number;
  name: string;
  level: number;
  playtime: number;
}

export interface State {
  settings: Settings;
  counts: { total: number; session: number };
  session: { started: number; log: LogEntry[] };
  bosses: Boss[];
  currentBoss: string | null;
  save: {
    path: string | null;
    file: string | null;
    slot: number | null;
    slotPinned: boolean;
    status: SaveStatus;
    message: string;
    characters: CharacterInfo[];
    character: CharacterInfo | null;
    updated: number | null;
  };
  serverTime: number;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type Action =
  | { type: "deathAdd"; amount?: number }
  | { type: "deathRemove" }
  | { type: "setTotal"; value: number }
  | { type: "sessionNew" }
  | { type: "bossSet"; id: string | null }
  | { type: "bossAdd"; name: string; region?: string; great?: boolean; select?: boolean }
  | { type: "bossUpdate"; id: string; name?: string; region?: string; great?: boolean; deaths?: number }
  | { type: "bossRemove"; id: string }
  | { type: "bossFelled"; id?: string }
  | { type: "bossRevive"; id: string }
  | { type: "bossesReset" }
  | { type: "settings"; patch: DeepPartial<Settings> }
  | { type: "settingsReset" }
  | { type: "slotSet"; slot: number | null };

export interface UpdateInfo {
  current: string;
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "latest" | "error" | "dev";
  latest: string | null;
  progress: number;
  message: string;
}

export interface AppInfo {
  version: string;
  overlayUrl: string;
  obsTextDir: string;
}

export interface DeathCounterApi {
  getState(): Promise<State>;
  getInfo(): Promise<AppInfo>;
  action(action: Action): Promise<{ ok: true } | { ok: false; error: string }>;
  onState(fn: (state: State) => void): () => void;
  onUpdate(fn: (info: UpdateInfo) => void): () => void;
  update(command: "check" | "install"): Promise<void>;
  copy(text: string): Promise<void>;
  openPath(which: "obsText" | "data"): Promise<void>;
  window(command: "minimize" | "maximize" | "close"): Promise<void>;
}
