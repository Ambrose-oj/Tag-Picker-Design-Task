# Tag Picker: what I changed and why

Run with `npm install` and `npm run dev`. `npm run build` (typecheck + build) passes.
`TagPicker`'s existing props are unchanged. New optional props: `groups` and `ariaLabel`.
Two small dependencies added: `motion` (layout animation) and `@fontsource-variable/inter` (bundled font, works offline).

## Approach
I used the picker like a user first (phone, keyboard only, pasting lists) and wrote down where it hurt.
The starter had good logic in `lib/tags.ts`, so I kept it and rebuilt the interaction and visual layer.
Then I asked what would make people say "that is smart" rather than "that works".

## The signature idea: the budget is something you can see
The 100-character limit is the hardest part of this picker, and a plain `10 / 100` hides it.
- **Stacked budget bar.** One coloured segment per tag, sized by its length. Hover a tag and its segment lights up.
- **Ghost preview.** Hover (or arrow onto) any suggestion and a striped segment shows how much room it would take. It turns red when it will not fit, with the reason in words.
- Tags that no longer fit are greyed out, not hidden. Clicking one explains why.

## Interaction
- **Real combobox.** ↑ ↓ Home End Enter Esc, `aria-activedescendant`, live announcements. Enter adds the highlighted suggestion (the starter added the raw text).
- **Typo tolerance.** "typscript" finds TypeScript, "figam" finds Figma (`fuzzyMatchTagOptions`, an edit-distance fallback shown as "Did you mean").
- **Comma and paste.** A comma commits a tag. Pasting `a, b, c` or a list of lines adds them all, each checked on its own.
- **Nothing is destructive.** Full undo/redo history (Ctrl/⌘ Z, Shift+Z, buttons, and an "Undo" after any removal including Clear all). Backspace on an empty box first highlights the last tag, the second press removes it.
- **Honest errors.** Too long, not in the list, or no room: each says exactly why instead of being dropped or cut.
- **Blur is careful.** Leaving the box commits only real tags (or a custom tag nothing else could mean). Half-typed text stays put.
- `/` jumps to the picker from anywhere.

## Discovery
- **Categories.** Tags are tinted by category (Design, Frontend, Motion & 3D…) with filter tabs showing how many you picked in each. Colours come from one OKLCH hue per group, with light/dark tuned for contrast.
- **Recommendations explain themselves.** "38 people who use Figma also use this", or "pairs well with Figma & React". One-click **Add top 3**.
- Tags keep the order you added them in (the starter re-sorted alphabetically, so new tags jumped around). Custom tags have a dashed border.

## Mobile
- Tapping the field opens a **full-screen sheet** with a sticky header ("2 selected · 90 characters left", **Done**), results in the flow instead of a floating popover, and the page behind frozen.
- Larger touch targets (`pointer: coarse`), 16px input to avoid iOS zoom, category tabs scroll sideways, a small haptic tick on add.
- Tested on an **iPhone 13 Pro** and an **Android phone** (dev server over the local network), on top of Chromium emulation. The one problem found was a copy-to-clipboard button I had added to the demo: browsers only allow clipboard access on secure pages (https or localhost), so it failed on a phone loading `http://192.168…`. I removed it, since the picker does not need it. Tap highlight and double-tap delay were also tidied, and `theme-color` follows light/dark.
- Fixed a layout bug I found while testing: the horizontally scrolling tab strip stretched the whole page wider than the phone.

## Craft
- Spring layout animation: tags reflow, the budget segments grow, and suggestions slide when you filter or add. Respects `prefers-reduced-motion`.
- Demo page shows a live **profile preview** (top skills as they would appear), so the picker is seen in context.
- Theme follows the system, is remembered, and applies before first paint (no white flash).
- Accessibility: labelled meter, `aria-pressed` on pills, the covered list is `inert` while suggestions are open, visible focus rings everywhere.

## Structure
- `lib/tags.ts`: pure helpers (ranking, fuzzy match, recommendations with reasons, budget rule). No React.
- `lib/useSelection.ts`: controlled/uncontrolled value with undo/redo.
- `components/BudgetBar.tsx`, `TagPicker.tsx`, `data.ts` (adds categories), `App.tsx` (demo + preview).

## What I would do with more time
- **Tests.** Unit tests for `lib/` and the `addTags` rules, and Playwright tests for the keyboard and sheet flows. I checked those by script in Chromium and by hand on two phones, but did not add a runner, to keep `npm install` light.
- **Drag to reorder**, with Alt+← → for keyboard, if order matters on profiles (the preview shows the first six).
- **More device testing.** I checked one iPhone and one Android phone by hand, not a wider range of sizes/OS versions, and not with VoiceOver/TalkBack. The sheet could also follow `visualViewport`, so the results list is never covered by the on-screen keyboard.
- **Bundle size.** `motion` is about 150 kB; `LazyMotion` with only the features used would trim it.
- **Async options** (debounce, loading, abort) and virtualised results for big catalogs; `disabled` / `readOnly` / `required` props with form validation.
- Analytics hooks (which suggestions get accepted) to tune the ranking, and an "undo" toast that can float instead of sitting inline.
