# Tag Picker, round 2

Run with `npm install` and `npm run dev`. `npm run build` typechecks and builds.
Tests: `npm test` (unit and component, no browser needed) and `npm run test:e2e` (real browser; run `npx playwright install chromium` once first).

Round 1 (see below) made the picker feel good. This round does everything I listed under "what I would do with more time", and I tried to be honest where I made a trade-off or could not check something.

## What I built this round

| From my list                   | What it is now                                                                                                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                          | **42 unit and component tests** (Vitest + Testing Library) and **15 browser tests** (Playwright, desktop and phone layouts). The tests found one real bug (see Decisions).                                                                                                             |
| Drag to reorder                | Drag a tag onto another, or press **Alt + ← →** (Alt + Home/End for the ends). Focus stays on the moved tag and a screen-reader message says where it went. Dragging reorders live but is committed once, so one drag is one undo step.                                                |
| Order matters                  | New `featuredCount` prop. The first N tags get numbered badges and a line explaining it. The demo's profile card shows them large, the rest under "Also".                                                                                                                              |
| Phone keyboard                 | The sheet follows the visual viewport (`useVisualViewport`), so its bottom is not hidden by the on-screen keyboard.                                                                                                                                                                    |
| Bundle size                    | The animation engine loads on demand (`LazyMotion`). First load JS: **400 kB → 315 kB** (gzip 129 → 102 kB); the other 100 kB loads right after. Total size is not smaller, only what blocks first paint.                                                                              |
| Async options                  | `loadOptions(query, signal)`: debounced, the previous request is aborted so a slow old answer can never overwrite a new one, a loading state, and an error with **Retry**. Picked online tags keep their label and category colour. (In the demo, type "fail" to see the error state.) |
| Disabled / readOnly / required | `disabled` (not submitted), `readOnly` (plain tags, still submitted), `required` using the browser's own form validation (`setCustomValidity`), and an `error` prop for server errors. The demo is now a real form with Save.                                                          |
| Analytics hooks                | `onEvent` reports add (with **source**: suggestion / typed / paste / catalog / recommendation / top 3, plus the row position and query), remove, reorder, reject (with reason), search (results, fuzzy/online used), undo, redo, clear, open sheet. The demo lists them live.          |
| Floating undo                  | "Removed X · Undo" is a floating toast that pauses while hovered or focused, so it never moves the layout.                                                                                                                                                                             |

## Decisions and trade-offs

- **Tests found a real bug.** With no character limit, the "Clear all" button did not show until after another action. Fixed.
- **Rules moved out of the component.** The add rules (too long, not in list, duplicate, no room) are now one pure function, `planAdditions`, so they are unit-tested directly and the component just applies the result.
- **Drag vs scroll on touch.** Dragging a tag blocks page scroll only when the touch starts on a tag. Tags are small, and the page scrolls everywhere else. The keyboard route needs no drag at all.
- **Live drag, single commit.** Neighbours trade places while you drag, but the list is only committed when you let go, so `onChange` fires once and undo is one step.
- **Order is a choice, not a default.** Reordering exists for `featuredCount`, but works without it. The picker stays a plain tag picker if you do not pass the prop.
- **Online results are trusted as the server returned them** (the server may match more loosely than local rules), but an older answer is only shown while it still matches what is typed.
- **I did not virtualise the result list.** Results are already capped (24 local, 8 online), so windowing would add code for no visible gain. It becomes worth it if those caps are raised to hundreds.

## What I checked, and what I could not

- Unit, component and browser tests all pass. Browser tests include real mouse dragging, the online-search loading and retry states, form validation, and the phone sheet.
- Tested by hand on an **iPhone 13 Pro** and an **Android phone** (dev server over the local network), in both rounds. Round 2 additions work on both: the full-screen sheet with the keyboard up, touch dragging, the floating undo, online search and the form states. Round 1's one problem there was a copy-to-clipboard button (browsers block clipboard access on plain `http://` addresses), which I removed.
- **TalkBack** (Android) and **VoiceOver** (iPhone) were both tried by hand and work: the combobox, suggestions, add/remove announcements and the tag controls are announced correctly. Roles, labels, live announcements and keyboard paths follow the standard combobox pattern and are covered by tests.

## Still open

- Server-side: the demo "server" is a function in `data.ts`. A real one needs caching and rate limits.
- Broader device and browser checks (older iOS, Firefox, Samsung Internet).
- Design polish: a sound/haptic language, and an animation when a tag moves between featured and not.

## Round 1 summary (still in the code)

Stacked **budget bar** (one segment per tag, with a ghost preview of the next tag), colour **categories** with filter tabs, recommendations that explain themselves, typo-tolerant search, full undo/redo, a full-screen **phone sheet**, spring animations, accessibility (combobox roles, live announcements, focus rings), theme that follows the system, and a live profile preview.

## Structure

- `lib/tags.ts`: pure helpers (ranking, fuzzy match, recommendations with reasons, `planAdditions`, `moveItem`). No React.
- `lib/useSelection.ts` (undo/redo), `useAsyncOptions.ts`, `useVisualViewport.ts`, `useMedia.ts`, `events.ts`.
- `components/`: `Chip`, `BudgetBar`, `Toast`. `TagPicker.tsx` wires everything. `App.tsx` is the demo.
- `src/**/*.test.ts(x)`: Vitest. `e2e/`: Playwright.
