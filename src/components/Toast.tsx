import { useEffect, useState, type ReactNode } from "react";
import { m } from "motion/react";

/**
 * A small floating message with one action, e.g. "Removed Figma · Undo".
 * Dismisses itself after `duration`, but waits while the pointer or focus is on it.
 */
export function Toast({
  children,
  actionLabel,
  onAction,
  onDismiss,
  duration = 7000,
  style,
  top = false,
}: {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  duration?: number;
  style?: React.CSSProperties;
  /** Show near the top instead of the bottom (used in the phone sheet). */
  top?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, duration, onDismiss]);

  return (
    <m.div
      role="status"
      initial={{ opacity: 0, y: top ? -12 : 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: top ? -12 : 12, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={style}
      className={`fixed inset-x-4 z-[60] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full bg-foreground py-2 pl-4 pr-2 text-sm text-background shadow-xl shadow-black/25 ${top ? "top-20" : "bottom-[max(1rem,env(safe-area-inset-bottom))]"}`}
    >
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-full bg-background/15 px-3 py-1 text-sm font-semibold hover:bg-background/25 pointer-coarse:py-2"
      >
        {actionLabel}
      </button>
    </m.div>
  );
}
