import { useEffect, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { TagPicker } from "./TagPicker";
import { GROUPS, MORE_SKILLS, RECOMMENDATIONS, SKILLS } from "./data";
import { tagSlug } from "./lib/tags";

type Theme = "light" | "dark";

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

/** Shows the picker's output where it would really be used, so the team sees it in context. */
function ProfilePreview({ skills }: { skills: string[] }) {
  const shown = skills.slice(0, 6);
  return (
    <aside aria-label="Profile preview" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="h-16 bg-[linear-gradient(110deg,oklch(0.7_0.15_295),oklch(0.72_0.14_250)_55%,oklch(0.78_0.12_190))]" />
      <div className="px-5 pb-5">
        <div className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-surface bg-foreground text-base font-semibold text-background">AO</div>
        <p className="mt-2 text-base font-semibold">Ada Okafor</p>
        <p className="text-sm text-muted-2">Product designer · Lagos</p>

        <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted-2">Top skills</h3>
        {shown.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((tag) => {
              const group = BY_SLUG.get(tagSlug(tag))?.group;
              const hue = group ? GROUPS[group]?.hue : undefined;
              return (
                <li
                  key={tag}
                  style={hue === undefined ? undefined : ({ "--h": hue } as CSSProperties)}
                  className={`${hue === undefined ? "tone-neutral" : "tone"} rounded-full border border-(--tone-bd) bg-(--tone-bg) px-2.5 py-0.5 text-xs font-medium text-(--tone-fg)`}
                >
                  {BY_SLUG.get(tagSlug(tag))?.label ?? tag}
                </li>
              );
            })}
            {skills.length > shown.length && (
              <li className="rounded-full px-2 py-0.5 text-xs text-muted-2">+{skills.length - shown.length} more</li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-2">No skills yet. Add a few and they show up here.</p>
        )}

      </div>
    </aside>
  );
}

export default function App() {
  const [skills, setSkills] = useState<string[]>(["Figma", "React"]);

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
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="mb-1 text-base font-semibold">Edit Skills</h2>
          <p className="mb-4 text-sm text-muted">Pick the skills on your profile. Up to 100 characters in total.</p>
          <TagPicker
            name="skills"
            options={SKILLS}
            searchOptions={MORE_SKILLS}
            groups={GROUPS}
            value={skills}
            onChange={setSkills}
            recommendations={RECOMMENDATIONS}
            maxChars={100}
            allowCustom
          />
        </section>
        <div className="lg:sticky lg:top-8">
          <ProfilePreview skills={skills} />
        </div>
      </div>
    </main>
  );
}
