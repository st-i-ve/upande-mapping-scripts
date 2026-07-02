"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./Toggle.module.css";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
}

/** Compact checkbox-in-a-pill, e.g. "Show on map". Ports `label.toggle`. */
export function Toggle({ label, className, ...rest }: ToggleProps) {
  return (
    <label className={`${styles.toggle} ${className ?? ""}`}>
      <input type="checkbox" className={styles.input} {...rest} />
      <span>{label}</span>
    </label>
  );
}
