import type { TagGroups, TagOption, TagRecommendations } from "./lib/tags";

// Sample data. Replace freely; it only exists so the picker has something to show.

/** Categories. `hue` tints every tag in the group (OKLCH hue). */
export const GROUPS: TagGroups = {
  design: { label: "Design", hue: 295 },
  motion: { label: "Motion & 3D", hue: 350 },
  frontend: { label: "Frontend", hue: 250 },
  engineering: { label: "Engineering", hue: 165 },
  research: { label: "Research & content", hue: 65 },
};

const GROUP_OF: Record<string, string> = {
  "Accessibility": "research", "Adobe Illustrator": "design", "After Effects": "motion", "Angular": "frontend",
  "Animation": "motion", "Blender": "motion", "CSS": "frontend", "Design systems": "design", "Figma": "design",
  "Framer": "design", "GraphQL": "engineering", "HTML": "frontend", "Illustration": "design",
  "Interaction design": "design", "JavaScript": "frontend", "Motion design": "motion", "Next.js": "frontend",
  "Node.js": "engineering", "Photoshop": "design", "Prototyping": "design", "Python": "engineering",
  "React": "frontend", "React Native": "engineering", "Sketch": "design", "Storybook": "frontend",
  "Svelte": "frontend", "Swift": "engineering", "Tailwind CSS": "frontend", "TypeScript": "frontend",
  "UI design": "design", "User research": "research", "UX writing": "research", "Vue": "frontend",
  "Webflow": "frontend", "Wireframing": "design",
  "Usability testing": "research", "Information architecture": "research", "Design tokens": "design",
  "Micro-interactions": "motion", "Dark mode": "design", "Mobile app design": "design", "Landing pages": "design",
  "Figma setup": "design", "Jetpack Compose": "engineering", "SwiftUI": "engineering", "Three.js": "motion",
  "Lottie": "motion",
};

/** Always shown under the box. */
export const SKILLS: TagOption[] = [
  "Accessibility", "Adobe Illustrator", "After Effects", "Angular", "Animation",
  "Blender", "CSS", "Design systems", "Figma", "Framer", "GraphQL", "HTML",
  "Illustration", "Interaction design", "JavaScript", "Motion design", "Next.js",
  "Node.js", "Photoshop", "Prototyping", "Python", "React", "React Native",
  "Sketch", "Storybook", "Svelte", "Swift", "Tailwind CSS", "TypeScript",
  "UI design", "User research", "UX writing", "Vue", "Webflow", "Wireframing",
].map((label) => ({ value: label, label, group: GROUP_OF[label] }));

/** Only found by typing. `keywords` are hidden search words. */
export const MORE_SKILLS: TagOption[] = ([
  { value: "Usability testing", label: "Usability testing", keywords: ["user testing", "ux"] },
  { value: "Information architecture", label: "Information architecture", keywords: ["ia", "sitemap"] },
  { value: "Design tokens", label: "Design tokens", keywords: ["theme", "variables"] },
  { value: "Micro-interactions", label: "Micro-interactions", keywords: ["motion", "hover"] },
  { value: "Dark mode", label: "Dark mode", keywords: ["theme"] },
  { value: "Mobile app design", label: "Mobile app design", keywords: ["ios", "android"] },
  { value: "Landing pages", label: "Landing pages", keywords: ["marketing", "website"] },
  { value: "Figma setup", label: "Figma setup", keywords: ["install", "plugins"] },
  { value: "Jetpack Compose", label: "Jetpack Compose", keywords: ["android"] },
  { value: "SwiftUI", label: "SwiftUI", keywords: ["ios", "apple"] },
  { value: "Three.js", label: "Three.js", keywords: ["3d", "webgl"] },
  { value: "Lottie", label: "Lottie", keywords: ["animation"] },
] as TagOption[]).map((option) => ({ ...option, group: GROUP_OF[option.value] }));

const rel = (pairs: Array<[string, number]>) => pairs.map(([tag, n]) => ({ tag, n }));

