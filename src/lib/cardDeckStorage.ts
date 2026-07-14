/**
 * Card deck storage — localStorage-backed persistence for CardTemplate decks
 * created in /editor/slides. Mirrors the shape and pattern of documentStorage:
 * single index key → array of stored entries, each identified by a deck id.
 *
 * The stored shape is the full CardTemplate (cards, theme references, themeId)
 * plus timestamps. This is what the editor needs to restore a session: the
 * cards themselves AND the active document theme that was applied when the
 * deck was last edited.
 *
 * Theme persistence rationale (per Lisa, 2026-04-29):
 *   "if I open content with dark mode set, it should be in dark mode"
 * The themeId on CardTemplate is read on load and passed to ThemeProvider
 * via setTheme(). New decks default to the default theme — picking a dark
 * theme on Deck A does not affect Deck B.
 */

import type { Card, CardTemplate, FreeformBlock } from '@/types/card-template';

const STORAGE_KEY = 'compose:card-decks';

/**
 * Bumped to 2 on 2026-05-21 when the editor moved to the unified-format model
 * (every block is a FreeformBlock). Pre-unified decks (v1 or no version) are
 * silently skipped on load.
 *
 * Bumped to 3 on 2026-06-03 (Issue #1) when the legacy split-layout accent
 * half-panel was removed. Decks saved in format 2 had their split-layout
 * content baked into one half (the other half held the gradient accent panel);
 * with the panel gone that half is now empty and the content looks lopsided.
 * Unlike the v1→v2 hard cut, format 2 → 3 is MIGRATED, not skipped:
 * `migrateDeckV2toV3` reflows the converter-produced content of split cards to
 * full width on load (see getAllDecks). New saves are written at format 3.
 */
export const CURRENT_DECK_FORMAT = 4;
// Phase A (2026-06-11): new decks are composed SERVER-side and saved as format 4 (provenance
// only — the block shape is identical to format 3). Old format-3 decks must still load and
// render exactly as saved (frozen-render), so the load filter accepts format ≥ 3, not ≥ CURRENT.
// No migration is needed: format-3 decks render their stored positioned blocks untouched.
export const MIN_RENDERABLE_FORMAT = 3;

// ── Format 2 → 3 migration (Issue #1, 2026-06-03) ───────────────────────────
// Geometry of the legacy split layout: the accent half took ~45% on one side;
// the freeform converter (structuredToFreeform.boundsForLayout, pre-fix) packed
// content into the OTHER ~41%-wide half: split-left → content right [52..93],
// split-right → content left [7..48]. Full-width content margins are [7..93]
// (86% wide). We linearly remap each converter block from its source half onto
// the full width so relative layout (e.g. smart-layout columns) is preserved.
const FULL_LEFT = 7;
const FULL_RIGHT = 93;
const FULL_WIDTH = FULL_RIGHT - FULL_LEFT; // 86
const HALF_WIDTH = 41;
const HALF_SCALE = FULL_WIDTH / HALF_WIDTH; // ~2.10

/** Reflow a single legacy split-layout card's converter content to full width.
 *  Returns the card unchanged when it isn't a split layout, has no freeform,
 *  or carries a real image (the Design Intelligence Layer placed that image and
 *  positioned content around it — leave those alone). Only converter-produced
 *  blocks (`ff-conv-*` ids) that sit within the legacy content half are
 *  remapped; user-added blocks keep their exact position. */
function reflowLegacySplitCard(card: Card): Card {
  if (card.layout !== 'split-left' && card.layout !== 'split-right') return card;
  const ff = card.freeform;
  if (!ff || ff.length === 0) return card;

  // A real image means the DIL owns this card's composition — don't touch it.
  const hasRealImage = ff.some(
    (b) => b.type === 'image' && typeof b.src === 'string' && b.src.length > 0,
  );
  if (hasRealImage) return card;

  // Source content half for this layout.
  const regionStart = card.layout === 'split-left' ? 52 : FULL_LEFT; // 52 or 7
  const regionEnd = regionStart + HALF_WIDTH; // 93 or 48

  const remapped: FreeformBlock[] = ff.map((b) => {
    const isConverter = typeof b.id === 'string' && b.id.startsWith('ff-conv-');
    if (!isConverter) return b;
    // Only remap blocks that actually sit in the legacy content half (small
    // tolerance). Skips already-full-width or out-of-region blocks, so the
    // transform is a no-op if it somehow runs twice.
    if (b.x < regionStart - 2 || b.x > regionEnd + 2) return b;
    const newX = FULL_LEFT + (b.x - regionStart) * HALF_SCALE;
    const clampedX = Math.max(FULL_LEFT, Math.min(newX, FULL_RIGHT));
    const newW = Math.min(b.w * HALF_SCALE, FULL_RIGHT - clampedX);
    return { ...b, x: clampedX, w: newW };
  });

  return { ...card, freeform: remapped };
}

