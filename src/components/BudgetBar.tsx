import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/cn";

export type BudgetSegment = {
  slug: string;
  label: string;
  size: number;
  /** OKLCH hue of the tag's category; null for custom tags. */
  hue: number | null;
};

/**
 * The character budget as a stacked bar: one segment per tag, sized by its
 * length. Hovering a tag lights up its segment (and the other way round).
 * While you hover or arrow onto a suggestion, a striped "ghost" segment shows
 * how much room it would take, and turns red when it will not fit.
 */
export function BudgetBar({
  segments,
  max,
  ghost,
  highlighted,
  onHighlight,
}: {
  segments: BudgetSegment[];
  max: number;
  ghost: { label: string; size: number } | null;
  highlighted: string | null;
  onHighlight: (slug: string | null) => void;
}) {
  const used = segments.reduce((sum, s) => sum + s.size, 0);
  const left = Math.max(max - used, 0);
  const ghostFits = ghost ? ghost.size <= left : true;
  const ghostSize = ghost ? Math.min(ghost.size, left) : 0;
  const spring = { type: "spring", stiffness: 420, damping: 38 } as const;

  return (
    <div
      role="meter"
      aria-label="Characters used"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(used, max)}
      className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2"
    >
      {segments.map((segment) => (
        <motion.div
          key={segment.slug}
          title={`${segment.label} · ${segment.size}`}
          initial={{ flexGrow: 0, opacity: 0 }}
          animate={{
            flexGrow: segment.size,
            opacity: highlighted && highlighted !== segment.slug ? 0.35 : 1,
          }}
          transition={spring}
          onPointerEnter={() => onHighlight(segment.slug)}
          onPointerLeave={() => onHighlight(null)}
          style={
            {
              flexBasis: 0,
              flexShrink: 1,
              ...(segment.hue === null ? {} : { "--h": segment.hue }),
            } as CSSProperties
          }
          className={cn("rounded-full", segment.hue === null ? "tone-neutral" : "tone", "bg-(--tone-solid)")}
        />
      ))}
      {ghost && ghostSize > 0 && (
        <motion.div
          key="ghost"
          initial={{ flexGrow: 0 }}
          animate={{ flexGrow: ghostSize }}
          transition={spring}
          style={{
            flexBasis: 0,
            flexShrink: 1,
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in srgb, var(--surface) 55%, transparent) 4px 8px)",
            backgroundSize: "1rem 1rem",
            animation: "ghost-stripes .8s linear infinite",
          }}
          className={cn("rounded-full", ghostFits ? "bg-primary/70" : "bg-danger")}
        />
      )}
      <motion.div
        initial={false}
        animate={{ flexGrow: Math.max(left - ghostSize, 0) }}
        transition={spring}
        style={{ flexBasis: 0, flexShrink: 1 }}
      />
    </div>
  );
}
