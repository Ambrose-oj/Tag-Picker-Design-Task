import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { TagPicker, type TagPickerEvent } from "./TagPicker";
import { GROUPS, MORE_SKILLS, RECOMMENDATIONS, SKILLS, searchRemoteSkills } from "./data";
import { tagSlug } from "./lib/tags";
import { cn } from "./lib/cn";

type Theme = "light" | "dark";
type Mode = "edit" | "readOnly" | "disabled";
const FEATURED = 3;
const START = ["Figma", "React"];

// Saved choice first, then the system setting. (index.html applies the same rule
// before first paint so the page never flashes the wrong theme.)
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage blocked: fall through */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-surface-2 aria-pressed:bg-surface-2 aria-pressed:text-foreground pointer-coarse:h-10";
  return (
    <div role="group" aria-label="Theme" className="inline-flex gap-1 rounded-full border border-border bg-surface p-1 text-muted">
      <button type="button" className={btn} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun className="h-3.5 w-3.5" aria-hidden />Light</button>
      <button type="button" className={btn} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon className="h-3.5 w-3.5" aria-hidden />Dark</button>
    </div>
  );
}

const BY_SLUG = new Map([...SKILLS, ...MORE_SKILLS].map((option) => [tagSlug(option.value), option]));

function ProfileChip({ tag, large = false, ordinal }: { tag: string; large?: boolean; ordinal?: number }) {
  const option = BY_SLUG.get(tagSlug(tag));
  const hue = option?.group ? GROUPS[option.group]?.hue : undefined;
  return (
    <li
      style={hue === undefined ? undefined : ({ "--h": hue } as CSSProperties)}
      className={cn(
        hue === undefined ? "tone-neutral" : "tone",
        "inline-flex items-center gap-1.5 rounded-full border border-(--tone-bd) bg-(--tone-bg) font-medium text-(--tone-fg)",
        large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
      )}
    >
      {ordinal !== undefined && (
        <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-(--tone-fg) text-[10px] font-bold leading-none text-(--tone-bg)">{ordinal}</span>
      )}
      {option?.label ?? tag}
    </li>
  );
}

/** The picker's output where it would really be used, so the team sees the order matter. */
function ProfilePreview({ skills }: { skills: string[] }) {
  const featured = skills.slice(0, FEATURED);
  const more = skills.slice(FEATURED);
  return (
    <aside aria-label="Profile preview" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="h-16 bg-[linear-gradient(110deg,oklch(0.7_0.15_295),oklch(0.72_0.14_250)_55%,oklch(0.78_0.12_190))]" />
      <div className="px-5 pb-5">
        <div className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-surface bg-foreground text-base font-semibold text-background">AO</div>
        <p className="mt-2 text-base font-semibold">Ada Okafor</p>
        <p className="text-sm text-muted-2">Product designer · Lagos</p>

        {skills.length ? (
          <>
            <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted-2">Featured skills</h3>
            <ul className="flex flex-wrap gap-1.5">
              {featured.map((tag, i) => <ProfileChip key={tag} tag={tag} large ordinal={skills.length > 1 ? i + 1 : undefined} />)}
            </ul>
            {more.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">Also</h3>
                <ul className="flex flex-wrap gap-1.5">{more.map((tag) => <ProfileChip key={tag} tag={tag} />)}</ul>
              </>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-muted-2">No skills yet. Add a few and they show up here.</p>
        )}
      </div>
    </aside>
  );
}

function describe(event: TagPickerEvent): string {
  switch (event.type) {
    case "add": return `add · ${event.tag} · ${event.source}${event.position !== undefined ? ` #${event.position}` : ""}${event.query ? ` for “${event.query}”` : ""}`;
    case "remove": return `remove · ${event.tag} · ${event.source}`;
    case "reorder": return `reorder · ${event.tag} ${event.from + 1}→${event.to + 1} · ${event.method}`;
    case "reject": return `reject · ${event.reason} · “${event.text}”`;
    case "search": return `search · “${event.query}” · ${event.results} results${event.usedFuzzy ? " · fuzzy" : ""}${event.usedRemote ? " · online" : ""}`;
    default: return event.type;
  }
}

/** What `onEvent` receives. In a real app this goes to analytics; here it is just listed. */
function EventLog({ events }: { events: string[] }) {
  return (
    <details className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-sm">
      <summary className="cursor-pointer select-none font-medium text-muted">
        Analytics events <span className="ml-1 text-xs text-muted-2">({events.length})</span>
      </summary>
      {events.length ? (
        <ol className="mt-3 space-y-1 font-mono text-[11px] leading-snug text-muted-2" aria-label="Recent events">
          {events.map((line, i) => <li key={`${events.length - i}`} className="break-words">{line}</li>)}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-muted-2">Add, remove, search or reorder to see events appear.</p>
      )}
    </details>
  );
}

export default function App() {
  const [skills, setSkills] = useState<string[]>(START);
  const [mode, setMode] = useState<Mode>("edit");
  const [saved, setSaved] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // the browser has already run its validation by now
    const value = String(new FormData(event.currentTarget).get("skills") ?? "");
    const count = value ? value.split(",").length : 0;
    setSaved(`Saved ${count} skill${count === 1 ? "" : "s"}`);
  };

  const modes: Array<[Mode, string]> = [["edit", "Editable"], ["readOnly", "Read only"], ["disabled", "Disabled"]];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tag Picker</h1>
          <p className="mt-1 text-sm text-muted-2">Pick, search or paste skills. Press <kbd>/</kbd> to jump in.</p>
        </div>
        <ThemeSwitch />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={onSubmit} onChange={() => setSaved(null)} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-base font-semibold">Edit Skills</h2>
              <p className="text-sm text-muted">Pick the skills on your profile. Up to 100 characters in total.</p>
            </div>
            <div role="group" aria-label="Picker state" className="inline-flex gap-0.5 rounded-full bg-surface-2 p-0.5 text-xs">
              {modes.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mode === key}
                  onClick={() => setMode(key)}
                  className={cn("rounded-full px-2.5 py-1 pointer-coarse:py-2", mode === key ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-2 hover:text-foreground")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <TagPicker
            name="skills"
            options={SKILLS}
            searchOptions={MORE_SKILLS}
            loadOptions={searchRemoteSkills}
            groups={GROUPS}
            value={skills}
            onChange={(next) => { setSkills(next); setSaved(null); }}
            onEvent={(event) => setEvents((log) => [describe(event), ...log].slice(0, 10))}
            recommendations={RECOMMENDATIONS}
            featuredCount={FEATURED}
            maxChars={100}
            allowCustom
            required
            disabled={mode === "disabled"}
            readOnly={mode === "readOnly"}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="submit"
              disabled={mode !== "edit"}
              className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              Save skills
            </button>
            <button
              type="button"
              disabled={mode !== "edit"}
              onClick={() => { setSkills(START); setSaved(null); }}
              className="h-10 rounded-full px-4 text-sm text-muted hover:bg-surface-2 disabled:opacity-40"
            >
              Reset
            </button>
            <p role="status" className="flex items-center gap-1.5 text-sm text-muted">
              {saved && <><Check className="h-4 w-4 text-primary" aria-hidden />{saved}</>}
            </p>
          </div>
        </form>

        <div className="space-y-4 lg:sticky lg:top-8">
          <ProfilePreview skills={skills} />
          <EventLog events={events} />
        </div>
      </div>
    </main>
  );
}
