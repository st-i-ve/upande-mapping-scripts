import type { ReactNode } from "react";
import styles from "./ListRow.module.css";

export interface ListRowProps {
  /** Main content (name, coords…). Shrinks and wraps long text. */
  children: ReactNode;
  /** Right-aligned action links/buttons. Keep their size; wrap if needed. */
  actions?: ReactNode;
}

/**
 * A list row that never forces horizontal scroll: the label flexes to zero
 * and breaks long words, while the actions cluster stays put. Ports the
 * `#refList/#shapeList` overflow fix from the vanilla app.
 */
export function ListRow({ children, actions }: ListRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.label}>{children}</span>
      {actions != null && <span className={styles.actions}>{actions}</span>}
    </li>
  );
}
