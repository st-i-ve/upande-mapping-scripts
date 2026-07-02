"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional inline label rendered after the box. */
  label?: React.ReactNode;
  /** Tri-state visual (checked but partial). */
  indeterminate?: boolean;
}

/** Accent-colored checkbox, optionally with an inline label. */
export function Checkbox({ label, indeterminate, className, ...rest }: CheckboxProps) {
  const input = (
    <input
      type="checkbox"
      className={styles.box}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      {...rest}
    />
  );
  if (label == null) return input;
  return (
    <label className={`${styles.wrap} ${className ?? ""}`}>
      {input}
      <span>{label}</span>
    </label>
  );
}
