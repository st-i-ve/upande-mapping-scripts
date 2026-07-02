import Link from "next/link";
import { Box } from "lucide-react";
import { StatusBadge, type Status } from "./StatusBadge";
import { CommandMenu } from "./CommandMenu";

export interface AppHeaderProps {
  status?: Status;
  statusText?: string;
}

/** Field-Console top bar: wordmark, command menu, 3D link, status readout. */
export function AppHeader({ status = "idle", statusText = "ready" }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-sm font-semibold tracking-[0.14em] text-foreground">
          UPANDE
        </span>
        <span className="tabular text-sm font-medium tracking-[0.14em] text-primary">
          MAPPER
        </span>
        <span className="tabular hidden text-[10px] uppercase tracking-widest text-muted-foreground/70 sm:inline">
          bed · zone · grid
        </span>
      </div>

      <div className="flex items-center gap-3">
        <CommandMenu />
        <Link
          href="/3d"
          title="Open the 3D view"
          className="tabular inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <Box size={13} aria-hidden />
          3D
        </Link>
        <StatusBadge status={status}>{statusText}</StatusBadge>
      </div>
    </header>
  );
}
