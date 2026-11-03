"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/** Sleek sliding dark/light switch. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark / light theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border bg-secondary/70 transition-colors hover:border-primary/40"
    >
      <span
        className={`absolute flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform duration-300 ${
          isDark ? "translate-x-0.5" : "translate-x-[22px]"
        }`}
      >
        {isDark ? <Moon size={11} /> : <Sun size={11} />}
      </span>
    </button>
  );
}
