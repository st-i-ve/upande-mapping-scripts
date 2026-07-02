import type { ReactNode } from "react";

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
  return (
    <section className="rounded-lg border border-border bg-card/70 p-3.5 shadow-sm backdrop-blur-[2px]">
      <div className="mb-2.5 flex items-center gap-2">
        {index && (
          <span className="tabular inline-flex h-4 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1 text-[10px] leading-none text-primary/90">
            {index}
          </span>
        )}
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
