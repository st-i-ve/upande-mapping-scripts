import { createContext, useContext, type ReactNode } from "react";

/** Inside a grouped dropdown, cards drop their own frame and sit flush in the group. */
export const FlatCards = createContext(false);

export interface SectionCardProps {
  title: ReactNode;
  /** Zero-padded section index, e.g. "01". Shown as a mono chip. */
  index?: string;
  /** Optional right-aligned meta (counts, toggles). */
  meta?: ReactNode;
  children: ReactNode;
}

/** A Field-Console panel section: bordered card, mono index chip, uppercase label. */
export function SectionCard({ title, index, meta, children }: SectionCardProps) {
  const flat = useContext(FlatCards);
  return (
    <section className={flat
      ? "border-t border-border/60 px-4 py-3.5 first:border-0"
      : "rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]"}>
      <div className="mb-2.5 flex items-center gap-2">
        {index && (
          <span className="tabular inline-flex h-4 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1 text-[11px] leading-none text-primary/90">
            {index}
          </span>
        )}
        <h2 className="flex-1 text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
