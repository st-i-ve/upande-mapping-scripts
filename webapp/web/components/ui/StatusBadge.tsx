import styles from "./StatusBadge.module.css";

export type Status = "idle" | "busy" | "ok" | "error";

export interface StatusBadgeProps {
  status: Status;
  children: React.ReactNode;
}

/** Small status pill mirroring the vanilla `#status` badge states. */
export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]}`} role="status">
      {children}
    </span>
  );
}
