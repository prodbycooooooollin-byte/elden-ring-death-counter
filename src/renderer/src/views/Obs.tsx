import * as React from "react";
import { Copy, Eye, FolderOpen, LayoutTemplate, MonitorPlay, SlidersHorizontal } from "lucide-react";
import { Button, Input, Panel, PanelHeader, Row, Segmented, Slider, Switch } from "@/components/ui";
import { useAction, useAppState, useInfo, useToast } from "@/lib/store";
import { api } from "@/lib/utils";
import type { Layout, Position, Settings } from "../../../shared/types";

type Patch = { overlay: Partial<Settings["overlay"]> };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-bright">{n}</span>
      <span className="pt-0.5 text-sm text-bone-dim">{children}</span>
    </li>
  );
}

export function ObsView() {
  const state = useAppState()!;
  const info = useInfo();
  const toast = useToast();
  const run = useAction();
  const o = state.settings.overlay;
  const set = (patch: Patch["overlay"]) => run({ type: "settings", patch: { overlay: patch } });
  const [backdrop, setBackdrop] = React.useState<"light" | "dark">("light");
  const [label, setLabel] = React.useState(o.label);
  React.useEffect(() => setLabel(o.label), [o.label]);
  const url = info?.overlayUrl ?? "";

  const copy = async () => {
    await api.copy(url);
    toast("Adresse kopiert");
  };

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-4xl font-semibold text-bone">OBS-Overlay</h1>
        <p className="mt-1 text-sm text-bone-dim">So sehen deine Zuschauer den Zähler. Änderungen erscheinen sofort im Stream.</p>
      </div>

      <Panel>
        <PanelHeader title="In OBS einbinden" icon={<MonitorPlay />} />
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-5">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-[13px] text-gold-bright" aria-label="Overlay-Adresse" />
          <Button variant="gold" onClick={copy}><Copy /> Adresse kopieren</Button>
        </div>
        <ol className="grid gap-2.5 px-5 pt-4 pb-5">
          <Step n={1}>In OBS bei <b className="text-bone">Quellen</b> auf <b className="text-bone">+</b> klicken und <b className="text-bone">Browser</b> wählen.</Step>
          <Step n={2}>Die Adresse bei <b className="text-bone">URL</b> einfügen, Breite <b className="text-bone">1920</b>, Höhe <b className="text-bone">1080</b>.</Step>
          <Step n={3}>Fertig. Der Hintergrund ist durchsichtig. Die App muss während des Streams laufen, auch minimiert im Infobereich.</Step>
        </ol>
      </Panel>

      <div className="grid grid-cols-[1.05fr_1fr] items-start gap-5">
        <div className="grid gap-5">
          <Panel>
            <PanelHeader title="Darstellung" icon={<LayoutTemplate />} />
            <Row label="Stil">
              <Segmented<Layout> label="Stil" value={o.layout} onChange={(layout) => set({ layout })}
                options={[{ value: "emblem", label: "Emblem" }, { value: "hud", label: "Leiste" }, { value: "compact", label: "Kompakt" }, { value: "bossbar", label: "Bossbalken" }]} />
            </Row>
            <Row label="Position" hint="Oben links liegen im Spiel die Lebensleisten">
              <Segmented<Position> label="Position" value={o.position} onChange={(position) => set({ position })}
                options={[{ value: "tl", label: "↖" }, { value: "tr", label: "↗" }, { value: "bl", label: "↙" }, { value: "br", label: "↘" }]} />
            </Row>
            <Row label="Größe">
              <Slider label="Größe" value={o.scale} min={40} max={250} step={5} onCommit={(scale) => set({ scale })} format={(v) => `${v} %`} />
            </Row>
            <Row label="Schatten" hint="Dunkler Hof hinter der Zahl für helle Szenen">
              <Slider label="Schatten" value={o.backdrop} min={0} max={100} step={5} onCommit={(backdrop) => set({ backdrop })} format={(v) => `${v} %`} />
            </Row>
            <Row label="Beschriftung" hint="Leer lassen für „Tode“ bzw. „Deaths“">
              <Input className="w-40" value={label} maxLength={24} placeholder="Tode"
                onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== o.label && set({ label })}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </Row>
            <Row label="Emblem">
              <Switch label="Emblem" checked={o.showIcon} onCheckedChange={(showIcon) => set({ showIcon })} />
            </Row>
          </Panel>

          <Panel>
            <PanelHeader title="Zusätzliche Werte" icon={<SlidersHorizontal />} />
            <Row label="Tode dieser Session"><Switch label="Tode dieser Session" checked={o.showSession} onCheckedChange={(showSession) => set({ showSession })} /></Row>
            <Row label="Aktueller Gegner"><Switch label="Aktueller Gegner" checked={o.showBoss} onCheckedChange={(showBoss) => set({ showBoss })} /></Row>
            <Row label="Tode pro Stunde"><Switch label="Tode pro Stunde" checked={o.showRate} onCheckedChange={(showRate) => set({ showRate })} /></Row>
            <Row label="Laufzeit der Session"><Switch label="Laufzeit der Session" checked={o.showTimer} onCheckedChange={(showTimer) => set({ showTimer })} /></Row>
          </Panel>
        </div>

        <div className="sticky top-0 grid gap-5">
          <Panel className="overflow-hidden">
            <PanelHeader title="Vorschau" icon={<Eye />} aside={
              <Segmented<"light" | "dark"> label="Vorschau-Hintergrund" value={backdrop} onChange={setBackdrop}
                options={[{ value: "light", label: "Hell" }, { value: "dark", label: "Dunkel" }]} />
            } />
            <div className="mx-5 mb-5 aspect-video overflow-hidden rounded-xl ring-1 ring-white/10">
              {url && <iframe key={backdrop} title="Overlay-Vorschau" src={`${url}?bg=${backdrop}`} className="pointer-events-none size-full border-0" />}
            </div>
          </Panel>
          <Panel className="p-5">
            <div className="text-sm text-bone">Textquellen für OBS</div>
            <p className="mt-1 text-xs text-bone-faint">Für „Text (GDI+)“-Quellen schreibt die App die Zahlen zusätzlich in Textdateien.</p>
            <Button className="mt-3" size="sm" onClick={() => api.openPath("obsText")}><FolderOpen /> Ordner öffnen</Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
