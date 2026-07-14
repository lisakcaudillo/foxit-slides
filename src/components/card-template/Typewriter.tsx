'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface TypewriterProps {
  /** The full text to reveal. */
  text: string;
  /** Characters per second. Default 45 — fast enough to feel lively, slow enough to read along. */
  speed?: number;
  /**
   * Wait this many milliseconds before starting to type. Used to chain
   * typewriters within a card so the heading types first, then body, then
   * cells — instead of all firing simultaneously.
   */
  delay?: number;
  /**
   * Optional render override called every frame. Receives the currently
   * revealed slice + a done flag. Use this to switch from raw-text typing
   * to a formatted render (e.g. `**bold**` markdown) when animation finishes.
   */
  render?: (revealed: string, done: boolean) => ReactNode;
  /**
   * Whether to actually animate the type-out. When `false` the component
   * renders the full text immediately and skips the timer entirely. Used
   * to suppress animation on duplicates, manually-added cards, and user
   * edits — only fresh AI-streamed content should typewriter-reveal.
   * Defaults to `true` so existing call sites get the historical behavior.
   */
  animate?: boolean;
  /**
   * Called once when the reveal finishes (or immediately when there's no text
   * or `animate` is false). Callers use this to record that a block has already
   * played, so a later remount / prop change never replays it.
   */
  onDone?: () => void;
}

/**
 * Reveal `text` character-by-character when `animate` is true. Otherwise
 * shows the full text immediately. Restarts the animation whenever `text`,
 * `speed`, `delay`, or `animate` change.
 */
export function Typewriter({ text, speed = 45, delay = 0, render, animate = true, onDone }: TypewriterProps) {
  const [revealed, setRevealed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) {
      setRevealed('');
      setDone(true);
      onDone?.();
      return;
    }

    // Animation off — show the full text right away. Used for duplicates,
    // manually-added cards, and content that's already been "settled" so
    // user edits don't trigger a fresh type-out.
    if (!animate) {
      setRevealed(text);
      setDone(true);
      onDone?.();
      return;
    }

    // Reset visible state immediately, then wait `delay` before starting
    // to type. During the delay window, the component renders an empty
    // span — siblings using earlier-starting typewriters get to finish
    // first.
    setRevealed('');
    setDone(false);
    const intervalMs = Math.max(8, Math.round(1000 / speed));

    let interval: ReturnType<typeof setInterval> | undefined;
    const startTimeout = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i++;
        if (i >= text.length) {
          setRevealed(text);
          setDone(true);
          onDone?.();
          if (interval) clearInterval(interval);
        } else {
          setRevealed(text.slice(0, i));
        }
      }, intervalMs);
    }, Math.max(0, delay));

    return () => {
      clearTimeout(startTimeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay, animate]);

  if (render) return <>{render(revealed, done)}</>;
  return <>{revealed}</>;
}

/**
 * Estimate how long it takes a Typewriter to finish typing `text` at the
 * given speed, in milliseconds. Used to compute the `delay` for the *next*
 * Typewriter in a sequence.
 */
export function estimateTypeDuration(text: string, speed = 45, buffer = 200): number {
  if (!text) return 0;
  const intervalMs = Math.max(8, Math.round(1000 / speed));
  return text.length * intervalMs + buffer;
}
