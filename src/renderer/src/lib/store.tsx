import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Action, AppInfo, State, UpdateInfo } from "../../../shared/types";
import { api } from "./utils";

const StateContext = React.createContext<State | null>(null);
const InfoContext = React.createContext<AppInfo | null>(null);
const UpdateContext = React.createContext<UpdateInfo | null>(null);
const ToastContext = React.createContext<(message: string, tone?: "ok" | "error") => void>(() => {});

export const useAppState = () => React.useContext(StateContext);
export const useInfo = () => React.useContext(InfoContext);
export const useUpdate = () => React.useContext(UpdateContext);
export const useToast = () => React.useContext(ToastContext);

/** Dispatch an action; errors and optional success text appear as toasts. */
export function useAction() {
  const toast = useToast();
  return React.useCallback(async (action: Action, success?: string) => {
    const result = await api.action(action);
    if (!result.ok) toast(result.error, "error");
    else if (success) toast(success);
    return result.ok;
  }, [toast]);
}

interface Toast { id: number; message: string; tone: "ok" | "error" }

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State | null>(null);
  const [info, setInfo] = React.useState<AppInfo | null>(null);
  const [update, setUpdate] = React.useState<UpdateInfo | null>(null);
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    api.getState().then(setState);
    api.getInfo().then(setInfo);
    const offState = api.onState(setState);
    const offUpdate = api.onUpdate(setUpdate);
    return () => { offState(); offUpdate(); };
  }, []);

  const toast = React.useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <InfoContext.Provider value={info}>
      <UpdateContext.Provider value={update}>
        <ToastContext.Provider value={toast}>
          <StateContext.Provider value={state}>
            {children}
            <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
              <AnimatePresence>
                {toasts.map((t) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    className={t.tone === "error"
                      ? "rounded-xl border border-ember/30 bg-[#2a1310]/95 px-4 py-2.5 text-sm text-ember-soft shadow-2xl backdrop-blur-xl"
                      : "rounded-xl border border-white/10 bg-ash-800/95 px-4 py-2.5 text-sm text-bone shadow-2xl backdrop-blur-xl"}
                  >
                    {t.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </StateContext.Provider>
        </ToastContext.Provider>
      </UpdateContext.Provider>
    </InfoContext.Provider>
  );
}
