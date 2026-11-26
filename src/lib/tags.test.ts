import { describe, expect, it } from "vitest";
import {
  canonicalTagFor, fitTagAdditions, fuzzyMatchTagOptions, matchTagOptions, moveItem,
  planAdditions, recommendWithReasons, tagCharCount, tagSlug, type TagOption,
} from "./tags";

const opt = (label: string, keywords?: string[]): TagOption => ({ value: label, label, keywords });
const OPTIONS = [
  opt("Figma"), opt("Figma setup", ["install"]), opt("React"), opt("React Native"),
  opt("TypeScript"), opt("Usability testing", ["user testing", "ux"]), opt("Next.js"),
];

describe("tagSlug / tagCharCount", () => {
  it("treats case and spacing as the same tag", () => {
    expect(tagSlug("  Next   JS ")).toBe("next js");
  });
  it("counts tag characters, not separators", () => {
    expect(tagCharCount(["ab", "cde"])).toBe(5);
  });
});

describe("fitTagAdditions", () => {
  it("refuses new tags that do not fit but never drops held ones", () => {
    expect(fitTagAdditions(["aaaa", "bbbb", "cc"], ["aaaa", "bbbb"], 8)).toEqual(["aaaa", "bbbb"]);
    // already over budget: held tags all stay
    expect(fitTagAdditions(["aaaa", "bbbb"], ["aaaa", "bbbb"], 5)).toEqual(["aaaa", "bbbb"]);
  });
});

describe("canonicalTagFor", () => {
  it("matches exact text, ignoring case", () => expect(canonicalTagFor("figma", OPTIONS)).toBe("Figma"));
  it("matches the same words in a different order", () => expect(canonicalTagFor("setup figma", OPTIONS)).toBe("Figma setup"));
  it("returns null for unknown text", () => expect(canonicalTagFor("Rust", OPTIONS)).toBeNull());
});

describe("matchTagOptions", () => {
  it("ranks prefix matches first", () => {
    expect(matchTagOptions("re", OPTIONS).map((o) => o.label).slice(0, 2)).toEqual(["React", "React Native"]);
  });
  it("finds options by hidden keywords", () => {
    expect(matchTagOptions("ux", OPTIONS).map((o) => o.label)).toContain("Usability testing");
  });
  it("requires every word, in any order", () => {
    expect(matchTagOptions("native react", OPTIONS).map((o) => o.label)).toEqual(["React Native"]);
  });
  it("returns nothing for an empty query", () => expect(matchTagOptions("  ", OPTIONS)).toEqual([]));
});

describe("fuzzyMatchTagOptions", () => {
  it("fixes swapped letters", () => expect(fuzzyMatchTagOptions("figam", OPTIONS)[0]?.label).toBe("Figma"));
  it("fixes missing letters", () => expect(fuzzyMatchTagOptions("typscript", OPTIONS)[0]?.label).toBe("TypeScript"));
  it("does not guess from very short input", () => expect(fuzzyMatchTagOptions("fi", OPTIONS)).toEqual([]));
  it("does not match unrelated text", () => expect(fuzzyMatchTagOptions("zzzzz", OPTIONS)).toEqual([]));
});

describe("recommendWithReasons", () => {
  const data = {
    popular: ["Figma", "React", "CSS"],
    related: {
      figma: [{ tag: "Prototyping", n: 40 }, { tag: "UI design", n: 38 }],
      react: [{ tag: "TypeScript", n: 50 }, { tag: "UI design", n: 5 }],
    },
  };
  it("ranks a tag related to more of your picks above a single strong one", () => {
    const recs = recommendWithReasons(["Figma", "React"], data);
    expect(recs[0].tag).toBe("UI design");
    expect(recs[0].because).toEqual(["Figma", "React"]);
  });
  it("explains single-pick recommendations and tops up with popular tags", () => {
    const recs = recommendWithReasons(["Figma"], data);
    expect(recs[0]).toEqual({ tag: "Prototyping", people: 40, because: ["Figma"] });
    expect(recs.find((r) => r.tag === "CSS")?.because).toEqual([]);
  });
  it("never recommends what is already selected", () => {
    expect(recommendWithReasons(["Figma"], data).some((r) => r.tag === "Figma")).toBe(false);
  });
});

describe("planAdditions", () => {
  const base = { options: OPTIONS, selected: [] as string[] };
  it("adds known tags in the order given, using canonical spelling", () => {
    const plan = planAdditions({ ...base, raws: ["react", "setup figma"] });
    expect(plan.next).toEqual(["React", "Figma setup"]);
  });
  it("rejects unknown tags unless custom tags are allowed", () => {
    expect(planAdditions({ ...base, raws: ["Rust"] }).problems[0].reason).toBe("not_in_list");
    expect(planAdditions({ ...base, raws: ["Rust"], allowCustom: true }).next).toEqual(["Rust"]);
  });
  it("reports too-long tags instead of cutting them", () => {
    const plan = planAdditions({ ...base, raws: ["x".repeat(31)], allowCustom: true });
    expect(plan.next).toEqual([]);
    expect(plan.problems[0].reason).toBe("too_long");
  });
  it("flags duplicates without adding them twice", () => {
    const plan = planAdditions({ ...base, selected: ["React"], raws: ["REACT"] });
    expect(plan.duplicate).toBe("React");
    expect(plan.next).toEqual(["React"]);
  });
  it("refuses tags that do not fit the budget and says how much is left", () => {
    const plan = planAdditions({ ...base, selected: ["Figma"], raws: ["TypeScript", "React"], maxChars: 12 });
    expect(plan.added).toEqual(["React"]);
    expect(plan.problems[0]).toMatchObject({ reason: "no_room" });
    expect(plan.problems[0].message).toContain("only 7 left");
  });
  it("keeps going after a bad tag in a batch", () => {
    const plan = planAdditions({ ...base, raws: ["Nope", "Figma"] });
    expect(plan.added).toEqual(["Figma"]);
    expect(plan.problems).toHaveLength(1);
  });
});

describe("moveItem", () => {
  it("moves an item forward and backward", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("clamps targets and ignores bad indexes", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
  it("does not change its input", () => {
    const input = ["a", "b"];
    moveItem(input, 0, 1);
    expect(input).toEqual(["a", "b"]);
  });
});