/** Upgrade a format-2 deck to format 3 by reflowing its split-layout cards. */
function migrateDeckV2toV3(deck: StoredCardDeck): StoredCardDeck {
  return {
    ...deck,
    formatVersion: 3,
    template: { ...deck.template, cards: deck.template.cards.map(reflowLegacySplitCard) },
  };
}

export interface StoredCardDeck {
  /** Unique deck id — kept distinct from CardTemplate.id (which is a template id). */
  deckId: string;
  /** Format version this deck was saved in. Missing/older = orphaned, skipped on load. */
  formatVersion?: number;
  template: CardTemplate;
  /** Optional folder this deck lives in. null/undefined = root of /compose. */
  folderId?: string | null;
  /** The original generation prompt that produced this deck, kept as durable
   *  metadata (task_011b782f). Distinct from `template.description`, which we no
   *  longer rely on as the prompt store. Absent on legacy/hand-made decks. */
  sourcePrompt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Get all stored decks, sorted most-recently-updated first. Decks saved in
 *  an older format (missing or older `formatVersion`) are filtered out — the
 *  unified-format rewrite (2026-05-21) is a hard cut. */
export function getAllDecks(): StoredCardDeck[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const decks = JSON.parse(raw) as StoredCardDeck[];
    if (!Array.isArray(decks)) return [];

    // One-time migration: format-2 decks (legacy split accent half) are
    // reflowed to full width and bumped to format 3. Pre-unified decks (v1) are
    // left untouched in storage and filtered out below, as before. Persist the
    // upgraded set once so the reflow isn't recomputed on every read.
    let didMigrate = false;
    const all = decks.map((d) => {
      if ((d.formatVersion ?? 1) === 2) {
        didMigrate = true;
        return migrateDeckV2toV3(d);
      }
      return d;
    });
    if (didMigrate) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {
        // Quota / private mode — in-memory migration still applies for this read.
      }
    }

    const current = all.filter((d) => (d.formatVersion ?? 1) >= MIN_RENDERABLE_FORMAT);
    return [...current].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

/** Get a single deck by its id, or null if not found. */
export function getDeck(deckId: string): StoredCardDeck | null {
  const decks = getAllDecks();
  return decks.find((d) => d.deckId === deckId) ?? null;
}

/** Strip session-only flags from freeform blocks before persisting so a
 *  reload doesn't replay them. Currently:
 *    - __animateOnMount (set by streaming/done handlers to trigger typewriter
 *      reveal on first paint — should only fire during the live stream,
 *      never on subsequent loads).
 *    - __animateDelay (cumulative per-block start delay that chains the
 *      typewriter reveal card-by-card during a fresh generation — meaningless
 *      on reload, so it's dropped alongside __animateOnMount).
 *  Returns a deep-enough copy that mutation is safe; preserves all other
 *  block properties. */
function stripSessionFlags(template: CardTemplate): CardTemplate {
  return {
    ...template,
    cards: template.cards.map((card) => ({
      ...card,
      freeform: card.freeform?.map((b) => {
        const { __animateOnMount: _ignore, __animateDelay: _ignoreDelay, ...rest } =
          b as typeof b & { __animateOnMount?: boolean; __animateDelay?: number };
        void _ignore;
        void _ignoreDelay;
        return rest as typeof b;
      }),
    })),
  };
}

/** Save (upsert) a deck. Updates `updatedAt`; preserves `createdAt` if existing. */
export function saveDeck(
  deckId: string,
  template: CardTemplate,
  opts?: { sourcePrompt?: string },
): StoredCardDeck {
  // Strip session-only flags (e.g. __animateOnMount) so they don't ride
  // along into storage and trigger replay on next load.
  const cleanTemplate = stripSessionFlags(template);
  if (typeof window === 'undefined') {
    return {
      deckId,
      template: cleanTemplate,
      sourcePrompt: opts?.sourcePrompt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const decks = getAllDecks();
  const now = new Date().toISOString();
  const existing = decks.findIndex((d) => d.deckId === deckId);

  const entry: StoredCardDeck = {
    deckId,
    formatVersion: CURRENT_DECK_FORMAT,
    template: cleanTemplate,
    // Preserve any folder placement — saveDeck doesn't touch organisation.
    folderId: existing >= 0 ? decks[existing].folderId : undefined,
    // Preserve the original prompt across the editor's many auto-saves (which
    // omit the option); only the generation save sites pass it explicitly.
    sourcePrompt: opts?.sourcePrompt ?? (existing >= 0 ? decks[existing].sourcePrompt : undefined),
    createdAt: existing >= 0 ? decks[existing].createdAt : now,
    updatedAt: now,
  };

  if (existing >= 0) {
    decks[existing] = entry;
  } else {
    decks.unshift(entry);
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch (err) {
    // Storage full (or private mode): the deck did NOT persist. Previously this
    // was swallowed silently — so a freshly-generated deck would render in
    // memory, then VANISH on the next reload/navigation, leaving the user on an
    // empty 1-slide editor with no explanation. Signal it instead so the UI can
    // tell them the deck wasn't saved (and how to fix it). In-memory state still
    // applies for this session.
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('compose:deck-save-failed', {
          detail: { reason: isQuota ? 'quota' : 'unknown' },
        }),
      );
    }
  }
  return entry;
}

/** Delete a deck by id. Returns true if anything was removed. */
export function deleteDeck(deckId: string): boolean {
  if (typeof window === 'undefined') return false;
  const decks = getAllDecks();
  const filtered = decks.filter((d) => d.deckId !== deckId);
  if (filtered.length === decks.length) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    return false;
  }
  return true;
}

/** Generate a deck id. Time-prefixed so most-recent sorts cleanly even
 *  before any updatedAt is recorded. */
export function generateDeckId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `deck_${ts}_${rand}`;
}