/** "People who use X also use..." counts, keyed by lowercase tag. */
export const RECOMMENDATIONS: TagRecommendations = {
  popular: ["Figma", "React", "TypeScript", "CSS", "UI design", "Prototyping", "Tailwind CSS", "JavaScript"],
  related: {
    "figma": rel([["Prototyping", 40], ["UI design", 38], ["Design systems", 30], ["Wireframing", 22], ["Framer", 12]]),
    "react": rel([["TypeScript", 50], ["Next.js", 35], ["Tailwind CSS", 30], ["Storybook", 14], ["React Native", 10]]),
    "typescript": rel([["React", 50], ["Node.js", 26], ["Next.js", 24], ["GraphQL", 10]]),
    "ui design": rel([["Figma", 38], ["Design systems", 25], ["Interaction design", 18], ["Accessibility", 12]]),
    "prototyping": rel([["Figma", 40], ["Framer", 16], ["User research", 14], ["Interaction design", 12]]),
    "design systems": rel([["Storybook", 20], ["Figma", 30], ["Accessibility", 15], ["Tailwind CSS", 10]]),
    "tailwind css": rel([["React", 30], ["Next.js", 22], ["CSS", 18]]),
    "css": rel([["HTML", 45], ["JavaScript", 40], ["Animation", 12], ["Accessibility", 10]]),
    "user research": rel([["Wireframing", 20], ["UX writing", 12], ["Prototyping", 14]]),
    "motion design": rel([["After Effects", 30], ["Animation", 25], ["Framer", 10]]),
  },
};

/**
 * Pretend server catalogue, for the async search demo. In a real app this lives
 * behind an API; the picker only needs a function that returns options.
 */
const REMOTE: Array<[string, string, string[]?]> = [
  ["Rust", "engineering"], ["Go", "engineering", ["golang"]], ["Kotlin", "engineering", ["android"]],
  ["Flutter", "engineering", ["dart", "mobile"]], ["PostgreSQL", "engineering", ["sql", "database"]],
  ["Docker", "engineering", ["containers"]], ["Prisma", "engineering", ["orm"]], ["Bun", "engineering"],
  ["Astro", "frontend"], ["Remix", "frontend"], ["SolidJS", "frontend"], ["Vite", "frontend", ["bundler"]],
  ["D3.js", "frontend", ["charts", "data visualization"]], ["Vitest", "frontend", ["testing"]],
  ["Playwright", "frontend", ["testing", "e2e"]], ["Cypress", "frontend", ["testing", "e2e"]],
  ["GSAP", "motion", ["animation"]], ["Rive", "motion", ["animation"]], ["Spline", "motion", ["3d"]],
  ["Cinema 4D", "motion", ["3d"]], ["Procreate", "design", ["illustration"]], ["Typography", "design", ["type", "fonts"]],
  ["Brand identity", "design", ["logo", "branding"]], ["Color theory", "design", ["colour"]],
  ["Design critique", "design"], ["DesignOps", "design", ["operations"]], ["Service design", "research"],
  ["Journey mapping", "research", ["ux"]], ["A/B testing", "research", ["experiments"]],
  ["Content design", "research", ["copywriting"]], ["Copywriting", "research", ["content", "writing"]],
  ["Figma plugins", "design", ["extensions"]], ["WCAG", "research", ["accessibility", "a11y"]],
  ["Data visualization", "frontend", ["charts"]], ["Technical writing", "research", ["docs"]],
];

let failedOnce = false;

/** Fake network call: 350 ms, cancellable. A query containing "fail" errors once, so the retry state can be seen. */
export function searchRemoteSkills(query: string, signal: AbortSignal): Promise<TagOption[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (query.toLowerCase().includes("fail") && !failedOnce) {
        failedOnce = true;
        reject(new Error("Network error"));
        return;
      }
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      resolve(
        REMOTE.filter(([label, , keywords = []]) => {
          const hay = [label, ...keywords].join(" ").toLowerCase();
          return tokens.every((token) => hay.includes(token));
        }).map(([label, group, keywords]) => ({ value: label, label, group, keywords })),
      );
    }, 350);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
  });
}
