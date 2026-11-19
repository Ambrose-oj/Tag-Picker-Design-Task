import { useRef, useState } from "react";

/**
 * Selected tags with a full undo/redo history. Works controlled (`value`) or
 * uncontrolled (`defaultValue`), like a normal input. Every change made through
 * `set` can be undone, so no action in the picker is destructive.
 */
export function useSelection({
  value,
  defaultValue,
  onChange,
}: {
  value?: string[];
  defaultValue: string[];
  onChange?: (value: string[]) => void;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const past = useRef<string[][]>([]);
  const future = useRef<string[][]>([]);
  const selected = value ?? internal;

  const apply = (next: string[]) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
    setDepth({ undo: past.current.length, redo: future.current.length });
  };

  return {
    selected,
    canUndo: depth.undo > 0,
    canRedo: depth.redo > 0,
    set(next: string[]) {
      past.current = [...past.current.slice(-49), selected];
      future.current = [];
      apply(next);
    },
    undo(): boolean {
      const prev = past.current.pop();
      if (!prev) return false;
      future.current.push(selected);
      apply(prev);
      return true;
    },
    redo(): boolean {
      const next = future.current.pop();
      if (!next) return false;
      past.current.push(selected);
      apply(next);
      return true;
    },
  };
}
