import { AlertTriangle, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Loading, error and empty blocks, so every card handles its states the same way.
 * The placeholder uses bg-muted: shadcn's Skeleton paints bg-accent, which is nearly invisible on a card.
 */
export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

export function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
      <Inbox className="size-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
