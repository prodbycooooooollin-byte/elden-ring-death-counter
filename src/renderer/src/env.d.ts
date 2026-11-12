import type { DeathCounterApi } from "../../shared/types";

declare global {
  interface Window {
    deathCounter: DeathCounterApi;
  }
}

export {};