/** Move a deck into a folder (or to the root with null). Returns true if
 *  the deck existed. Updates `updatedAt`. */
export function setDeckFolder(deckId: string, folderId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const decks = getAllDecks();
  const idx = decks.findIndex((d) => d.deckId === deckId);
  if (idx < 0) return false;
  decks[idx] = {
    ...decks[idx],
    folderId: folderId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    return false;
  }
  return true;
}

// ── Deck AI summary cache ────────────────────────────────────────────────────
// On-demand presenter summary (deck detail page), cached so it's billed at most
// once per deck and regenerated only when the slide content changes. Kept in a
// separate key from the deck index so saving a deck never disturbs it.

const SUMMARY_KEY = 'compose:deck-summaries';

export interface DeckSummary {
  overview: string;
  arc: string;
  keyNumbers: string[];
  /** Hash of the slide content this summary was generated from — used to
   *  detect staleness when the deck changes. */
  sourceHash: string;
  generatedAt: string;
}

/** Cheap, stable string hash for deck content staleness checks. */
export function hashDeckContent(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readSummaries(): Record<string, DeckSummary> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SUMMARY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DeckSummary>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getDeckSummary(deckId: string): DeckSummary | null {
  return readSummaries()[deckId] ?? null;
}

export function saveDeckSummary(deckId: string, summary: DeckSummary): void {
  if (typeof window === 'undefined') return;
  const all = readSummaries();
  all[deckId] = summary;
  try {
    window.localStorage.setItem(SUMMARY_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode — caching is best-effort */
  }
}

// ── Last-edited slide (resume) ───────────────────────────────────────────────
// Tracks the slide the user last had active in the editor, per deck, so the
// deck detail page can offer "pick up where you left off". 0-based index.

const LAST_SLIDE_KEY = 'compose:deck-last-slide';

export function getLastSlide(deckId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SLIDE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, number>;
    const v = map?.[deckId];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveLastSlide(deckId: string, index: number): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LAST_SLIDE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[deckId] = index;
    window.localStorage.setItem(LAST_SLIDE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

// ─── Cross-deck slide search + silent agent memory ──────────────────────────
// The user opts into "memory" implicitly by making decks. Every generated slide
// carries a `metadata` object (keywords/entities/narrativeRole/angle/…). These
// helpers use that metadata for two jobs:
//   1. Cross-deck slide SEARCH — "find the slide about Zenithly" → hits any
//      slide whose metadata matches, tells you which deck.
//   2. Silent PLAN-AGENT MEMORY — before generating, gather the user's prior
//      decks' SHAPES (arc, layouts, angle, audience) and feed the top few to
//      the plan agent as context. NEVER surfaced to the user. Shape only,
//      never content (FR11 hard line).
//
// Both jobs stay client-side: read localStorage, score, return. No embeddings,
// no network. Same infrastructure — cheap and testable.

/** One search result — a slide hit + its home deck. */
export interface SlideSearchResult {
  deckId: string;
  deckName: string;
  slideIndex: number;
  slideTitle: string;
  /** 0-100 relevance score — higher = better match. */
  score: number;
  /** Which matched terms fired, for UI highlighting. */
  matched: string[];
  createdAt: string;
}

/** Extract a slide's rendered title (first heading-style text block). */
function slideTitle(card: Card): string {
  for (const b of card.freeform ?? []) {
    if (b.type === 'text' && (b as { variant?: string }).variant === 'heading') {
      return (b as { content?: string }).content ?? '';
    }
  }
  // Fallback: the id-labeled title block used by the native builder.
  for (const b of card.freeform ?? []) {
    if (b.type === 'text' && b.id.includes('title-title')) {
      return (b as { content?: string }).content ?? '';
    }
  }
  return '';
}

/** Search every stored slide by keyword and return ranked matches. Runs
 *  ENTIRELY client-side, in memory, across all decks the user has locally.
 *  Hard-capped at 40 results. */
export function searchSlides(query: string, maxResults = 40): SlideSearchResult[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const decks = getAllDecks();
  const hits: SlideSearchResult[] = [];
  for (const deck of decks) {
    const cards = deck.template?.cards ?? [];
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const meta = card.metadata;
      if (!meta) continue; // Only indexed slides. Old decks light up after backfill.

      const hay: string[] = [
        ...(meta.keywords ?? []),
        ...(meta.entities ?? []).map((e) => e.toLowerCase()),
      ];
      const haySet = new Set(hay);

      const matched: string[] = [];
      let score = 0;
      for (const t of terms) {
        // Exact keyword hit
        if (haySet.has(t)) { score += 10; matched.push(t); continue; }
        // Substring hit in any entity (catches "Zenith" in "Zenithly")
        const sub = (meta.entities ?? []).find((e) => e.toLowerCase().includes(t));
        if (sub) { score += 5; matched.push(sub); continue; }
        // Weak: any keyword STARTSWITH the term (partial match)
        const pw = hay.find((k) => k.startsWith(t));
        if (pw) { score += 2; matched.push(pw); }
      }
      // Small recency bonus so recent slides bubble up when scores tie.
      const days = meta.createdAt ? Math.max(0, (Date.now() - Date.parse(meta.createdAt)) / (86400 * 1000)) : 365;
      const recency = Math.max(0, 3 - Math.floor(days / 30)); // 0-3 points
      score += recency;

      if (score > 0) {
        hits.push({
          deckId: deck.deckId,
          deckName: deck.template?.name ?? '(untitled deck)',
          slideIndex: i,
          slideTitle: slideTitle(card),
          score,
          matched: Array.from(new Set(matched)),
          createdAt: meta.createdAt ?? deck.createdAt,
        });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, maxResults);
}

/** Compact per-deck record fed to the plan agent as "prior decks context".
 *  SHAPE ONLY — never facts. Never shown to the user. */
export interface PriorDeckContext {
  name: string;
  audience?: string;
  tone?: string;
  angle?: string;
  cardCount: number;
  arc: string[];               // e.g. ['hook','evidence','cause','response','close']
  layouts: string[];           // e.g. ['native-slide-0','native-slide-8', ...]
  createdAt: string;
}

/** Gather the top-N prior decks whose SHAPE is similar to the current request.
 *  Called by the client before /api/ai/generate-cards, sent in the payload,
 *  fed into the plan agent's Phase 0 context. Hard cap prevents context bloat
 *  even if the user has 500 decks. */
export function getPriorDeckContext(
  currentPrompt: string,
  currentAudience: string | undefined,
  maxPriorDecks = 3,
): PriorDeckContext[] {
  const decks = getAllDecks();
  if (decks.length === 0) return [];
  const promptTerms = new Set(
    (currentPrompt ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );

  const scored = decks.map((deck) => {
    const cards = deck.template?.cards ?? [];
    if (cards.length === 0) return { deck, score: -1 };
    const firstMeta = cards[0]?.metadata;
    let score = 0;
    // Audience match — strongest single signal.
    if (currentAudience && firstMeta?.audience === currentAudience) score += 5;
    // Keyword overlap against the deck's own sourcePrompt.
    const prior = (deck.sourcePrompt ?? '').toLowerCase().split(/[^a-z0-9]+/);
    let overlap = 0;
    for (const w of prior) if (w.length >= 3 && promptTerms.has(w)) overlap += 1;
    score += Math.min(overlap, 5); // cap keyword contribution
    // Small recency bonus.
    const days = firstMeta?.createdAt ? Math.max(0, (Date.now() - Date.parse(firstMeta.createdAt)) / (86400 * 1000)) : 365;
    if (days < 30) score += 2; else if (days < 90) score += 1;
    return { deck, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.score >= 4).slice(0, maxPriorDecks);

  return relevant.map(({ deck }) => {
    const cards = deck.template?.cards ?? [];
    const first = cards[0]?.metadata;
    const arc: string[] = [];
    const layouts: string[] = [];
    for (const c of cards) {
      if (c.metadata?.narrativeRole) arc.push(c.metadata.narrativeRole);
      if (c.metadata?.layoutId) layouts.push(c.metadata.layoutId);
    }
    return {
      name: deck.template?.name ?? '(untitled)',
      audience: first?.audience,
      tone: first?.tone,
      angle: first?.angle,
      cardCount: cards.length,
      arc,
      layouts,
      createdAt: first?.createdAt ?? deck.createdAt,
    };
  });
}
