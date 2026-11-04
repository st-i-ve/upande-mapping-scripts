"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store/appStore";

const PRESETS = [0.3, 0.5, 1, 2, 5];
const MIN = 0.1;
const MAX = 10;
/** The slider is logarithmic, so 0.1–1 m gets as much travel as 1–10 m. */
const toT = (w: number) => Math.round((Math.log(Math.min(MAX, Math.max(MIN, w)) / MIN) / Math.log(MAX / MIN)) * 100);
const fromT = (t: number) => {
  const w = MIN * (MAX / MIN) ** (t / 100);
  return w < 1 ? Math.round(w * 20) / 20 : Math.round(w * 10) / 10;
};

/**
 * The knife's blade width — a typed value, a slider and quick picks. Typing is
 * free-form (backspace it empty, type "0.", …); the width only changes once the
 * text is a positive number, and leaving the box puts back the real value.
 */
export function BladeWidth() {
  const width = useAppStore((s) => s.knifeWidth);
  const setWidth = useAppStore((s) => s.setKnifeWidth);
  const [draft, setDraft] = useState<string | null>(null);

  const type = (text: string) => {
    setDraft(text);
    const v = Number(text.replace(",", "."));
    if (text.trim() && Number.isFinite(v) && v > 0) setWidth(Math.min(100, v));
  };

  return (
    <div>
      <label className="flex items-center justify-between text-[10px] text-muted-foreground">
        Blade width / gap
        <span className="flex items-center gap-1">
          <input aria-label="Blade width in metres" type="text" inputMode="decimal"
            value={draft ?? String(width)}
            onFocus={(e) => { setDraft(String(width)); e.currentTarget.select(); }}
            onChange={(e) => type(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
            className="tabular h-6 w-16 rounded-md border border-border bg-background px-1.5 text-right text-[11px] text-foreground outline-none focus:border-primary/60" />
          m
        </span>
      </label>
      <input aria-label="Blade width slider" type="range" min={0} max={100} value={toT(width)}
        onChange={(e) => setWidth(fromT(+e.target.value))}
        className="mt-1.5 w-full accent-primary" />
      <div className="mt-1 flex gap-1">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setWidth(p)}
            className={`tabular flex-1 rounded-md border py-0.5 text-[10px] transition-colors ${
              width === p ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
