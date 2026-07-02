"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "default" | "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/** App button. Ports the vanilla `.primary/.secondary/.danger` styles. */
export function Button({
  variant = "default",
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = [styles.btn, styles[variant], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
