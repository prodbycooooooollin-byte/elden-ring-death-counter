import * as React from "react";
import { motion } from "motion/react";
import { Crown, Pencil, Plus, RotateCcw, Search, Skull, Trash2, Undo2 } from "lucide-react";
import { Badge, Button, Dialog, Input, Panel, Segmented, Switch, Tip } from "@/components/ui";
import { useAction, useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Boss } from "../../../shared/types";

type Filter = "all" | "open" | "felled";

function BossForm({ boss, onDone }: { boss?: Boss; onDone: () => void }) {
  const run = useAction();
  const [name, setName] = React.useState(boss?.name ?? "");
  const [region, setRegion] = React.useState(boss?.region ?? "");
  const [great, setGreat] = React.useState(boss?.great ?? false);
  const [deaths, setDeaths] = React.useState(String(boss?.deaths ?? 0));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = boss
      ? await run({ type: "bossUpdate", id: boss.id, name, region, great, deaths: Number(deaths) || 0 }, "Gespeichert")
      : await run({ type: "bossAdd", name, region, great }, `${name.trim()} hinzugefügt`);
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-1.5 text-xs text-bone-dim">Name<Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
      <label className="grid gap-1.5 text-xs text-bone-dim">Gebiet<Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={60} placeholder="optional" /></label>
      {boss && <label className="grid gap-1.5 text-xs text-bone-dim">Versuche<Input type="number" min={0} value={deaths} onChange={(e) => setDeaths(e.target.value)} className="w-32" /></label>}
      <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
        <div>
          <div className="text-sm text-bone">Großer Feind</div>
          <div className="text-xs text-bone-faint">Erinnerungsbosse wie Godrick oder Malenia</div>
        </div>
        <Switch label="Großer Feind" checked={great} onCheckedChange={setGreat} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Abbrechen</Button>
        <Button type="submit" variant="gold">{boss ? "Speichern" : "Hinzufügen"}</Button>
      </div>
    </form>
  );
}

export function BossesView() {
  const state = useAppState()!;
  const run = useAction();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<Boss | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);

  const q = query.trim().toLowerCase();
  const max = Math.max(1, ...state.bosses.map((b) => b.deaths));
  const list = state.bosses.filter((b) =>
    (filter === "all" || (filter === "felled") === b.felled) && (!q || b.name.toLowerCase().includes(q) || b.region.toLowerCase().includes(q)));
  const felled = state.bosses.filter((b) => b.felled).length;

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-bone">Bosse</h1>
          <p className="mt-1 text-sm text-bone-dim">{felled} von {state.bosses.length} gefällt. Der aktive Gegner bekommt jeden Tod angerechnet.</p>
        </div>
        <Button variant="gold" onClick={() => setAdding(true)}><Plus /> Gegner hinzufügen</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-bone-faint" />
          <Input className="pl-9" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Gegner suchen" />
        </div>
        <Segmented<Filter> label="Filter" value={filter} onChange={setFilter}
          options={[{ value: "all", label: "Alle" }, { value: "open", label: "Offen" }, { value: "felled", label: "Gefällt" }]} />
      </div>

      <Panel className="p-2">
        {list.length === 0 && <div className="px-4 py-10 text-center text-sm text-bone-faint">Kein Gegner passt zu Suche und Filter.</div>}
        {list.map((b) => {
          const current = state.currentBoss === b.id;
          return (
            <motion.div
              layout key={b.id}
              className={cn("group grid grid-cols-[1fr_200px_auto] items-center gap-5 rounded-xl px-4 py-3",
                current ? "bg-[linear-gradient(90deg,rgba(217,181,106,.14),rgba(217,181,106,.03))] ring-1 ring-gold/20" : "hover:bg-white/[0.03]")}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-[15px] font-medium", b.felled ? "text-bone-faint line-through decoration-white/20" : "text-bone")}>{b.name}</span>
                  {b.great && <Crown className="size-3.5 shrink-0 text-gold" aria-label="Großer Feind" />}
                  {current && <Badge tone="gold">Aktiv</Badge>}
                  {b.felled && <Badge tone="live">Gefällt</Badge>}
                </div>
                {b.region && <div className="text-xs text-bone-faint italic">{b.region}</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className="numerals w-10 text-right text-xl font-semibold text-bone">{b.deaths}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#7a1f14,#e5533d)]" initial={false} animate={{ width: `${(b.deaths / max) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                {b.felled ? (
                  <Button size="sm" variant="ghost" onClick={() => run({ type: "bossRevive", id: b.id })}><Undo2 /> Wieder öffnen</Button>
                ) : current ? (
                  <Button size="sm" variant="gold" onClick={() => run({ type: "bossFelled", id: b.id }, `${b.name} gefällt`)}><Skull /> Gefällt</Button>
                ) : (
                  <Button size="sm" onClick={() => run({ type: "bossSet", id: b.id })}>Wählen</Button>
                )}
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Tip text="Bearbeiten"><Button size="icon" variant="ghost" aria-label={`${b.name} bearbeiten`} onClick={() => setEditing(b)}><Pencil /></Button></Tip>
                  <Tip text="Entfernen"><Button size="icon" variant="ghost" aria-label={`${b.name} entfernen`} onClick={() => run({ type: "bossRemove", id: b.id }, `${b.name} entfernt`)}><Trash2 /></Button></Tip>
                </div>
              </div>
            </motion.div>
          );
        })}
      </Panel>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}><RotateCcw /> Alle Bosszähler zurücksetzen</Button>
      </div>

      <Dialog open={adding} onOpenChange={setAdding} title="Gegner hinzufügen">
        <BossForm onDone={() => setAdding(false)} />
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title="Gegner bearbeiten">
        {editing && <BossForm boss={editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset} title="Bosszähler zurücksetzen?" description="Alle Versuche gehen auf null und alle Gegner werden wieder offen. Der Gesamtstand bleibt.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>Abbrechen</Button>
          <Button variant="danger" onClick={async () => { await run({ type: "bossesReset" }, "Bosszähler zurückgesetzt"); setConfirmReset(false); }}>Zurücksetzen</Button>
        </div>
      </Dialog>
    </div>
  );
}
