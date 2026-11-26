import { useEffect, useState } from "react";

/**
 * The part of the screen that is actually visible. On phones the on-screen
 * keyboard shrinks this (and, on iOS, can scroll it) without resizing the page,
 * so a full-screen sheet has to follow it or its bottom ends up under the keyboard.
 */
export function useVisualViewport(enabled: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) {
      setBox(null);
      return;
    }
    const update = () => setBox({ top: viewport.offsetTop, height: viewport.height });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [enabled]);
  return box;
}
