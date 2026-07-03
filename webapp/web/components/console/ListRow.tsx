import type { ReactNode } from "react";

export interface ListRowProps {
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * Overflow-safe list row: the label flexes to zero and breaks long tokens
 * (so long names never force sideways scroll), while actions stay put.
 */
export function ListRow({ children, actions }: ListRowProps) {
  return (
    <li className="flex items-start justify-between gap-2 border-b border-border/50 py-1.5 text-xs last:border-0">
      <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">
        {children}
      </span>
      {actions && (
        <span className="flex shrink-0 flex-wrap justify-end gap-x-2.5 gap-y-0.5 text-[9px]">
          {actions}
        </span>
      )}
    </li>
  );
}
