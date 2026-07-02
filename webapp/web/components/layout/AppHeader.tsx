import Link from "next/link";
import { Box } from "lucide-react";
import { StatusBadge, type Status } from "@/components/ui";
import styles from "./AppHeader.module.css";

export interface AppHeaderProps {
  status?: Status;
  statusText?: string;
}

/** Top app bar: title, 3D-view link, status badge. Ports the vanilla header. */
export function AppHeader({ status = "idle", statusText = "ready" }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Upande Bed &amp; Zone Mapper</h1>
      <div className={styles.right}>
        <Link className={styles.link3d} href="/3d" title="Open the 3D view">
          <Box size={14} aria-hidden />
          <span>3D</span>
        </Link>
        <StatusBadge status={status}>{statusText}</StatusBadge>
      </div>
    </header>
  );
}
