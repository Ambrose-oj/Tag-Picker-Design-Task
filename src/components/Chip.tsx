import type { CSSProperties } from "react";
import { m } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;

export type MoveTarget = "left" | "right" | "start" | "end";

/**
 * One selected tag. Draggable to reorder, and Alt + arrow keys do the same from
 * the keyboard (focus is on the remove button, so there is a single tab stop per tag).
 */
export function Chip({
  slug,
  label,
  custom,
  tone,
  ordinal,
  armed,
  flashing,
  highlighted,
  interactive,
  reorderable,
  hintId,
  onRemove,
  onHover,
  onDragStart,
  onDragMove,
  onDragEnd,
  onKeyboardMove,
}: {
  slug: string;
  label: string;
  custom: boolean;
  tone: { className: string; style: CSSProperties | undefined };
  /** 1, 2, 3… for featured tags; undefined for the rest. */
  ordinal?: number;
  armed: boolean;
  flashing: boolean;
  highlighted: boolean;
  interactive: boolean;
  reorderable: boolean;
  hintId: string;
  onRemove: (viaKeyboard: boolean) => void;
  onHover: (slug: string | null) => void;
  onDragStart: (slug: string) => void;
  onDragMove: (slug: string, clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  onKeyboardMove: (slug: string, target: MoveTarget) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!reorderable || !event.altKey) return;
    const target: Partial<Record<string, MoveTarget>> = {
      ArrowLeft: "left", ArrowUp: "left", ArrowRight: "right", ArrowDown: "right", Home: "start", End: "end",
    };
    const where = target[event.key];
    if (!where) return;
    event.preventDefault();
    onKeyboardMove(slug, where);
  };

  return (
    <m.li
      data-chip={slug}
      layout="position"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={SPRING}
      drag={reorderable}
      dragSnapToOrigin
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.07, zIndex: 40, boxShadow: "0 10px 28px rgb(0 0 0 / 0.22)" }}
      onDragStart={() => onDragStart(slug)}
      onDrag={(_, info) => onDragMove(slug, info.point.x - window.scrollX, info.point.y - window.scrollY)}
      onDragEnd={onDragEnd}
      onPointerEnter={() => onHover(slug)}
      onPointerLeave={() => onHover(null)}
      onKeyDown={handleKeyDown}
      style={tone.style}
      className={cn(
        tone.className,
        "inline-flex items-center gap-1 rounded-full border py-0.5 text-sm font-medium",
        interactive ? "pl-3 pr-0.5" : "px-3 py-1",
        ordinal !== undefined && "pl-1.5",
        custom ? "border-dashed border-muted-2/60 bg-transparent text-foreground" : "border-(--tone-bd) bg-(--tone-bg) text-(--tone-fg)",
        armed && "border-danger bg-danger/10 text-danger",
        flashing && "animate-[chip-flash_.9s_ease-out]",
        highlighted && "ring-2 ring-(--tone-solid)/40",
        reorderable && "cursor-grab active:cursor-grabbing",
      )}
      title={custom ? "Custom skill" : undefined}
    >
      {ordinal !== undefined && (
        <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-(--tone-fg) text-[10px] font-bold leading-none text-(--tone-bg)">
          {ordinal}
        </span>
      )}
      <span className={cn(ordinal !== undefined && "pl-0.5")}>{label}</span>
      {interactive && (
        <button
          type="button"
          data-remove={slug}
          onClick={(event) => onRemove(event.detail === 0)}
          onFocus={() => onHover(slug)}
          onBlur={() => onHover(null)}
          aria-label={`Remove ${label}`}
          aria-describedby={reorderable ? hintId : undefined}
          aria-keyshortcuts={reorderable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
          className="grid h-6 w-6 place-items-center rounded-full opacity-70 hover:bg-current/15 hover:opacity-100 pointer-coarse:h-8 pointer-coarse:w-8"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </m.li>
  );
}
