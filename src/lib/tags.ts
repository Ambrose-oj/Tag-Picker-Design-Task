// Pure helpers for the tag picker. No React in here.

export type TagOption = { value: string; label: string; keywords?: readonly string[]; group?: string };

/** Category look: `hue` is an OKLCH hue (0-360) that tints every tag in the group. */
export type TagGroups = Record<string, { label: string; hue: number }>;

/** "the same tag" = same text after trimming, collapsing spaces and lowercasing. */
export function tagSlug(t: string): string {
  return t.trim().replace(/\s+/g, " ").toLowerCase();
}

/** How many characters one tag costs against the budget. */
export type TagSize = (tag: string) => number;
const ownLength: TagSize = (tag) => tag.length;

/** Characters a list of tags spends. Separators are not counted. */
export function tagCharCount(tags: readonly string[], sizeOf: TagSize = ownLength): number {
  return tags.reduce((total, tag) => total + sizeOf(tag), 0);
}

/**
 * Apply the character budget the way the editor should: refuse NEW tags that
 * do not fit, but never drop a tag that is already selected. Otherwise
 * removing one tag from an over-budget list could silently remove others.
 */
export function fitTagAdditions(
  next: readonly string[],
  held: readonly string[],
  budget: number,
  sizeOf: TagSize = ownLength,
): string[] {
  const heldSlugs = new Set(held.map(tagSlug));
  const isHeld = (tag: string) => heldSlugs.has(tagSlug(tag));
  let used = tagCharCount(next.filter(isHeld), sizeOf);
  return next.filter((tag) => {
    if (isHeld(tag)) return true;
    if (used + sizeOf(tag) > budget) return false;
    used += sizeOf(tag);
    return true;
  });
}

/** A tag's words, normalized and sorted: "setup figma" and "Figma setup" match. */
const tokenKey = (value: string) => tagSlug(value).split(" ").filter(Boolean).sort().join(" ");

/**
 * The spelling typed text should be stored as, or null if it matches no known
 * option (then it is kept as a free-text tag). Exact match first, then the
 * same words in a different order.
 */
export function canonicalTagFor(typed: string, options: readonly TagOption[]): string | null {
  const slug = tagSlug(typed);
  if (!slug) return null;
  const exact = options.find((o) => tagSlug(o.value) === slug || tagSlug(o.label) === slug);
  if (exact) return exact.value;
  const key = tokenKey(typed);
  const reordered = options.find((o) => tokenKey(o.value) === key || tokenKey(o.label) === key);
  return reordered ? reordered.value : null;
}

/** Related tags for one tag, strongest first. `n` = how many people use both. */
export type RelatedTag = { tag: string; n: number };

export type TagRecommendations = {
  /** tagSlug -> the tags most often used alongside it. */
  related: Record<string, RelatedTag[]>;
  /** Most-used tags overall: what an empty box is shown. */
  popular: string[];
};

export type Recommendation = {
  tag: string;
  /** People who use this tag together with one of your picks. 0 for plain "popular" top-ups. */
  people: number;
  /** Which of your picks led to this recommendation. Empty for "popular" top-ups. */
  because: string[];
};

/**
 * What to recommend, given what is already selected. A tag related to MORE of
 * your picks ranks above one related very strongly to a single pick. Topped up
 * with the most popular tags. Each result says why it is there.
 */
export function recommendWithReasons(
  selected: readonly string[],
  { related, popular }: TagRecommendations,
  limit = 12,
): Recommendation[] {
  const held = new Set(selected.map(tagSlug));
  const scored = new Map<string, Recommendation & { breadth: number }>();

  for (const pick of selected) {
    for (const { tag, n } of related[tagSlug(pick)] ?? []) {
      const slug = tagSlug(tag);
      if (held.has(slug)) continue;
      const prev = scored.get(slug);
      if (prev) {
        prev.people += n;
        prev.breadth += 1;
        prev.because.push(pick);
      } else {
        scored.set(slug, { tag, people: n, breadth: 1, because: [pick] });
      }
    }
  }

  const out: Recommendation[] = [...scored.values()]
    .sort((a, b) => b.breadth - a.breadth || b.people - a.people || a.tag.localeCompare(b.tag))
    .map(({ tag, people, because }) => ({ tag, people, because }));

  const taken = new Set(out.map((r) => tagSlug(r.tag)));
  for (const tag of popular) {
    if (out.length >= limit) break;
    const slug = tagSlug(tag);
    if (held.has(slug) || taken.has(slug)) continue;
    taken.add(slug);
    out.push({ tag, people: 0, because: [] });
  }
  return out.slice(0, limit);
}

/** Same ranking, tags only. */
export function recommendTags(
  selected: readonly string[],
  recommendations: TagRecommendations,
  limit = 12,
): string[] {
  return recommendWithReasons(selected, recommendations, limit).map((r) => r.tag);
}

/** Suggestions shown at once while typing. */
export const MAX_SUGGESTIONS = 24;

/**
 * Rank options against a typed query. Every word must appear, in any order.
 * `keywords` are hidden search aliases. Options in `catalog` (the always-visible
 * list) rank slightly higher.
 */
export function matchTagOptions(
  query: string,
  options: readonly TagOption[],
  { catalog, limit = MAX_SUGGESTIONS }: { catalog?: ReadonlySet<string>; limit?: number } = {},
): TagOption[] {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  return options
    .map((option) => ({
      option,
      hay: [option.label, ...(option.keywords ?? [])].join(" ").toLowerCase(),
    }))
    .filter(({ hay }) => tokens.every((token) => hay.includes(token)))
    .map(({ option }) => {
      const label = option.label.toLowerCase();
      let rank = 0;
      if (label.startsWith(q)) rank -= 4;
      else if (label.includes(q)) rank -= 2;
      if (catalog?.has(option.value)) rank -= 1;
      return { option, rank };
    })
    .sort((a, b) =>
      a.rank - b.rank ||
      a.option.label.length - b.option.label.length ||
      a.option.label.localeCompare(b.option.label, "en", { sensitivity: "base", numeric: true }),
    )
    .slice(0, limit)
    .map(({ option }) => option);
}

/** Edit distance where swapping two neighbouring letters counts as one edit ("figam" -> "figma"). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array<number>(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * "Did you mean": typo-tolerant fallback for when nothing matched exactly.
 * Compares the typed text with the whole label, each word, and the start of each
 * word, so both "reakt" and "figam" and "typscript" land.
 */
export function fuzzyMatchTagOptions(
  query: string,
  options: readonly TagOption[],
  limit = 4,
): TagOption[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (q.length < 3) return [];
  const allowed = q.length <= 4 ? 1 : 2;

  return options
    .map((option) => {
      const label = option.label.toLowerCase();
      const targets = [label.replace(/\s+/g, ""), ...label.split(/[\s./-]+/).filter(Boolean)];
      let best = Infinity;
      for (const target of targets) {
        best = Math.min(best, editDistance(q, target), editDistance(q, target.slice(0, q.length)));
      }
      return { option, best };
    })
    .filter(({ best }) => best <= allowed)
    .sort((a, b) => a.best - b.best || a.option.label.length - b.option.label.length)
    .slice(0, limit)
    .map(({ option }) => option);
}
