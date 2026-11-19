import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Check, Plus, Redo2, Search, Sparkles, Undo2, X } from "lucide-react";
import { BudgetBar } from "./components/BudgetBar";
import { cn } from "./lib/cn";
import { useMedia } from "./lib/useMedia";
import { useSelection } from "./lib/useSelection";
import {
  canonicalTagFor, fitTagAdditions, fuzzyMatchTagOptions, matchTagOptions, recommendWithReasons,
  tagCharCount, tagSlug,
  type TagGroups, type TagOption, type TagRecommendations,
} from "./lib/tags";

type Option = string | TagOption;

function optionShape(option: Option): TagOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentence = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} & ${items.at(-1)}`;

/** How many catalog pills are visible before "Show all". */
const COLLAPSED_COUNT = 12;
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
  groups,
  name,
  value,
  defaultValue = [],
  onChange,
  allowCustom = false,
  maxTagLength = 30,
  maxChars,
  recommendations,
  inputPlaceholder = "Search or add a skill…",
  ariaLabel = "Skills",
  className,
}: {
  /** Tags always shown in the list under the box. */
  options: readonly Option[];
  /** Extra tags that only appear while typing (too many to show all the time). */
  searchOptions?: readonly Option[];
  /** Categories: colour for each tag's `group`, and the filter tabs. Omit for one neutral list. */
  groups?: TagGroups;
  /** Form field name. The value is submitted as one comma-separated string. */
  name?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  /** Let people add tags that are not in the lists. */
  allowCustom?: boolean;
  maxTagLength?: number;
  /** Total characters across all selected tags. Omit for no limit. */
  maxChars?: number;
  /** Data for the "Others also tag" row. Omit for no row. */
  recommendations?: TagRecommendations;
  inputPlaceholder?: string;
  /** Accessible name for the text box. */
  ariaLabel?: string;
  className?: string;
}) {
  const opts = options.map(optionShape);
  // Search covers both lists, without repeats.
  const searchable: TagOption[] = (() => {
    const seen = new Set(opts.map((option) => tagSlug(option.value)));
    const extra = searchOptions.map(optionShape).filter((option) => {
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
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState<string>("all");
  /** The tag under the pointer in the lists below: drives the budget "ghost" and the reason line. */
  const [hoverCandidate, setHoverCandidate] = useState<string | null>(null);
  /** The selected tag under the pointer: lights up its segment in the budget bar. */
  const [hoverChip, setHoverChip] = useState<string | null>(null);
  /** Phones get a full-screen picker while editing. */
  const narrow = useMedia("(max-width: 639px)");
  const [sheet, setSheet] = useState(false);
  const [holdHeight, setHoldHeight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const catalogId = useId();

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 7000);
    return () => clearTimeout(timer);
  }, [removed]);
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
  useEffect(() => { if (!narrow) setSheet(false); }, [narrow]);
  // "/" jumps to the picker from anywhere, like search boxes in tools people already use.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
  /**
   * Add tags. Each is checked on its own, so a bad one never blocks the good
   * ones, and the reason is shown instead of dropping silently. Tags keep the
   * order they were added in.
   */
  const addTags = (raws: readonly string[]) => {
    const next = [...selected];
    const added: string[] = [];
    const problems: string[] = [];
    let duplicate: string | null = null;

    for (const raw of raws) {
      const text = normalize(raw);
      if (!text) continue;
      if (text.length > maxTagLength) {
        problems.push(`“${text.slice(0, 18)}…” is over ${maxTagLength} characters`);
        continue;
      }
      // "setup figma" typed and "Figma setup" picked must become the same tag.
      const tag = canonicalTagFor(text, searchable) ?? (allowCustom ? text : null);
      if (!tag) {
        problems.push(`“${text}” is not in the list`);
        continue;
      }
      if (has(tag, next)) {
        duplicate = tag;
        continue;
      }
      const fitted = limited ? fitTagAdditions([...next, tag], next, maxChars, sizeOf) : [...next, tag];
      if (fitted.length === next.length) {
        problems.push(`“${labelFor(tag)}” needs ${sizeOf(tag)} characters, only ${Math.max(maxChars! - tagCharCount(next, sizeOf), 0)} left`);
        continue;
      }
      next.push(tag);
      added.push(tag);
    }

    if (added.length) {
      history.set(next);
      setRemoved(null);
      setAnnounce(`Added ${added.map(labelFor).join(", ")}`);
      navigator.vibrate?.(8);
    }
    if (duplicate) {
      setFlash(tagSlug(duplicate));
      if (!added.length && !problems.length) setAnnounce(`${labelFor(duplicate)} is already added`);
    }
    setError(problems.length ? problems.join(". ") : null);
    if (problems.length) setAnnounce(problems.join(". "));
    setArmed(false);
  };

  const removeTags = (tags: readonly string[], label: string) => {
    const drop = new Set(tags.map(tagSlug));
    history.set(selected.filter((item) => !drop.has(tagSlug(item))));
    setRemoved(label);
    setError(null);
    setArmed(false);
    setAnnounce(`Removed ${label}`);
  };

  const undo = () => {
    if (history.undo()) { setRemoved(null); setError(null); setAnnounce("Undone"); }
  };
  const redo = () => {
    if (history.redo()) { setRemoved(null); setError(null); setAnnounce("Redone"); }
  };

  const toggle = (tag: string) => (has(tag) ? removeTags([tag], labelFor(tag)) : addTags([tag]));

  // ---- Typing and suggestions ------------------------------------------------
  const text = normalize(draft);
  const exact = canonicalTagFor(text, searchable);
  const remaining = searchable.filter((option) => !has(option.value));
  const matches = text ? matchTagOptions(text, remaining, { catalog: catalogValues }) : [];
  const fuzzy = text && matches.length === 0 ? fuzzyMatchTagOptions(text, remaining) : [];

  const suggestions: Suggestion[] = [
    ...matches.map((option): Suggestion => ({
      kind: "option", value: option.value, label: option.label,
      blocked: sizeOf(option.value) > room ? "No room" : undefined,
    })),
    ...fuzzy.map((option): Suggestion => ({
      kind: "option", value: option.value, label: option.label, fuzzy: true,
      blocked: sizeOf(option.value) > room ? "No room" : undefined,
    })),
  ];
  if (allowCustom && text && !exact && !has(text)) {
    suggestions.push({
      kind: "custom", value: text, label: text,
      blocked: text.length > maxTagLength ? "Too long" : text.length > room ? "No room" : undefined,
    });
  }
  const open = focused && Boolean(text) && !dismissed;
  const activeIndex = Math.min(active, Math.max(suggestions.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const choose = (item: Suggestion) => {
    addTags([item.label]);
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
      addTags(parts.slice(0, -1));
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
        if (open && suggestions[activeIndex]) choose(suggestions[activeIndex]);
        else { addTags([text]); setDraft(""); }
        return;
      }
      case "Escape":
        if (open) { event.preventDefault(); setDismissed(true); }
        else if (draft) { event.preventDefault(); setDraft(""); }
        else if (sheet) closeSheet();
        return;
      case "Backspace":
        if (draft || !selected.length) return;
        if (armed) removeTags([selected.at(-1)!], labelFor(selected.at(-1)!));
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
    addTags(`${draft}${pasted}`.split(/[,\n\r]+/));
    setDraft("");
  };

  const onFocus = () => {
    setFocused(true);
    if (narrow && !sheet) {
      setHoldHeight(rootRef.current?.offsetHeight ?? 0);
      setSheet(true);
      panelRef.current?.scrollTo(0, 0);
    }
  };

  const onBlur = () => {
    setFocused(false);
    setArmed(false);
    // Keep what was typed if it is a real tag, or a custom tag nothing else could mean.
    // Otherwise leave the text in the box rather than adding a half-typed word.
    if (text && (exact || (allowCustom && matches.length === 0 && fuzzy.length === 0))) {
      addTags([text]);
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

  const pill = (option: { value: string; label: string }) => {
    const on = has(option.value);
    const blocked = !on && sizeOf(option.value) > room;
    const t = tone(option.value);
    return (
      <motion.button
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
        onClick={() => toggle(option.value)}
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
      </motion.button>
    );
  };

  const liveText = announce || (open ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}` : "");
  const segments = selected.map((tag) => ({
    slug: tagSlug(tag), label: labelFor(tag), size: sizeOf(tag), hue: hueOf(tag),
  }));

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className={className} style={sheet ? { minHeight: holdHeight } : undefined}>
        <div
          ref={panelRef}
          role={sheet ? "dialog" : undefined}
          aria-modal={sheet || undefined}
          aria-label={sheet ? `Edit ${ariaLabel.toLowerCase()}` : undefined}
          className={cn(sheet && "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background px-4 pb-16")}
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

          {name && <input type="hidden" name={name} value={selected.join(",")} />}
          <p role="status" aria-live="polite" className="sr-only">{liveText}</p>

          {/* The box: selected tags, then the text input. */}
          <div className="relative">
            <div
              onClick={(event) => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}
              className="cursor-text rounded-2xl border border-border bg-surface px-2.5 py-2 shadow-sm transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
            >
              <ul role="list" aria-label="Selected skills" className="relative flex flex-wrap items-center gap-1.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {selected.map((tag, index) => {
                    const slug = tagSlug(tag);
                    const custom = isCustom(tag);
                    const t = tone(tag);
                    const isArmed = armed && index === selected.length - 1;
                    return (
                      <motion.li
                        key={slug}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={SPRING}
                        onPointerEnter={() => setHoverChip(slug)}
                        onPointerLeave={() => setHoverChip(null)}
                        style={t.style}
                        className={cn(
                          t.className,
                          "inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-3 pr-0.5 text-sm font-medium",
                          custom ? "border-dashed border-muted-2/60 bg-transparent text-foreground" : "border-(--tone-bd) bg-(--tone-bg) text-(--tone-fg)",
                          isArmed && "border-danger bg-danger/10 text-danger",
                          flash === slug && "animate-[chip-flash_.9s_ease-out]",
                          hoverChip === slug && "ring-2 ring-(--tone-solid)/40",
                        )}
                        title={custom ? "Custom skill" : undefined}
                      >
                        {labelFor(tag)}
                        <button
                          type="button"
                          onClick={(event) => {
                            removeTags([tag], labelFor(tag));
                            // Keyboard users keep their place; touch users do not get a keyboard popping up.
                            if (event.detail === 0) inputRef.current?.focus();
                          }}
                          onFocus={() => setHoverChip(slug)}
                          onBlur={() => setHoverChip(null)}
                          aria-label={`Remove ${labelFor(tag)}`}
                          className="grid h-6 w-6 place-items-center rounded-full opacity-70 hover:bg-current/15 hover:opacity-100 pointer-coarse:h-8 pointer-coarse:w-8"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
                {/* Icon and input wrap together, so the icon is never left alone on a line. */}
                <motion.li layout="position" transition={SPRING} className="flex min-w-[10rem] flex-1 items-center gap-1.5 pl-1">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    placeholder={selected.length ? "Add another…" : inputPlaceholder}
                    aria-label={ariaLabel}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={open && suggestions[activeIndex] ? optionId(activeIndex) : undefined}
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="min-h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-2 sm:text-sm"
                  />
                  {!focused && !draft && <kbd className="hidden text-muted-2 sm:block pointer-coarse:!hidden" aria-hidden>/</kbd>}
                </motion.li>
              </ul>
            </div>

            {/* Suggestions float over the list below on desktop and sit in the flow in the phone sheet. */}
            <div
              id={listboxId}
              role="listbox"
              aria-label="Suggestions"
              hidden={!open}
              className={cn(
                "overflow-hidden rounded-2xl border border-border bg-surface",
                sheet ? "mt-2" : "absolute inset-x-0 top-full z-30 mt-1.5 shadow-xl shadow-black/10",
              )}
            >
              <ul className={cn("overflow-y-auto overscroll-contain p-1", !sheet && "max-h-72")}>
                {suggestions.map((item, index) => {
                  const t = tone(item.value);
                  const group = item.kind === "option" ? optionOf(item.value)?.group : undefined;
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
                        onClick={() => choose(item)}
                        style={t.style}
                        className={cn(
                          t.className,
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
                        ) : group && groups?.[group] ? (
                          <span className="shrink-0 text-xs text-muted-2">{groups[group].label}</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {suggestions.length === 0 && (
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

          {/* Budget: one segment per tag, plus a ghost for the tag you are about to add. */}
          {limited && (
            <BudgetBar segments={segments} max={maxChars} ghost={ghost} highlighted={hoverChip} onHighlight={setHoverChip} />
          )}
          {(limited || error || removed || history.canUndo || history.canRedo) && (
            <div className="mt-2 flex min-h-6 items-start justify-between gap-3 text-xs">
              <div className="min-w-0 pt-0.5">
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : removed ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2 text-muted">
                    Removed “{removed}”
                    <button type="button" onClick={undo} className="inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-2 hover:underline">
                      <Undo2 className="h-3 w-3" aria-hidden />Undo
                    </button>
                  </span>
                ) : limited && ghost && ghost.size > room ? (
                  <span className="text-danger">“{ghost.label}” needs {ghost.size}, only {Math.max(room, 0)} left</span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(history.canUndo || history.canRedo) && (
                  <>
                    <button type="button" onClick={undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)" className="grid h-6 w-6 place-items-center rounded text-muted-2 hover:text-foreground disabled:opacity-30 pointer-coarse:h-8 pointer-coarse:w-8">
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" onClick={redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" className="grid h-6 w-6 place-items-center rounded text-muted-2 hover:text-foreground disabled:opacity-30 pointer-coarse:h-8 pointer-coarse:w-8">
                      <Redo2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </>
                )}
                {selected.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTags(selected, `${selected.length} skills`)}
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
                      onClick={() => addTags(recs.slice(0, 3).map((r) => r.tag))}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft"
                    >
                      <Plus className="h-3 w-3" aria-hidden />Add top {Math.min(recs.length, 3)}
                    </button>
                  )}
                </div>
                <div className="relative flex flex-wrap gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {recs.map((r) => pill({ value: r.tag, label: r.tag }))}
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
                  {visibleOpts.map(pill)}
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
        </div>
      </div>
    </MotionConfig>
  );
}
