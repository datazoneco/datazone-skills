import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** One KPI: label, value, and a hint that says what the number counts. Only one tile per row gets a tone. */
export function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "primary" | "warning" | "destructive";
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex h-6 items-baseline gap-1.5">
        {loading ? (
          <span className="h-6 w-20 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-2xl leading-none font-semibold tabular-nums",
                tone === "primary" && "text-primary",
                tone === "warning" && "text-warning",
                tone === "destructive" && "text-destructive",
              )}
            >
              {value}
            </span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The one card every chart sits in: a title and a one-sentence "how to read it". */
export function ChartFrame({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** A small segmented control, for a handful of options such as a time window. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-md border bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium",
            option.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
