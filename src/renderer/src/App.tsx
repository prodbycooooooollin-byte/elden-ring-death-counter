import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, MonitorPlay, Settings2, Swords } from "lucide-react";
import emblem from "./assets/emblem.png";
import { useAction, useAppState } from "./lib/store";
import { cn } from "./lib/utils";
import { StreamView } from "./views/Stream";
import { ObsView } from "./views/Obs";
import { BossesView } from "./views/Bosses";
import { SettingsView } from "./views/Settings";

const VIEWS = [
  { id: "stream", label: "Stream", icon: Activity, view: StreamView },
  { id: "obs", label: "OBS-Overlay", icon: MonitorPlay, view: ObsView },
  { id: "bosses", label: "Bosse", icon: Swords, view: BossesView },
  { id: "settings", label: "Einstellungen", icon: Settings2, view: SettingsView },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function LiveStatus() {
  const state = useAppState();
  const status = state?.save.status ?? "idle";
  const look = {
    watching: { text: "Live", dot: "bg-grace", ring: "shadow-[0_0_0_4px_rgba(127,191,142,.18)]", tone: "text-grace" },
    searching: { text: "Sucht Spielstand", dot: "bg-gold", ring: "", tone: "text-gold" },
    error: { text: "Lesefehler", dot: "bg-ember", ring: "", tone: "text-ember-soft" },
    idle: { text: "Startet", dot: "bg-bone-faint", ring: "", tone: "text-bone-dim" },
  }[status];
  return (
    <div className={cn("flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-xs font-semibold", look.tone)}>
      <span className={cn("size-2 rounded-full", look.dot, look.ring, status === "watching" && "animate-pulse")} />
      {look.text}
    </div>
  );
}

export function App() {
  const [view, setView] = React.useState<ViewId>(() => {
    const fromHash = location.hash.slice(1);
    return (VIEWS.some((v) => v.id === fromHash) ? fromHash : "stream") as ViewId;
  });
  const run = useAction();
  const state = useAppState();
  const Current = VIEWS.find((v) => v.id === view)!.view;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (target.closest("input, textarea, [role=dialog], [role=listbox]")) return;
      if (/^[1-4]$/.test(event.key)) return setView(VIEWS[Number(event.key) - 1].id);
      if (event.code === "Space" && target.closest("button, [role=switch], [role=slider], [role=radio]")) return;
      if (event.code === "Space" || event.key === "+") { event.preventDefault(); run({ type: "deathAdd" }); }
      else if (event.key === "-" || event.key === "Backspace") { event.preventDefault(); run({ type: "deathRemove" }); }
      else if (event.key.toLowerCase() === "f" && state?.currentBoss) run({ type: "bossFelled" }, "Gegner gefällt");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, state?.currentBoss]);

  return (
    <div className="relative grid h-full grid-cols-[232px_1fr] grid-rows-[44px_1fr]">
      <div className="atmosphere" />

      {/* Title bar (window buttons are drawn by Windows on the right) */}
      <header className="drag relative z-10 col-span-2 flex items-center gap-3 border-b border-white/[0.05] pr-[150px] pl-4">
        <img src={emblem} alt="" className="size-6 object-contain" />
        <span className="font-display text-lg font-semibold tracking-wide text-bone">Death Counter</span>
        <div className="ml-auto no-drag"><LiveStatus /></div>
      </header>

      <nav className="relative z-10 flex flex-col gap-1 border-r border-white/[0.05] p-3" aria-label="Bereiche">
        {VIEWS.map((v, i) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "text-bone" : "text-bone-dim hover:bg-white/[0.04] hover:text-bone",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-gold/20 bg-[linear-gradient(90deg,rgba(217,181,106,.16),rgba(217,181,106,.04))]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <v.icon className={cn("relative size-[18px]", active ? "text-gold" : "text-bone-faint group-hover:text-bone-dim")} />
              <span className="relative">{v.label}</span>
              <span className="relative ml-auto text-[11px] text-bone-faint">{i + 1}</span>
            </button>
          );
        })}
        <div className="mt-auto px-3 pb-1 text-[11px] leading-relaxed text-bone-faint">
          <span className="text-bone-dim">Leertaste</span> Tod zählen<br />
          <span className="text-bone-dim">−</span> korrigieren · <span className="text-bone-dim">F</span> gefällt
        </div>
      </nav>

      <main className="relative z-10 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mx-auto max-w-[1100px] p-7"
          >
            {state ? <Current /> : <div className="p-10 text-bone-dim">Lädt …</div>}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
