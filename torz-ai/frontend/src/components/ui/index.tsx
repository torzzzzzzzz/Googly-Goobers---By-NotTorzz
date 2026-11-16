import { clsx } from "clsx";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";

export const cx = clsx;

// ------------------------------------------------------------------------------------------------ Button

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "accent-gradient text-accent-ink font-semibold shadow-[0_8px_24px_-10px_var(--accent)] hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:shadow-none",
  secondary: "border border-line bg-surface-2 text-ink hover:bg-surface-3 hover:border-line-strong disabled:opacity-50",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40",
  danger: "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/15 disabled:opacity-50",
  soft: "bg-accent-soft text-accent hover:brightness-125 disabled:opacity-50",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.82rem] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-[0.9rem] gap-2 rounded-xl",
  lg: "h-12 px-6 text-[0.98rem] gap-2.5 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx("inline-flex select-none items-center justify-center whitespace-nowrap transition duration-150 disabled:cursor-not-allowed", variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        className,
      )}
      {...rest}
    />
  );
}

// ------------------------------------------------------------------------------------------------ Layout bits

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[1.02rem] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad"; className?: string }) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2 border-line",
    accent: "bg-accent-soft text-accent border-accent/20",
    good: "bg-good/10 text-good border-good/20",
    warn: "bg-warn/10 text-warn border-warn/25",
    bad: "bg-bad/10 text-bad border-bad/20",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] font-medium", tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-4 animate-spin text-accent", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">{children}</kbd>;
}

// ------------------------------------------------------------------------------------------------ Form controls

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block text-[0.82rem] font-medium text-ink-2">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx("input", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx("input resize-none leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("input cursor-pointer appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237d8aa5' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cx("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      {(label || description) && (
        <label htmlFor={id} className="cursor-pointer">
          {label && <div className="text-[0.9rem] text-ink">{label}</div>}
          {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition", checked ? "border-transparent accent-gradient" : "border-line-strong bg-surface-3")}
      >
        <span className={cx("absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-all", checked ? "left-[19px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.88rem] text-ink-2 hover:text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer rounded accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", className }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[0.78rem]" : "px-3.5 py-1.5 text-[0.85rem]",
            value === o.value ? "bg-surface-3 text-ink shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, labels }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; labels?: string[] }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--surface-3) ${pct}%)`, accentColor: "var(--accent)" }}
      />
      {labels && (
        <div className="mt-1.5 flex justify-between text-[0.7rem] text-muted">
          {labels.map((l, i) => (
            <span key={`${i}-${l}`}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, className, indeterminate }: { value: number; className?: string; indeterminate?: boolean }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      {indeterminate ? (
        <div className="skeleton h-full w-full opacity-80" style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)", backgroundSize: "400px 100%" }} />
      ) : (
        <div className="accent-gradient h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ States

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-muted [&>svg]:size-6">{icon}</div>}
      <div className="text-[0.98rem] font-semibold text-ink">{title}</div>
      {description && <div className="mt-1.5 max-w-sm text-sm text-muted">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, action, className }: { tone?: "info" | "good" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const map = {
    info: { cls: "border-accent/25 bg-accent-soft", icon: <Info className="size-4 text-accent" /> },
    good: { cls: "border-good/25 bg-good/8", icon: <CircleCheck className="size-4 text-good" /> },
    warn: { cls: "border-warn/30 bg-warn/8", icon: <TriangleAlert className="size-4 text-warn" /> },
    bad: { cls: "border-bad/30 bg-bad/8", icon: <CircleX className="size-4 text-bad" /> },
  }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", map.cls, className)}>
      <div className="mt-0.5 shrink-0">{map.icon}</div>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-ink">{title}</div>}
        {children && <div className={cx("text-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} />;
}

// ------------------------------------------------------------------------------------------------ Modal

export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input, textarea, select, button[data-autofocus]")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
      <div className="fixed inset-0 animate-fade-in bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" className={cx("card relative w-full animate-rise shadow-pop", width)}>
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h3 className="text-[1rem] font-semibold">{title}</h3>
            <IconButton label="Close" onClick={onClose} className="-mr-2">
              <X className="size-4" />
            </IconButton>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------------------------------------ Toasts + confirm

interface Toast {
  id: number;
  tone: "good" | "bad" | "info";
  message: ReactNode;
}
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; initial?: string; placeholder?: string };
}
interface UiCtx {
  toast: (message: ReactNode, tone?: Toast["tone"]) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean | string>;
}

const UiContext = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean | string) => void }) | null>(null);
  const [inputVal, setInputVal] = useState("");
  const seq = useRef(0);

  const toast = useCallback((message: ReactNode, tone: Toast["tone"] = "good") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3200);
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => {
    setInputVal(opts.input?.initial ?? "");
    return new Promise<boolean | string>((resolve) => setDialog({ ...opts, resolve }));
  }, []);

  const close = (v: boolean | string) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="card pointer-events-auto flex min-w-64 max-w-sm animate-rise items-center gap-2.5 px-4 py-3 text-sm shadow-pop">
              {t.tone === "good" ? <CircleCheck className="size-4 shrink-0 text-good" /> : t.tone === "bad" ? <CircleX className="size-4 shrink-0 text-bad" /> : <Info className="size-4 shrink-0 text-accent" />}
              <div className="text-ink">{t.message}</div>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Modal
        open={!!dialog}
        onClose={() => close(false)}
        title={dialog?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button
              data-autofocus
              variant={dialog?.danger ? "danger" : "primary"}
              onClick={() => close(dialog?.input ? inputVal.trim() || false : true)}
            >
              {dialog?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {dialog?.message && <div className="text-sm text-ink-2">{dialog.message}</div>}
        {dialog?.input && (
          <Field label={dialog.input.label} className={dialog.message ? "mt-3" : ""}>
            <Input value={inputVal} placeholder={dialog.input.placeholder} onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && close(inputVal.trim() || false)} />
          </Field>
        )}
      </Modal>
    </UiContext.Provider>
  );
}

export function useUi(): UiCtx {
  const c = useContext(UiContext);
  if (!c) throw new Error("useUi outside provider");
  return c;
}

// ------------------------------------------------------------------------------------------------ Menu

export function Menu({ trigger, items, align = "right" }: {
  trigger: (open: () => void) => ReactNode;
  items: ({ label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | "divider")[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div role="menu" className={cx("card absolute z-40 mt-1.5 min-w-48 animate-fade-in p-1.5 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.86rem] transition disabled:opacity-40 [&>svg]:size-4",
                  it.danger ? "text-bad hover:bg-bad/10" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "relative -mb-px flex items-center gap-2 px-3.5 py-2.5 text-[0.88rem] font-medium transition",
            value === t.value ? "text-ink" : "text-muted hover:text-ink-2",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-surface-3 px-1.5 text-[0.7rem] text-muted">{t.count}</span>}
          {value === t.value && <span className="accent-gradient absolute inset-x-2 bottom-0 h-0.5 rounded-full" />}
        </button>
      ))}
    </div>
  );
}
