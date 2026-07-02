"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./Slider.module.css";

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  /** Right-aligned value readout, e.g. "60%". */
  valueLabel?: React.ReactNode;
}

/** Labeled range input in a subtle pill. Ports `label.slider`. */
export function Slider({ label, valueLabel, className, ...rest }: SliderProps) {
  return (
    <label className={`${styles.slider} ${className ?? ""}`}>
      <span className={styles.head}>
        <span>{label}</span>
        {valueLabel != null && <span>{valueLabel}</span>}
      </span>
      <input type="range" className={styles.range} {...rest} />
    </label>
  );
}
