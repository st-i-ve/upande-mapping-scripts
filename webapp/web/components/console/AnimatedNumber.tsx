"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion";

/** Tweens between values — used for the generate summary readouts. */
export function AnimatedNumber({ value, pad }: { value: number; pad?: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  const text = pad ? String(display).padStart(pad, "0") : String(display);
  return <>{text}</>;
}
