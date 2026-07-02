import type { ReactNode } from "react";
import styles from "./SectionCard.module.css";

export interface SectionCardProps {
  /** Section heading, e.g. "Reference points". */
  title: ReactNode;
  /** Optional short number/label shown before the title (e.g. "1"). */
  index?: ReactNode;
  children: ReactNode;
}

/** A sidebar section card — rounded, softly elevated, uppercase heading. */
export function SectionCard({ title, index, children }: SectionCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>
        {index != null && <span className={styles.index}>{index}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
