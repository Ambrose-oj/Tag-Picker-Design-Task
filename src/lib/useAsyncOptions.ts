import { useEffect, useState } from "react";
import { optionShape, type Option, type TagOption } from "./tags";

export type LoadOptions = (query: string, signal: AbortSignal) => Promise<readonly Option[]>;
export type AsyncStatus = "idle" | "loading" | "error" | "done";

/**
 * Look up options on a server as the person types.
 * - Debounced, so fast typing makes one request.
 * - The previous request is aborted, so a slow old answer can never overwrite a new one.
 * - Failures are reported (`status: "error"`) with a `retry`, never swallowed.
 * `load` should be a stable function (define it outside the component or memoise it).
 */
export function useAsyncOptions(
  query: string,
  load: LoadOptions | undefined,
  { delay = 220, minLength = 2 }: { delay?: number; minLength?: number } = {},
) {
  const [state, setState] = useState<{ options: TagOption[]; status: AsyncStatus }>({ options: [], status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!load || query.length < minLength) {
      setState((s) => (s.status === "idle" && !s.options.length ? s : { options: [], status: "idle" }));
      return;
    }
    // Keep the last answer on screen while the next one loads, so the list does not flash empty.
    setState((s) => ({ ...s, status: "loading" }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await load(query, controller.signal);
        if (!controller.signal.aborted) setState({ options: result.map(optionShape), status: "done" });
      } catch {
        if (!controller.signal.aborted) setState((s) => ({ ...s, status: "error" }));
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, load, attempt, delay, minLength]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
