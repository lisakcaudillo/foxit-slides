'use client';

import { useState, useCallback, useRef } from 'react';

interface UndoRedoResult<T> {
  state: T;
  setState: (newState: T | ((prev: T) => T)) => void;
  setStateDirect: (newState: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  /** Begin a coalesced gesture (drag-resize, crop pan, etc.). Snapshots the
   *  current state; `setState` calls until `endCoalesce` update the live state
   *  WITHOUT pushing per-frame history. */
  beginCoalesce: () => void;
  /** End a coalesced gesture: if the state actually changed since
   *  `beginCoalesce`, push the pre-gesture snapshot as a SINGLE undo entry. */
  endCoalesce: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initialState: T, maxHistory: number = 20): UndoRedoResult<T> {
  const [state, setStateRaw] = useState<T>(initialState);
  const undoStackRef = useRef<T[]>([]);
  const redoStackRef = useRef<T[]>([]);
  // Mirror of the latest committed state so a gesture can snapshot it
  // synchronously without waiting for a render.
  const stateRef = useRef<T>(initialState);
  // Coalescing: while a gesture is active, setState updates the live state but
  // does NOT push per-frame history; endCoalesce pushes ONE entry.
  const coalescingRef = useRef(false);
  const coalesceBaseRef = useRef<T | null>(null);
  const [, forceRender] = useState(0);

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    setStateRaw((prev) => {
      const resolved = typeof newState === 'function'
        ? (newState as (prev: T) => T)(prev)
        : newState;

      // If state is unchanged (e.g. duplicate guard returned prev), skip history
      if (resolved === prev) return prev;
      stateRef.current = resolved;

      // Mid-gesture: update live state only; endCoalesce owns the one history
      // entry (snapshot captured at beginCoalesce).
      if (coalescingRef.current) return resolved;

      // Push current state to undo stack
      const newUndoStack = [...undoStackRef.current, prev];
      if (newUndoStack.length > maxHistory) {
        newUndoStack.shift();
      }
      undoStackRef.current = newUndoStack;
      // Clear redo stack on new action
      redoStackRef.current = [];
      forceRender((n) => n + 1);

      return resolved;
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    setStateRaw((current) => {
      const newUndo = [...undoStackRef.current];
      const previousState = newUndo.pop()!;
      undoStackRef.current = newUndo;

      redoStackRef.current = [...redoStackRef.current, current];
      stateRef.current = previousState;
      forceRender((n) => n + 1);

      return previousState;
    });
  }, []);

  const setStateDirect = useCallback((newState: T | ((prev: T) => T)) => {
    setStateRaw((prev) => {
      const resolved = typeof newState === 'function'
        ? (newState as (prev: T) => T)(prev)
        : newState;
      stateRef.current = resolved;
      return resolved;
    });
    undoStackRef.current = [];
    redoStackRef.current = [];
    forceRender((n) => n + 1);
  }, []);

  const beginCoalesce = useCallback(() => {
    if (coalescingRef.current) return; // already in a gesture — keep the snapshot
    coalescingRef.current = true;
    coalesceBaseRef.current = stateRef.current;
  }, []);

  const endCoalesce = useCallback(() => {
    if (!coalescingRef.current) return;
    coalescingRef.current = false;
    const base = coalesceBaseRef.current;
    coalesceBaseRef.current = null;
    // No net change across the gesture → nothing to record.
    if (base === null || base === stateRef.current) return;
    const newUndoStack = [...undoStackRef.current, base];
    if (newUndoStack.length > maxHistory) {
      newUndoStack.shift();
    }
    undoStackRef.current = newUndoStack;
    redoStackRef.current = [];
    forceRender((n) => n + 1);
  }, [maxHistory]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    setStateRaw((current) => {
      const newRedo = [...redoStackRef.current];
      const nextState = newRedo.pop()!;
      redoStackRef.current = newRedo;

      const newUndo = [...undoStackRef.current, current];
      if (newUndo.length > maxHistory) {
        newUndo.shift();
      }
      undoStackRef.current = newUndo;
      stateRef.current = nextState;
      forceRender((n) => n + 1);

      return nextState;
    });
  }, [maxHistory]);

  return {
    state,
    setState,
    setStateDirect,
    undo,
    redo,
    beginCoalesce,
    endCoalesce,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
