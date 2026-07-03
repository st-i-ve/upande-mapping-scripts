import type { ReactNode } from "react";

export type Status = "idle" | "busy" | "ok" | "error";

const DOT: Record<Status, string> = {
  idle: "text-muted-foreground",
  busy: "text-neutral-300 animate-pulse",
  ok: "text-primary",
  error: "text-destructive",
};

export interface StatusBadgeProps {
  status: Status;
  children: ReactNode;
}

/** Instrument status readout: a colored ◍ marker + label. */
export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span
      role="status"
      className="tabular inline-flex items-center gap-1.5 text-[9px] text-muted-foreground"
    >
      <span className={DOT[status]} aria-hidden>
        ◍
      </span>
      {children}
    </span>
  );
}
