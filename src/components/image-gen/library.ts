// ── Shared image-generation engine — library helpers ───────────────────────
//
// Shared home for the client-side library metadata type + ranking helper,
// copied VERBATIM from CardEditor.tsx (LibraryImageMeta ~line 4128,
// rankLibraryBySimilarity ~line 4146). Pulled out so both the wizard
// (/editor/graphics) and the slides accordion render the library + "more like
// this" identically without importing CardEditor. CardEditor itself is left
// untouched in this stage — Stage 4 repoints it to this module.
//
// fetchLibrary() GETs /api/library/list (which returns { images }) and returns
// the metadata array. No fs, no server-side imports — client safe.

// Library image metadata (mirrors LibraryImage in app/src/lib/imageLibrary.ts).
// Kept as a local interface so this client-side module doesn't import the
// server-side fs-backed module.
export interface LibraryImageMeta {
  id: string;
  filename: string;
  prompt: string;
  type: 'photo' | 'diagram';
  quality: string;
  width: number;
  height: number;
  createdAt: string;
  /** Subject/domain category, derived from the `[prefix]` in `prompt`
   *  (e.g. "business-team"). '' when the prompt has no prefix. The category
   *  chips (Media panel) and the home image-category picker both read this
   *  instead of re-parsing the prompt string. */
  category: string;
}

/** Extract the `[category]` prefix from a library prompt string
 *  (`"[business-team] a confident team…" → "business-team"`). */
export function categoryOf(prompt: string): string {
  const m = prompt.match(/^\s*\[([a-z0-9-]+)\]/i);
  return m ? m[1].toLowerCase() : '';
}

/** Curated human labels for category keys; unmapped keys title-case the key. */
const CATEGORY_LABELS: Record<string, string> = {
  'business-team': 'Business', 'modern-office': 'Corporate', technology: 'Technology',
  'healthcare-medical': 'Medical', 'finance-growth': 'Finance', 'marketing-content': 'Marketing',
  'education-learning': 'Education', 'data-analytics': 'Data', 'science-lab': 'Science',
  'creative-design': 'Creative', nature: 'Nature', 'abstract-gradient': 'Abstract',
  'manufacturing-industry': 'Industry', 'people-portrait': 'People', 'food-culinary': 'Food',
  'travel-destination': 'Travel', photographic: 'Photographic', architecture: 'Architecture',
  pattern: 'Patterns',
};
export function categoryLabel(key: string): string {
  if (!key) return '';
  return (
    CATEGORY_LABELS[key] ??
    key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
}

/** Rank library items by token-overlap similarity to a query prompt.
 *  Lightweight Jaccard: tokenize lowercase alphanumeric runs, drop short
 *  tokens and stopwords, intersect / union. No embeddings, no infra —
 *  works on the prompt strings already stored in metadata.json. Mirrors
 *  Gamma's "more like this" pattern after a generation. Excludes items
 *  whose prompt is byte-equal to the query (the freshly-generated image
 *  itself, when called right after a successful gen). */
export function rankLibraryBySimilarity(
  items: LibraryImageMeta[],
  queryPrompt: string,
): LibraryImageMeta[] {
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'with', 'and', 'or',
    'from', 'at', 'by', 'is', 'that', 'this', 'it', 'as', 'be', 'are',
    'into', 'photograph', 'illustration', 'image', 'picture', 'professional',
  ]);
  const tokenize = (s: string) => {
    const matches = s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return matches.filter((t) => t.length > 2 && !STOPWORDS.has(t));
  };
  const queryTokens = new Set(tokenize(queryPrompt));
  if (queryTokens.size === 0) return [];
  return items
    .map((item) => {
      if (item.prompt === queryPrompt) return { item, score: -1 };
      const itemTokens = new Set(tokenize(item.prompt));
      let intersection = 0;
      for (const t of queryTokens) if (itemTokens.has(t)) intersection += 1;
      const union = queryTokens.size + itemTokens.size - intersection;
      const score = union > 0 ? intersection / union : 0;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/** Fetch the full image-library index from /api/library/list. The route
 *  returns `{ images }`; we return the array (empty on any failure so the
 *  UI degrades to "empty library" rather than throwing). */
export async function fetchLibrary(): Promise<LibraryImageMeta[]> {
  try {
    const res = await fetch('/api/library/list');
    if (!res.ok) return [];
    const json = (await res.json()) as {
      images?: Array<Omit<LibraryImageMeta, 'category'> & { category?: string }>;
    };
    const arr = Array.isArray(json.images) ? json.images : [];
    // Populate the derived category from the prompt prefix if the route
    // didn't already supply one.
    return arr.map((im) => ({ ...im, category: im.category || categoryOf(im.prompt) }));
  } catch {
    return [];
  }
}

/** The public URL a library filename is served from (Next serves public/). */
export function libraryImageUrl(filename: string): string {
  return `/library/images/${filename}`;
}
