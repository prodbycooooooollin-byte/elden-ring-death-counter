import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown, History, Minus, Plus, ScrollText, Skull, Swords, UserRound } from "lucide-react";
import emblem from "../assets/emblem.png";
import { Badge, Button, Dialog, Input, Kbd, Panel, PanelHeader, Select } from "@/components/ui";
import { RollingNumber } from "@/components/RollingNumber";
import { useAction, useAppState } from "@/lib/store";
import { clock, duration, nf, playtime } from "@/lib/utils";
import type { State } from "../../../shared/types";

function useNow() {
  const [now, setNow] = React.useState(Date.now() / 1000);
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ------------------------------------------------------------------ Hero */

function Hero({ state }: { state: State }) {
  const run = useAction();
  const now = useNow();
  const total = state.counts.total;
  const previous = React.useRef(total);
  const [pulse, setPulse] = React.useState(0);
  React.useEffect(() => {
    if (total > previous.current) setPulse((p) => p + 1);
    previous.current = total;
  }, [total]);
  const started = state.session.started;
  const rate = state.counts.session / Math.max((now - started) / 3600, 1 / 6);

  return (
    <Panel className="overflow-hidden p-0">
      {/* aura behind the emblem, flares red on every death */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(217,181,106,.22),transparent)]" />
      <AnimatePresence>
        {pulse > 0 && (
          <motion.div
            key={pulse}
            className="pointer-events-none absolute -top-24 -left-24 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(229,83,61,.45),transparent)]"
            initial={{ opacity: 0.9, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.25 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-8 p-8">
        <motion.img
          src={emblem} alt="" className="size-36 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,.7)]"
          animate={pulse ? { rotate: [0, -4, 3, 0], scale: [1, 1.05, 1] } : {}}
          key={`emblem-${pulse}`}
          transition={{ duration: 0.6 }}
        />
        <div>
          <div className="text-[13px] font-semibold tracking-[0.18em] text-gold uppercase">Tode insgesamt</div>
          <RollingNumber value={total} className="gold-text mt-1 text-[132px] font-semibold" />
        </div>
        <div className="grid gap-4 self-stretch border-l border-white/[0.07] py-2 pl-8">
          <Stat label="Diese Session" value={<RollingNumber value={state.counts.session} className="text-[44px] font-semibold text-bone" />} />
          <div className="grid grid-cols-2 gap-6">
            <Stat label="Pro Stunde" value={<span className="numerals text-2xl font-semibold text-bone">{rate.toFixed(1).replace(".", ",")}</span>} />
            <Stat label="Session" value={<span className="numerals text-2xl font-semibold text-bone">{duration(now - started)}</span>} />
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-3 border-t border-white/[0.06] bg-black/20 px-8 py-4">
        <Button variant="gold" size="lg" onClick={() => run({ type: "deathAdd" })}>
          <Plus /> Tod zählen <Kbd>Leertaste</Kbd>
        </Button>
        <Button size="lg" onClick={() => run({ type: "deathRemove" })}>
          <Minus /> Einen abziehen
        </Button>
        <p className="ml-auto max-w-72 text-right text-xs leading-relaxed text-bone-faint">
          Mit verbundenem Spielstand zählt die App von selbst. Die Knöpfe sind für Korrekturen.
        </p>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-bone-dim">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Character */

function CharacterCard({ state }: { state: State }) {
  const run = useAction();
  const s = state.save;
  const c = s.character;
  const options = [
    { value: "auto", label: "Automatisch", hint: "Folgt dem Charakter, den du spielst" },
    ...s.characters.map((ch) => ({ value: String(ch.slot), label: ch.name, hint: `Slot ${ch.slot}, Stufe ${ch.level}` })),
  ];
  return (
    <Panel>
      <PanelHeader title="Charakter" icon={<UserRound />} aside={s.status === "watching" ? <Badge tone="live">Live</Badge> : s.status === "error" ? <Badge tone="ember">Lesefehler</Badge> : <Badge tone="gold">Sucht</Badge>} />
      <div className="px-5 pb-5">
        {c ? (
          <>
            <div className="font-display text-[32px] leading-tight font-semibold text-bone">{c.name}</div>
            <div className="mt-1 flex gap-4 text-sm text-bone-dim">
              <span>Stufe <b className="font-semibold text-bone">{c.level}</b></span>
              <span>{playtime(c.playtime)}</span>
            </div>
          </>
        ) : (
          <div className="py-1">
            <div className="font-display text-2xl font-semibold text-bone">{s.status === "error" ? "Spielstand nicht lesbar" : "Warte auf Elden Ring"}</div>
            <p className="mt-1.5 text-sm text-bone-dim">
              {s.status === "error"
                ? `${s.message} Der letzte Stand bleibt sichtbar.`
                : "Sobald das Spiel speichert, verbindet sich die App von selbst. Bis dahin zählst du von Hand."}
            </p>
          </div>
        )}
        {s.characters.length > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-bone-faint">Gezählt wird</span>
            <Select
              label="Charakter wählen"
              value={s.slotPinned && s.slot ? String(s.slot) : "auto"}
              options={options}
              onChange={(v) => run({ type: "slotSet", slot: v === "auto" ? null : Number(v) })}
            />
          </div>
        )}
        {s.updated && s.status === "watching" && (
          <div className="mt-4 text-xs text-bone-faint">Spielstand gelesen um {clock(s.updated)}</div>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Boss */

function BossPicker({ open, onOpenChange, state }: { open: boolean; onOpenChange: (v: boolean) => void; state: State }) {
  const run = useAction();
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const list = state.bosses
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.region.toLowerCase().includes(q))
    .sort((a, b) => Number(a.felled) - Number(b.felled));
  const pick = async (id: string) => {
    await run({ type: "bossSet", id });
    onOpenChange(false);
  };
  const create = async () => {
    if (await run({ type: "bossAdd", name: query, select: true }, `${query.trim()} angelegt`)) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setQuery(""); }} title="Gegner wählen" description="Jeder Tod zählt zusätzlich für diesen Gegner.">
      <Input autoFocus placeholder="Suchen oder neu anlegen …" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (list[0]) pick(list[0].id);
          else if (q) create();
        }} />
      <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl bg-black/20 p-1">
        {q && !state.bosses.some((b) => b.name.toLowerCase() === q) && (
          <button onClick={create} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-gold-bright hover:bg-gold/10">
            <Plus className="size-4" /> „{query.trim()}“ anlegen
          </button>
        )}
        {list.map((b) => (
          <button key={b.id} onClick={() => pick(b.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.06]">
            <span className={b.felled ? "text-bone-faint" : "text-bone"}>
              <span className="text-sm">{b.name}</span>
              {b.region && <span className="ml-2 text-xs text-bone-faint">{b.region}</span>}
            </span>
            <span className="text-xs text-bone-faint">{b.felled ? "gefällt" : `${b.deaths} Tode`}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function BossCard({ state }: { state: State }) {
  const run = useAction();
  const [open, setOpen] = React.useState(false);
  const boss = state.bosses.find((b) => b.id === state.currentBoss);
  return (
    <Panel>
      <PanelHeader title="Aktueller Gegner" icon={<Swords />} aside={boss?.great ? <Badge tone="gold"><Crown className="size-3" /> Großer Feind</Badge> : null} />
      <div className="px-5 pb-5">
        {boss ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate font-display text-[28px] leading-tight font-semibold text-bone">{boss.name}</div>
                {boss.region && <div className="text-sm text-bone-dim italic">{boss.region}</div>}
              </div>
              <div className="text-right">
                <RollingNumber value={boss.deaths} className="text-[44px] font-semibold text-ember-soft" />
                <div className="text-xs text-bone-faint">Versuche</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="gold" size="sm" onClick={() => run({ type: "bossFelled" }, `${boss.name} gefällt`)}><Skull /> Gefällt <Kbd>F</Kbd></Button>
              <Button size="sm" onClick={() => setOpen(true)}>Wechseln</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-bone-dim">Kein Gegner gewählt. Mit Gegner siehst du, wie oft du an ihm gescheitert bist.</p>
            <Button className="mt-4" size="sm" onClick={() => setOpen(true)}><Swords /> Gegner wählen</Button>
          </>
        )}
      </div>
      <BossPicker open={open} onOpenChange={setOpen} state={state} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ Chronicle */

function Chronicle({ state }: { state: State }) {
  const run = useAction();
  const entries = [...state.session.log].reverse();
  return (
    <Panel className="flex min-h-0 flex-col">
      <PanelHeader title="Chronik dieser Session" icon={<ScrollText />} aside={<span className="text-xs text-bone-faint">{nf.format(state.counts.session)} Tode</span>} />
      <div className="max-h-[300px] min-h-[120px] flex-1 overflow-y-auto px-2 pb-2">
        {entries.length === 0 && <div className="px-3 py-6 text-center text-sm text-bone-faint">Noch kein Tod in dieser Session.</div>}
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.div
              key={`${e.t}-${e.amount}`}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/[0.03]"
            >
              <span className="w-11 text-xs tabular-nums text-bone-faint">{clock(e.t)}</span>
              <span className={e.amount > 0 ? "w-8 font-semibold text-ember-soft tabular-nums" : "w-8 font-semibold text-bone-faint tabular-nums"}>
                {e.amount > 0 ? `+${e.amount}` : `−${-e.amount}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-bone">{e.amount < 0 ? "Korrektur" : e.boss ?? "Unterwegs"}</span>
              <span className="text-[11px] text-bone-faint">{e.source === "save" ? "Spielstand" : "von Hand"}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="border-t border-white/[0.06] px-5 py-3">
        <Button variant="ghost" size="sm" onClick={() => run({ type: "sessionNew" }, "Neue Session gestartet")}><History /> Neue Session starten</Button>
      </div>
    </Panel>
  );
}

export function StreamView() {
  const state = useAppState()!;
  return (
    <div className="grid gap-5">
      <Hero state={state} />
      <div className="grid grid-cols-2 gap-5">
        <div className="grid content-start gap-5">
          <CharacterCard state={state} />
          <BossCard state={state} />
        </div>
        <Chronicle state={state} />
      </div>
    </div>
  );
}
