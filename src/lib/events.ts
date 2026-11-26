/** Where an added tag came from. Useful for tuning ranking and recommendations. */
export type AddSource = "suggestion" | "typed" | "comma" | "paste" | "catalog" | "recommendation" | "top3";
export type RemoveSource = "chip" | "catalog" | "backspace" | "clear";

/**
 * Everything the picker reports through `onEvent`. Plain data, no personal text
 * beyond the tag itself, so it can go straight into an analytics pipeline.
 */
export type TagPickerEvent =
  | { type: "add"; tag: string; source: AddSource; /** Row the suggestion had in the list (0 = top). */ position?: number; query?: string }
  | { type: "remove"; tag: string; source: RemoveSource }
  | { type: "reorder"; tag: string; from: number; to: number; method: "drag" | "keyboard" }
  | { type: "reject"; reason: "too_long" | "not_in_list" | "no_room"; text: string }
  | { type: "search"; query: string; results: number; usedFuzzy: boolean; usedRemote: boolean }
  | { type: "undo" | "redo" | "clear" | "open_sheet" };
