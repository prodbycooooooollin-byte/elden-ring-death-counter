// UI kit in the shadcn/ui manner: Radix primitives styled with Tailwind, variants via cva.
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  "no-drag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        gold:
          "text-[#1d1408] bg-[linear-gradient(180deg,#f6dea0,#d9b56a_55%,#b38a45)] shadow-[0_1px_0_rgba(255,255,255,.45)_inset,0_10px_30px_-10px_rgba(217,181,106,.6)] hover:brightness-110",
        glass: "text-bone bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.14]",
        ghost: "text-bone-dim hover:text-bone hover:bg-white/[0.06]",
        danger: "text-ember-soft bg-ember/10 border border-ember/25 hover:bg-ember/20",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-lg",
        md: "h-10 px-4 text-sm rounded-xl",
        lg: "h-14 px-7 text-[17px] rounded-2xl",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded-md border border-current/20 bg-black/10 px-1.5 py-px font-sans text-[11px] font-medium opacity-70", className)}>
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ Panel */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel", className)} {...props} />;
}

export function PanelHeader({ title, icon, aside }: { title: string; icon?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5 text-[13px] font-semibold tracking-wide text-bone-dim [&_svg]:size-4 [&_svg]:text-gold">
        {icon}
        {title}
      </div>
      {aside}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "gold" | "live" | "ember"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-white/[0.06] text-bone-dim",
    gold: "bg-gold/15 text-gold-bright",
    live: "bg-grace/15 text-grace",
    ember: "bg-ember/15 text-ember-soft",
  };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", tones[tone])}>{children}</span>;
}

/* ------------------------------------------------------------------ Settings rows */

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-6 border-t border-white/[0.06] px-5 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm text-bone">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-bone-faint">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Switch */

export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="no-drag relative h-6 w-11 cursor-pointer rounded-full bg-white/[0.12] transition-colors data-[state=checked]:bg-[linear-gradient(90deg,#b38a45,#e6c47e)]"
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-bone shadow-[0_2px_6px_rgba(0,0,0,.4)] transition-transform duration-200 data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Slider */

export function Slider({ value, min, max, step = 1, onCommit, format, label }: {
  value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; format: (v: number) => string; label: string;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex w-64 items-center gap-3">
      <SliderPrimitive.Root
        className="no-drag relative flex h-5 grow cursor-pointer touch-none items-center"
        value={[local]} min={min} max={max} step={step}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => onCommit(v)}
        aria-label={label}
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/[0.1]">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-[linear-gradient(90deg,#8a6a2e,#e6c47e)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-[18px] rounded-full border-2 border-gold-bright bg-ash-900 shadow-[0_0_0_4px_rgba(217,181,106,.15)] outline-none focus-visible:shadow-[0_0_0_6px_rgba(217,181,106,.35)]" />
      </SliderPrimitive.Root>
      <span className="w-12 text-right text-xs tabular-nums text-bone-dim">{format(local)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Segmented control */

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single" value={value} aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
      className="no-drag inline-flex rounded-xl bg-black/30 p-1 ring-1 ring-white/[0.06]"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value} value={o.value}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-bone-dim transition-colors hover:text-bone data-[state=on]:bg-white/[0.1] data-[state=on]:text-bone data-[state=on]:shadow-[0_1px_0_rgba(255,255,255,.08)_inset] [&_svg]:size-3.5"
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ------------------------------------------------------------------ Select */

export function Select({ value, options, onChange, label, className }: {
  value: string; options: { value: string; label: string; hint?: string }[]; onChange: (v: string) => void; label: string; className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn("no-drag flex h-9 min-w-44 cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-bone hover:bg-white/[0.08]", className)}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon><ChevronDown className="size-4 text-bone-dim" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-white/[0.1] bg-ash-850/95 p-1 shadow-2xl backdrop-blur-xl">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pr-3 pl-8 text-sm text-bone outline-none data-[highlighted]:bg-gold/15">
                <SelectPrimitive.ItemIndicator className="absolute left-2.5"><Check className="size-4 text-gold" /></SelectPrimitive.ItemIndicator>
                <div>
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.hint && <div className="text-xs text-bone-faint">{o.hint}</div>}
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function Dialog({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-[fade_.15s_ease-out]" />
        <DialogPrimitive.Content className="panel fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 bg-ash-900/95 p-6 shadow-2xl outline-none">
          <DialogPrimitive.Title className="font-display text-2xl font-semibold text-bone">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="mt-1.5 text-sm text-bone-dim">{description}</DialogPrimitive.Description>}
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close className="absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 text-bone-faint hover:bg-white/[0.06] hover:text-bone" aria-label="Schließen">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Tooltip */

export function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-lg bg-ash-700 px-2.5 py-1.5 text-xs text-bone shadow-xl">
          {text}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
export const TooltipProvider = TooltipPrimitive.Provider;

/* ------------------------------------------------------------------ Input */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    autoComplete="off"
    spellCheck={false}
    className={cn("no-drag h-9 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 text-sm text-bone placeholder:text-bone-faint focus:border-gold/50 focus:outline-none focus:ring-4 focus:ring-gold/10", className)}
    {...props}
  />
));
Input.displayName = "Input";
