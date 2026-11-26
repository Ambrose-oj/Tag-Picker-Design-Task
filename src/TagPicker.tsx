import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "motion/react";
import { Check, Loader2, Plus, Redo2, Search, Sparkles, Undo2 } from "lucide-react";
import { BudgetBar } from "./components/BudgetBar";
import { Chip, type MoveTarget } from "./components/Chip";
import { Toast } from "./components/Toast";
import { cn } from "./lib/cn";
import type { AddSource, RemoveSource, TagPickerEvent } from "./lib/events";
import { useAsyncOptions, type LoadOptions } from "./lib/useAsyncOptions";
import { useMedia } from "./lib/useMedia";
import { useSelection } from "./lib/useSelection";
import { useVisualViewport } from "./lib/useVisualViewport";
import {
  canonicalTagFor, fuzzyMatchTagOptions, matchTagOptions, moveItem, optionShape, planAdditions,
  recommendWithReasons, tagCharCount, tagSlug,
  type Option, type TagGroups, type TagOption, type TagRecommendations,
} from "./lib/tags";

export type { TagPickerEvent } from "./lib/events";
export type { LoadOptions } from "./lib/useAsyncOptions";

const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentence = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} & ${items.at(-1)}`;

/** The animation engine loads after first paint instead of sitting in the main bundle. */
const loadMotionFeatures = () => import("./lib/motionFeatures").then((module) => module.default);

/** How many catalog pills are visible before "Show all". */
const COLLAPSED_COUNT = 12;
/** Most online results shown at once. */
const MAX_REMOTE = 8;
const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;

/** One row in the suggestion list. `blocked` is why it cannot be added right now. */
type Suggestion = {
  kind: "option" | "custom";
  /** The tag value this row would add. */
  value: string;
  label: string;
  blocked?: string;
  /** Typo-tolerant match ("did you mean"). */
  fuzzy?: boolean;
  /** Came from `loadOptions` rather than the local lists. */
  remote?: boolean;
  option?: TagOption;
};

/** Underline the typed words inside a suggestion label. */
function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="bg-transparent font-semibold text-foreground underline decoration-(--tone-solid,var(--primary)) decoration-2 underline-offset-2">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function TagPicker({
  options,
  searchOptions = [],
  loadOptions,
  searchDelay = 220,
  groups,
  name,
  value,
  defaultValue = [],
  onChange,
  onEvent,
  allowCustom = false,
  maxTagLength = 30,
  maxChars,
  featuredCount = 0,
  recommendations,
  disabled = false,
  readOnly = false,
  required = false,
  requiredMessage = "Pick at least one skill",
  error,
  inputPlaceholder = "Search or add a skill…",
  ariaLabel = "Skills",
  className,
}: {
  /** Tags always shown in the list under the box. */
  options: readonly Option[];
  /** Extra tags that only appear while typing (too many to show all the time). */
  searchOptions?: readonly Option[];
  /** Look up more tags on a server while typing. Must be a stable function. Receives an AbortSignal. */
  loadOptions?: LoadOptions;
  /** Milliseconds to wait after typing before calling `loadOptions`. */
  searchDelay?: number;
  /** Categories: colour for each tag's `group`, and the filter tabs. Omit for one neutral list. */
  groups?: TagGroups;
  /** Form field name. The value is submitted as one comma-separated string. */
  name?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  /** Called for analytics: what was added from where, rejected, searched, reordered. */
  onEvent?: (event: TagPickerEvent) => void;
  /** Let people add tags that are not in the lists. */
  allowCustom?: boolean;
  maxTagLength?: number;
  /** Total characters across all selected tags. Omit for no limit. */
  maxChars?: number;
  /** The first N tags are "featured": they get a number, and the picker explains that order matters. */
  featuredCount?: number;
  /** Data for the "Others also tag" row. Omit for no row. */
  recommendations?: TagRecommendations;
  /** Not editable and not submitted with the form. */
  disabled?: boolean;
  /** Shown as plain tags. Still submitted with the form. */
  readOnly?: boolean;
  /** At least one tag is needed. Uses the browser's own form validation. */
  required?: boolean;
  requiredMessage?: string;
  /** An error from outside (for example from the server). */
  error?: string;
  inputPlaceholder?: string;
  /** Accessible name for the text box. */
  ariaLabel?: string;
  className?: string;
}) {
  const interactive = !disabled && !readOnly;
  const opts = options.map(optionShape);
  /** Online results that were picked, so their label and category are remembered. */
  const [learned, setLearned] = useState<TagOption[]>([]);
  // Search covers every list, without repeats.
  const searchable: TagOption[] = (() => {
    const seen = new Set(opts.map((option) => tagSlug(option.value)));
    const extra = [...searchOptions.map(optionShape), ...learned].filter((option) => {
      const slug = tagSlug(option.value);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    return [...opts, ...extra];
  })();
  const catalogValues = new Set(opts.map((option) => option.value));
  const bySlug = new Map(searchable.map((option) => [tagSlug(option.value), option]));

  const history = useSelection({ value, defaultValue, onChange });
  const selected = history.selected;

  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  /** Escape closes the list until the next keystroke. */
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  /** First Backspace on an empty box highlights the last tag; the second removes it. */
  const [armed, setArmed] = useState(false);
  const [error_, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ label: string; id: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState<string>("all");
  /** The tag under the pointer in the lists below: drives the budget "ghost" and the reason line. */
  const [hoverCandidate, setHoverCandidate] = useState<string | null>(null);
  /** The selected tag under the pointer: lights up its segment in the budget bar. */
  const [hoverChip, setHoverChip] = useState<string | null>(null);
  /** Order while a tag is being dragged. Committed once, when the drag ends. */
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [refocus, setRefocus] = useState<string | null>(null);
  /** Shown after the form tried to submit with nothing picked. */
  const [triedInvalid, setTriedInvalid] = useState(false);
  /** Phones get a full-screen picker while editing. */
  const narrow = useMedia("(max-width: 639px)");
  const [sheet, setSheet] = useState(false);
  const [holdHeight, setHoldHeight] = useState(0);
  const viewport = useVisualViewport(sheet);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ slug: string; order: string[] } | null>(null);
  const toastId = useRef(0);
  const listboxId = useId();
  const catalogId = useId();
  const hintId = useId();
  const errorId = useId();

  const emit = (event: TagPickerEvent) => onEvent?.(event);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);
  // The sheet is a modal on phones: freeze the page behind it.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [sheet]);
  useEffect(() => { if (!narrow || !interactive) setSheet(false); }, [narrow, interactive]);
  // "/" jumps to the picker from anywhere, like search boxes in tools people already use.
  useEffect(() => {
    if (!interactive) return;
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [interactive]);
  // Required: use the browser's own validation, so forms behave like any other field.
  const missing = required && selected.length === 0;
  useEffect(() => {
    inputRef.current?.setCustomValidity(missing ? requiredMessage : "");
    if (!missing) setTriedInvalid(false);
  }, [missing, requiredMessage]);
  // After a keyboard reorder the moved tag keeps focus.
  useEffect(() => {
    if (!refocus) return;
    document.querySelectorAll<HTMLElement>("[data-remove]").forEach((el) => {
      if (el.dataset.remove === refocus) el.focus();
    });
    setRefocus(null);
  }, [refocus]);

  // ---- Lookups ---------------------------------------------------------------
  const optionOf = (tag: string) => bySlug.get(tagSlug(tag));
  const labelFor = (tag: string) => optionOf(tag)?.label ?? tag;
  const sizeOf = (tag: string) => labelFor(tag).length;
  const has = (tag: string, list: readonly string[] = selected) => list.some((item) => tagSlug(item) === tagSlug(tag));
  const isCustom = (tag: string) => !bySlug.has(tagSlug(tag));
  const hueOf = (tag: string): number | null => {
    const group = optionOf(tag)?.group;
    return group && groups?.[group] ? groups[group].hue : null;
  };
  /** Class + style that put a tag in its category's colours. */
  const tone = (tag: string) => {
    const hue = hueOf(tag);
    return hue === null
      ? { className: "tone-neutral", style: undefined }
      : { className: "tone", style: { "--h": hue } as CSSProperties };
  };

  const limited = maxChars !== undefined;
  const charCount = tagCharCount(selected, sizeOf);
  const room = limited ? maxChars - charCount : Infinity;
  const ratio = limited ? Math.min(charCount / maxChars, 1) : 0;
  const atLimit = limited && charCount >= maxChars;
  const nearLimit = limited && ratio >= 0.8;

  // ---- Changing the selection ------------------------------------------------
  /** Apply the plan from `planAdditions` and report what happened. */
  const addTags = (
    raws: readonly string[],
    meta: { source: AddSource; position?: number; query?: string },
    extra: readonly TagOption[] = [],
  ) => {
    const labelIn = (tag: string) => extra.find((o) => tagSlug(o.value) === tagSlug(tag))?.label ?? labelFor(tag);
    const plan = planAdditions({
      raws, selected, options: [...searchable, ...extra], allowCustom, maxTagLength, maxChars,
      sizeOf: (tag) => labelIn(tag).length, labelOf: labelIn,
    });

    if (plan.added.length) {
      history.set(plan.next);
      setRemoved(null);
      const names = plan.added.map(labelIn);
      setAnnounce(`Added ${names.join(", ")}`);
      const kept = extra.filter((o) => plan.added.some((tag) => tagSlug(tag) === tagSlug(o.value)));
      if (kept.length) setLearned((prev) => [...prev, ...kept]);
      for (const tag of plan.added) emit({ type: "add", tag, ...meta });
      navigator.vibrate?.(8);
    }
    if (plan.duplicate) {
      setFlash(tagSlug(plan.duplicate));
      if (!plan.added.length && !plan.problems.length) setAnnounce(`${labelFor(plan.duplicate)} is already added`);
    }
    for (const problem of plan.problems) emit({ type: "reject", reason: problem.reason, text: problem.text });
    const messages = plan.problems.map((problem) => problem.message);
    setError(messages.length ? messages.join(". ") : null);
    if (messages.length) setAnnounce(messages.join(". "));
    setArmed(false);
  };

  const removeTags = (tags: readonly string[], label: string, source: RemoveSource) => {
    const drop = new Set(tags.map(tagSlug));
    history.set(selected.filter((item) => !drop.has(tagSlug(item))));
    toastId.current += 1;
    setRemoved({ label, id: toastId.current });
    setError(null);
    setArmed(false);
    setAnnounce(`Removed ${label}`);
    if (source === "clear") emit({ type: "clear" });
    else for (const tag of tags) emit({ type: "remove", tag, source });
  };

  const undo = () => {
    if (history.undo()) { setRemoved(null); setError(null); setAnnounce("Undone"); emit({ type: "undo" }); }
  };
  const redo = () => {
    if (history.redo()) { setRemoved(null); setError(null); setAnnounce("Redone"); emit({ type: "redo" }); }
  };
  const dismissToast = useCallback(() => setRemoved(null), []);

  // ---- Reordering ------------------------------------------------------------
  const shown = dragOrder ?? selected;
  const reorderable = interactive && selected.length > 1;

  const moveByKeyboard = (slug: string, target: MoveTarget) => {
    const from = selected.findIndex((tag) => tagSlug(tag) === slug);
    const to = target === "left" ? from - 1 : target === "right" ? from + 1 : target === "start" ? 0 : selected.length - 1;
    if (from < 0 || to < 0 || to >= selected.length || to === from) return;
    history.set(moveItem(selected, from, to));
    setRefocus(slug);
    setAnnounce(`${labelFor(selected[from])} moved to position ${to + 1} of ${selected.length}`);
    emit({ type: "reorder", tag: selected[from], from, to, method: "keyboard" });
  };

  const dragStart = (slug: string) => {
    dragRef.current = { slug, order: selected };
    setDragOrder(selected);
  };
  // While dragging, whichever tag is under the pointer trades places with the dragged one.
  const dragMove = (slug: string, x: number, y: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const target = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest<HTMLElement>("[data-chip]"))
      .find((el) => el && el.dataset.chip !== slug);
    if (!target) return;
    const from = drag.order.findIndex((tag) => tagSlug(tag) === slug);
    const to = drag.order.findIndex((tag) => tagSlug(tag) === target.dataset.chip);
    if (from < 0 || to < 0 || from === to) return;
    drag.order = moveItem(drag.order, from, to);
    setDragOrder(drag.order);
  };
  const dragEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragOrder(null);
    if (!drag) return;
    const from = selected.findIndex((tag) => tagSlug(tag) === drag.slug);
    const to = drag.order.findIndex((tag) => tagSlug(tag) === drag.slug);
    if (from < 0 || to < 0 || from === to) return;
    history.set(drag.order);
    setAnnounce(`${labelFor(selected[from])} moved to position ${to + 1} of ${selected.length}`);
    emit({ type: "reorder", tag: selected[from], from, to, method: "drag" });
  };

  // ---- Typing and suggestions ------------------------------------------------
  const text = normalize(draft);
  const exact = canonicalTagFor(text, searchable);
  const remaining = searchable.filter((option) => !has(option.value));
  const matches = text ? matchTagOptions(text, remaining, { catalog: catalogValues }) : [];

  const remote = useAsyncOptions(text, interactive ? loadOptions : undefined, { delay: searchDelay });
  const localSlugs = new Set(matches.map((option) => tagSlug(option.value)));
  // A finished request is trusted as-is; an older answer is only kept if it still matches what is typed.
  const remoteOptions = (remote.status === "done" ? remote.options : text ? matchTagOptions(text, remote.options) : [])
    .filter((option) => !has(option.value) && !localSlugs.has(tagSlug(option.value)))
    .slice(0, MAX_REMOTE);
  const fuzzy = text && matches.length === 0 && remoteOptions.length === 0 ? fuzzyMatchTagOptions(text, remaining) : [];

  const blockedFor = (label: string) => (label.length > room ? "No room" : undefined);
  const suggestions: Suggestion[] = [
    ...matches.map((option): Suggestion => ({ kind: "option", value: option.value, label: option.label, blocked: blockedFor(option.label) })),
    ...remoteOptions.map((option): Suggestion => ({
      kind: "option", value: option.value, label: option.label, remote: true, option, blocked: blockedFor(option.label),
    })),
    ...fuzzy.map((option): Suggestion => ({
      kind: "option", value: option.value, label: option.label, fuzzy: true, blocked: blockedFor(option.label),
    })),
  ];
  if (allowCustom && text && !exact && !has(text)) {
    suggestions.push({
      kind: "custom", value: text, label: text,
      blocked: text.length > maxTagLength ? "Too long" : text.length > room ? "No room" : undefined,
    });
  }
  const searching = remote.status === "loading";
  const open = interactive && focused && Boolean(text) && !dismissed;
  const activeIndex = Math.min(active, Math.max(suggestions.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  // Report searches once typing settles, with how well the lists answered.
  const latest = useRef({ results: 0, fuzzy: false, remote: false });
  latest.current = { results: suggestions.filter((s) => s.kind === "option").length, fuzzy: fuzzy.length > 0, remote: remoteOptions.length > 0 };
  useEffect(() => {
    if (!onEvent || !text) return;
    const timer = setTimeout(() => {
      const { results, fuzzy: usedFuzzy, remote: usedRemote } = latest.current;
      onEvent({ type: "search", query: text, results, usedFuzzy, usedRemote });
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const choose = (item: Suggestion, index: number) => {
    addTags([item.label], { source: "suggestion", position: index, query: text }, item.option ? [item.option] : []);
    setDraft("");
    setActive(0);
  };

  const onDraftChange = (next: string) => {
    setDismissed(false);
    setActive(0);
    setArmed(false);
    setError(null);
    // A comma finishes a tag. Pasting "a, b, c" adds a and b and leaves c in the box.
    if (next.includes(",")) {
      const parts = next.split(",");
      addTags(parts.slice(0, -1), { source: next.length - draft.length > 1 ? "paste" : "comma" });
      setDraft(parts.at(-1)!.replace(/^\s+/, ""));
    } else {
      setDraft(next);
    }
  };

  const closeSheet = () => {
    setSheet(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    // Undo / redo on an empty box. With text in it, the browser's own text undo wins.
    if ((event.metaKey || event.ctrlKey) && !draft) {
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (key === "y") { event.preventDefault(); redo(); return; }
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (!text) return;
        event.preventDefault();
        if (!open) { setDismissed(false); return; }
        if (!count) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + count) % count);
        return;
      }
      case "Home":
      case "End":
        if (open && count) { event.preventDefault(); setActive(event.key === "Home" ? 0 : count - 1); }
        return;
      case "Enter": {
        if (!text) return; // empty: let a surrounding form submit
        event.preventDefault();
        if (open && suggestions[activeIndex]) choose(suggestions[activeIndex], activeIndex);
        else { addTags([text], { source: "typed" }); setDraft(""); }
        return;
      }
      case "Escape":
        if (open) { event.preventDefault(); setDismissed(true); }
        else if (draft) { event.preventDefault(); setDraft(""); }
        else if (sheet) closeSheet();
        return;
      case "Backspace":
        if (draft || !selected.length) return;
        if (armed) removeTags([selected.at(-1)!], labelFor(selected.at(-1)!), "backspace");
        else setArmed(true);
        return;
      default:
        if (armed) setArmed(false);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!/[\n\r]/.test(pasted)) return; // commas are handled by onChange
    event.preventDefault();
    addTags(`${draft}${pasted}`.split(/[,\n\r]+/), { source: "paste" });
    setDraft("");
  };

  const onFocus = () => {
    setFocused(true);
    if (narrow && !sheet) {
      setHoldHeight(rootRef.current?.offsetHeight ?? 0);
      setSheet(true);
      panelRef.current?.scrollTo(0, 0);
      emit({ type: "open_sheet" });
    }
  };

  const onBlur = () => {
    setFocused(false);
    setArmed(false);
    // Keep what was typed if it is a real tag, or a custom tag nothing else could mean.
    // Otherwise leave the text in the box rather than adding a half-typed word.
    if (text && (exact || (allowCustom && suggestions.every((s) => s.kind === "custom") && !searching))) {
      addTags([text], { source: "typed" });
      setDraft("");
    }
  };

  // ---- Recommendations and catalog -------------------------------------------
  const recs = recommendations
    ? recommendWithReasons(selected, recommendations).filter((r) => sizeOf(r.tag) <= room)
    : [];
  const recBySlug = new Map(recs.map((r) => [tagSlug(r.tag), r]));
  const hoveredRec = hoverCandidate ? recBySlug.get(tagSlug(hoverCandidate)) : undefined;
  const reason = hoveredRec
    ? hoveredRec.because.length === 1
      ? `${hoveredRec.people} people who use ${labelFor(hoveredRec.because[0])} also use ${labelFor(hoveredRec.tag)}`
      : hoveredRec.because.length > 1
        ? `${labelFor(hoveredRec.tag)} pairs well with ${sentence(hoveredRec.because.map(labelFor))}`
        : `${labelFor(hoveredRec.tag)} is one of the most used skills`
    : selected.length
      ? `Based on ${sentence(selected.slice(0, 3).map(labelFor))}${selected.length > 3 ? ` and ${selected.length - 3} more` : ""}`
      : "The most used skills across profiles";

  const categories = groups
    ? Object.entries(groups).filter(([key]) => opts.some((option) => option.group === key))
    : [];
  const inCategory = category === "all" ? opts : opts.filter((option) => option.group === category);
  const collapsible = category === "all" && opts.length > COLLAPSED_COUNT + 3;
  const visibleOpts = collapsible && !showAll ? opts.slice(0, COLLAPSED_COUNT) : inCategory;

  // Preview of what the next tag would cost: the hovered pill, or the highlighted suggestion.
  const candidate = hoverCandidate ?? (open && suggestions[activeIndex] ? suggestions[activeIndex].value : null);
  const ghost = limited && candidate && !has(candidate) ? { label: labelFor(candidate), size: sizeOf(candidate) } : null;

  const hoverProps = (tag: string) => ({
    onPointerEnter: () => setHoverCandidate(tag),
    onPointerLeave: () => setHoverCandidate((current) => (current === tag ? null : current)),
    onFocus: () => setHoverCandidate(tag),
    onBlur: () => setHoverCandidate((current) => (current === tag ? null : current)),
  });

  const pill = (option: { value: string; label: string }, source: "catalog" | "recommendation") => {
    const on = has(option.value);
    const blocked = !on && sizeOf(option.value) > room;
    const t = tone(option.value);
    return (
      <m.button
        key={option.value}
        layout="position"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={SPRING}
        whileTap={blocked ? undefined : { scale: 0.95 }}
        type="button"
        aria-pressed={on}
        aria-disabled={blocked || undefined}
        title={blocked ? `Needs ${sizeOf(option.value)} characters, only ${room} left` : undefined}
        onClick={() => (on ? removeTags([option.value], labelFor(option.value), "catalog") : addTags([option.value], { source }))}
        {...hoverProps(option.value)}
        style={t.style}
        className={cn(
          t.className,
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm pointer-coarse:py-2",
          on
            ? "border-(--tone-bd) bg-(--tone-bg) font-medium text-(--tone-fg)"
            : "border-border bg-surface text-muted hover:border-(--tone-bd) hover:bg-(--tone-bg) hover:text-(--tone-fg)",
          blocked && "cursor-not-allowed opacity-45 hover:border-border hover:bg-surface hover:text-muted",
        )}
      >
        {!on && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--tone-solid)" />}
        {option.label}
        {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5 opacity-60" aria-hidden />}
      </m.button>
    );
  };

  const liveText = announce || (searching ? "Searching" : open ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}` : "");
  const segments = shown.map((tag) => ({
    slug: tagSlug(tag), label: labelFor(tag), size: sizeOf(tag), hue: hueOf(tag),
  }));
  const showRequiredError = required && missing && triedInvalid;
  const message = error ?? (showRequiredError ? requiredMessage : undefined);
  const hasFeatured = featuredCount > 0 && selected.length > 1;

  // Keep the phone sheet inside the visible area when the keyboard is up.
  const sheetStyle: CSSProperties | undefined = sheet && viewport ? { top: viewport.top, height: viewport.height } : undefined;
  const toastBottom = sheet && viewport ? { bottom: Math.max(window.innerHeight - viewport.top - viewport.height, 0) + 16 } : undefined;

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div ref={rootRef} className={className} style={sheet ? { minHeight: holdHeight } : undefined}>
          <div
            ref={panelRef}
            role={sheet ? "dialog" : undefined}
            aria-modal={sheet || undefined}
            aria-label={sheet ? `Edit ${ariaLabel.toLowerCase()}` : undefined}
            style={sheetStyle}
            className={cn(sheet && "fixed inset-x-0 top-0 h-dvh overflow-y-auto overscroll-contain bg-background px-4 pb-16 z-50")}
          >
            {sheet && (
              <div className="sticky top-0 z-40 -mx-4 mb-3 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
                <div>
                  <p className="text-base font-semibold">{ariaLabel}</p>
                  <p className="text-xs text-muted-2">
                    {selected.length} selected{limited ? ` · ${Math.max(room, 0)} characters left` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-background active:scale-95"
                >
                  Done
                </button>
              </div>
            )}

            {name && <input type="hidden" name={name} value={selected.join(",")} disabled={disabled} />}
            <p role="status" aria-live="polite" className="sr-only">{liveText}</p>
            {reorderable && (
              <p id={hintId} className="sr-only">
                Press Alt with the arrow keys to move this skill. Alt with Home or End moves it to the start or end.
              </p>
            )}

            {/* The box: selected tags, then the text input. */}
            <div className="relative">
              <div
                onClick={(event) => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "rounded-2xl border bg-surface px-2.5 py-2 shadow-sm transition-shadow",
                  message ? "border-danger" : "border-border",
                  interactive
                    ? "cursor-text focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
                    : disabled && "cursor-not-allowed opacity-55",
                  !interactive && "bg-surface-2/40 shadow-none",
                )}
              >
                <ul role="list" aria-label="Selected skills" className="relative flex flex-wrap items-center gap-1.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {shown.map((tag, index) => {
                      const slug = tagSlug(tag);
                      return (
                        <Chip
                          key={slug}
                          slug={slug}
                          label={labelFor(tag)}
                          custom={isCustom(tag)}
                          tone={tone(tag)}
                          ordinal={hasFeatured && index < featuredCount ? index + 1 : undefined}
                          armed={armed && index === shown.length - 1}
                          flashing={flash === slug}
                          highlighted={hoverChip === slug}
                          interactive={interactive}
                          reorderable={reorderable}
                          hintId={hintId}
                          onRemove={(viaKeyboard) => {
                            removeTags([tag], labelFor(tag), "chip");
                            // Keyboard users keep their place; touch users do not get a keyboard popping up.
                            if (viaKeyboard) inputRef.current?.focus();
                          }}
                          onHover={setHoverChip}
                          onDragStart={dragStart}
                          onDragMove={dragMove}
                          onDragEnd={dragEnd}
                          onKeyboardMove={moveByKeyboard}
                        />
                      );
                    })}
                  </AnimatePresence>
                  {/* Icon and input wrap together, so the icon is never left alone on a line. */}
                  {interactive && (
                    <m.li layout="position" transition={SPRING} className="flex min-w-[10rem] flex-1 items-center gap-1.5 pl-1">
                      <Search className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
                      <input
                        ref={inputRef}
                        value={draft}
                        onChange={(event) => onDraftChange(event.target.value)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onInvalid={() => setTriedInvalid(true)}
                        placeholder={selected.length ? "Add another…" : inputPlaceholder}
                        aria-label={ariaLabel}
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        aria-autocomplete="list"
                        aria-activedescendant={open && suggestions[activeIndex] ? optionId(activeIndex) : undefined}
                        aria-required={required || undefined}
                        aria-invalid={message ? true : undefined}
                        aria-describedby={message ? errorId : undefined}
                        required={missing}
                        enterKeyHint="done"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="min-h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-2 sm:text-sm"
                      />
                      {searching ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-2" aria-hidden />
                      ) : (
                        !focused && !draft && <kbd className="hidden text-muted-2 sm:block pointer-coarse:!hidden" aria-hidden>/</kbd>
                      )}
                    </m.li>
                  )}
                </ul>
              </div>

              {/* Suggestions float over the list below on desktop and sit in the flow in the phone sheet. */}
              <div
                id={listboxId}
                role="listbox"
                aria-label="Suggestions"
                aria-busy={searching || undefined}
                hidden={!open}
                className={cn(
                  "overflow-hidden rounded-2xl border border-border bg-surface",
                  sheet ? "mt-2" : "absolute inset-x-0 top-full z-30 mt-1.5 shadow-xl shadow-black/10",
                )}
              >
                <ul className={cn("overflow-y-auto overscroll-contain p-1", !sheet && "max-h-72")}>
                  {suggestions.map((item, index) => {
                    const t = tone(item.value);
                    const optionGroup = item.kind === "option" ? (item.option ?? optionOf(item.value))?.group : undefined;
                    return (
                      <li key={`${item.kind}:${item.value}`} role="presentation">
                        {item.fuzzy && !suggestions[index - 1]?.fuzzy && (
                          <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-2">Did you mean</p>
                        )}
                        <div
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === activeIndex}
                          aria-disabled={item.blocked ? true : undefined}
                          // Keep focus in the input so the keyboard stays up and typing continues.
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseMove={() => active !== index && setActive(index)}
                          onClick={() => choose(item, index)}
                          style={(item.option && groups?.[item.option.group ?? ""]
                            ? ({ "--h": groups[item.option.group!].hue } as CSSProperties)
                            : t.style)}
                          className={cn(
                            item.option && groups?.[item.option.group ?? ""] ? "tone" : t.className,
                            "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted pointer-coarse:py-3",
                            index === activeIndex && "bg-surface-2 text-foreground",
                            item.blocked && "opacity-60",
                          )}
                        >
                          {item.kind === "custom" ? (
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
                          ) : (
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-(--tone-solid)" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {item.kind === "custom" ? (
                              <>Add “<span className="font-medium text-foreground">{item.label}</span>”</>
                            ) : (
                              <Highlight text={item.label} query={text} />
                            )}
                          </span>
                          {item.blocked ? (
                            <span className="shrink-0 text-xs text-danger">{item.blocked}</span>
                          ) : item.kind === "custom" ? (
                            <span className="shrink-0 text-xs text-muted-2">New skill</span>
                          ) : optionGroup && groups?.[optionGroup] ? (
                            <span className="shrink-0 text-xs text-muted-2">{groups[optionGroup].label}</span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {searching && (
                  <p className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Searching more skills…
                  </p>
                )}
                {remote.status === "error" && (
                  <p className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-danger">
                    Could not load more skills.
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={remote.retry}
                      className="rounded-full px-2 py-0.5 font-medium text-primary hover:bg-primary-soft"
                    >
                      Retry
                    </button>
                  </p>
                )}
                {suggestions.length === 0 && !searching && (
                  <p className="px-4 py-3 text-sm text-muted-2">
                    {has(text) ? `“${text}” is already added.` : "No matching skills."}
                  </p>
                )}
                <p className="hidden items-center gap-3 border-t border-border bg-surface-2/50 px-4 py-2 text-xs text-muted-2 sm:flex pointer-coarse:!hidden">
                  <span><kbd>↑↓</kbd> navigate</span>
                  <span><kbd>Enter</kbd> add</span>
                  <span><kbd>,</kbd> add as typed</span>
                  <span><kbd>Esc</kbd> close</span>
                </p>
              </div>
            </div>

            {message && (
              <p id={errorId} role="alert" className="mt-2 text-sm text-danger">{message}</p>
            )}
            {interactive && hasFeatured && (
              <p className="mt-2 px-1 text-xs text-muted-2">
                <span className="pointer-coarse:hidden">Drag, or press <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd>, to reorder. </span>
                <span className="hidden pointer-coarse:inline">Touch and drag to reorder. </span>
                The first {featuredCount} are featured.
              </p>
            )}

            {/* Budget: one segment per tag, plus a ghost for the tag you are about to add. */}
            {limited && (
              <BudgetBar segments={segments} max={maxChars} ghost={interactive ? ghost : null} highlighted={hoverChip} onHighlight={setHoverChip} />
            )}
            {(limited || error_ || (interactive && (selected.length > 1 || history.canUndo || history.canRedo))) && (
              <div className="mt-2 flex min-h-6 items-start justify-between gap-3 text-xs">
                <div className="min-w-0 pt-0.5">
                  {error_ ? (
                    <span className="text-danger">{error_}</span>
                  ) : interactive && limited && ghost && ghost.size > room ? (
                    <span className="text-danger">“{ghost.label}” needs {ghost.size}, only {Math.max(room, 0)} left</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {interactive && (history.canUndo || history.canRedo) && (
                    <>
                      <button type="button" onClick={undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)" className="grid h-6 w-6 place-items-center rounded text-muted-2 hover:text-foreground disabled:opacity-30 pointer-coarse:h-8 pointer-coarse:w-8">
                        <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button type="button" onClick={redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" className="grid h-6 w-6 place-items-center rounded text-muted-2 hover:text-foreground disabled:opacity-30 pointer-coarse:h-8 pointer-coarse:w-8">
                        <Redo2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                  {interactive && selected.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTags(selected, `${selected.length} skills`, "clear")}
                      className="ml-1 rounded px-1 text-muted-2 underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                  {limited && (
                    <span className={cn("ml-2 tabular-nums", atLimit ? "font-medium text-danger" : nearLimit ? "text-warning" : "text-muted-2")}>
                      {charCount} / {maxChars}
                      <span className="sr-only"> characters used</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* The always-visible list. Inert while suggestions are open so Tab cannot land behind them. */}
            {interactive && (
              <div
                inert={open}
                className={cn(
                  "mt-4 rounded-2xl border border-border bg-surface p-3 transition-opacity",
                  open && (sheet ? "hidden" : "opacity-40"),
                )}
              >
                {recs.length > 0 && (
                  <section aria-labelledby={`${catalogId}-rec`} className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-3 px-1">
                      <h3 id={`${catalogId}-rec`} className="text-xs font-medium text-muted-2">
                        {selected.length ? "Others also tag" : "Most used"}
                      </h3>
                      {recs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => addTags(recs.slice(0, 3).map((r) => r.tag), { source: "top3" })}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft"
                        >
                          <Plus className="h-3 w-3" aria-hidden />Add top {Math.min(recs.length, 3)}
                        </button>
                      )}
                    </div>
                    <div className="relative flex flex-wrap gap-2">
                      <AnimatePresence initial={false} mode="popLayout">
                        {recs.map((r) => pill({ value: r.tag, label: r.tag }, "recommendation"))}
                      </AnimatePresence>
                    </div>
                    <p aria-live="off" className="mt-2 flex min-h-5 items-center gap-1.5 px-1 text-xs text-muted-2">
                      <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                      {reason}
                    </p>
                  </section>
                )}

                <section aria-labelledby={`${catalogId}-all`}>
                  <h3 id={`${catalogId}-all`} className="mb-2 px-1 text-xs font-medium text-muted-2">All skills</h3>
                  {categories.length > 0 && (
                    <div role="group" aria-label="Filter by category" className="-mx-1 mb-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                      {[["all", { label: "All", hue: -1 }] as const, ...categories].map(([key, group]) => {
                        const on = category === key;
                        const picked = key === "all" ? selected.length : opts.filter((o) => o.group === key && has(o.value)).length;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setCategory(key)}
                            style={group.hue >= 0 ? ({ "--h": group.hue } as CSSProperties) : undefined}
                            className={cn(
                              group.hue >= 0 ? "tone" : "tone-neutral",
                              "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium pointer-coarse:py-2",
                              on ? "bg-foreground text-background" : "bg-surface-2 text-muted hover:text-foreground",
                            )}
                          >
                            {group.hue >= 0 && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--tone-solid)" />}
                            {group.label}
                            {picked > 0 && (
                              <span className={cn("grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] tabular-nums", on ? "bg-background/25" : "bg-(--tone-bg) text-(--tone-fg)")}>
                                {picked}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="relative flex flex-wrap gap-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {visibleOpts.map((option) => pill(option, "catalog"))}
                    </AnimatePresence>
                  </div>
                  {collapsible && (
                    <button
                      type="button"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-3 rounded px-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {showAll ? "Show fewer" : `Show all ${opts.length} skills`}
                    </button>
                  )}
                </section>
              </div>
            )}
          </div>

          {/* "Removed X · Undo": floats, so it never moves the layout. */}
          <AnimatePresence>
            {removed && interactive && (
              <Toast
                key={removed.id}
                actionLabel="Undo"
                onAction={undo}
                onDismiss={dismissToast}
                top={sheet && !viewport}
                style={toastBottom}
              >
                Removed “{removed.label}”
              </Toast>
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
