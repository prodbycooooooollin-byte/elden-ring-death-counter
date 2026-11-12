import * as React from "react";
import { CloudDownload, Copy, Gauge, Keyboard, Languages, RefreshCw, RotateCcw } from "lucide-react";
import { Badge, Button, Dialog, Input, Panel, PanelHeader, Row, Segmented, Switch } from "@/components/ui";
import { useAction, useAppState, useInfo, useToast, useUpdate } from "@/lib/store";
import { api } from "@/lib/utils";

function UpdatePanel() {
  const update = useUpdate();
  const info = useInfo();
  const state = useAppState()!;
  const run = useAction();
  const status = update?.status ?? "idle";
  const text = {
    idle: "Noch nicht geprüft",
    checking: "Suche nach Updates …",
    available: `Version ${update?.latest} wird geladen …`,
    downloading: `Lädt Version ${update?.latest} … ${update?.progress ?? 0} %`,
    ready: `Version ${update?.latest} ist bereit`,
    latest: "Du hast die neueste Version",
    error: `Prüfung fehlgeschlagen: ${update?.message}`,
    dev: "In der Entwicklungsversion abgeschaltet",
  }[status];
  return (
    <Panel>
      <PanelHeader title="Updates" icon={<CloudDownload />} aside={<Badge>Version {info?.version}</Badge>} />
      <Row label={text} hint={status === "ready" ? "Wird beim Beenden installiert, oder jetzt mit Neustart." : undefined}>
        {status === "ready"
          ? <Button variant="gold" size="sm" onClick={() => api.update("install")}>Jetzt neu starten</Button>
          : <Button size="sm" onClick={() => api.update("check")} disabled={status === "checking" || status === "downloading"}><RefreshCw /> Prüfen</Button>}
      </Row>
      {status === "downloading" && (
        <div className="mx-5 mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full bg-[linear-gradient(90deg,#8a6a2e,#e6c47e)] transition-[width]" style={{ width: `${update?.progress ?? 0}%` }} />
        </div>
      )}
      <Row label="Beim Start automatisch installieren" hint="Spätere Updates warten, bis du die App beendest, damit kein Stream unterbrochen wird.">
        <Switch label="Beim Start automatisch installieren" checked={state.settings.updates.autoInstall}
          onCheckedChange={(autoInstall) => run({ type: "settings", patch: { updates: { autoInstall } } })} />
      </Row>
    </Panel>
  );
}

function QuickRow({ label, path }: { label: string; path: string }) {
  const toast = useToast();
  const url = `http://127.0.0.1:8737/api/quick/${path}`;
  return (
    <Row label={label}>
      <Input readOnly value={url} className="w-80 font-mono text-xs text-bone-dim" onFocus={(e) => e.target.select()} aria-label={label} />
      <Button size="icon" variant="ghost" aria-label={`${label} kopieren`} onClick={async () => { await api.copy(url); toast("Adresse kopiert"); }}><Copy /></Button>
    </Row>
  );
}

export function SettingsView() {
  const state = useAppState()!;
  const run = useAction();
  const [confirm, setConfirm] = React.useState(false);
  const [total, setTotal] = React.useState(String(state.counts.total));
  React.useEffect(() => setTotal(String(state.counts.total)), [state.counts.total]);

  return (
    <div className="grid gap-5">
      <h1 className="font-display text-4xl font-semibold text-bone">Einstellungen</h1>

      <UpdatePanel />

      <Panel>
        <PanelHeader title="Allgemein" icon={<Languages />} />
        <Row label="Sprache im Overlay" hint="Für alles, was Zuschauer sehen">
          <Segmented<"de" | "en"> label="Sprache" value={state.settings.language} onChange={(language) => run({ type: "settings", patch: { language } })}
            options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} />
        </Row>
        <Row label="Session beim Start neu beginnen" hint="Aus: Session und Chronik laufen nach einem Neustart weiter">
          <Switch label="Session beim Start neu beginnen" checked={state.settings.session.resetOnStart}
            onCheckedChange={(resetOnStart) => run({ type: "settings", patch: { session: { resetOnStart } } })} />
        </Row>
      </Panel>

      <Panel>
        <PanelHeader title="Gesamtstand korrigieren" icon={<Gauge />} />
        <Row label="Gesamtstand" hint="Nur nötig ohne Spielstand. Mit Spielstand zählt die App von selbst weiter.">
          <Input type="number" min={0} className="w-28 text-right" value={total} onChange={(e) => setTotal(e.target.value)} aria-label="Gesamtstand" />
          <Button size="sm" onClick={() => run({ type: "setTotal", value: Number(total) }, "Gesamtstand gesetzt")}>Setzen</Button>
        </Row>
      </Panel>

      <Panel>
        <PanelHeader title="Stream Deck" icon={<Keyboard />} />
        <p className="px-5 pb-2 text-xs text-bone-faint">Aktion „Website“ mit „Im Hintergrund abrufen“. Jeder Aufruf löst die Aktion aus.</p>
        <QuickRow label="Tod zählen" path="add" />
        <QuickRow label="Einen abziehen" path="undo" />
        <QuickRow label="Gegner gefällt" path="felled" />
        <QuickRow label="Neue Session" path="session" />
      </Panel>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><RotateCcw /> Einstellungen zurücksetzen</Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm} title="Einstellungen zurücksetzen?" description="Zähler, Bosse und Spielstand bleiben unverändert.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Abbrechen</Button>
          <Button variant="danger" onClick={async () => { await run({ type: "settingsReset" }, "Einstellungen zurückgesetzt"); setConfirm(false); }}>Zurücksetzen</Button>
        </div>
      </Dialog>
    </div>
  );
}
