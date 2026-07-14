# Phase 2 — Recipe→Layout Routing · Manager Recommendation

**The decision in front of Lisa:** what each slide *recipe* should render as once we fix the
converter that currently dumps most slides to flat full-width stacked text. The layouts already
exist and were approved (Design Intelligence Layer recipes); Phase 2 makes the converter honor
them. These prototypes show the target so we approve the look before wiring.

## The three options (open in a browser)
- **D1 · Visual craft** — `d1-visual.html` — hero numerals, semantic accents, corner-cut cover, hairline-divided stat row.
- **D2 · Flow & variety** — `d2-flow.html` — deck rhythm; alternates image side / density / one dark tonal break at the quote.
- **D3 · System & spec** — `d3-system.html` — one 64px-margin / 12-col grid, 5 reusable primitives, exact region rectangles per recipe.

Local URLs (dev server on :3001): `http://localhost:3001/design-table/phase2-recipe-routing/<file>`
Or just double-click the .html files — they're self-contained.

## Recommended composite (the Manager pick)
Each lens nailed a different layer; the right build takes one thing from each:

- **Skeleton = D3.** Its single grid + region-rectangle-per-recipe is *exactly* the deterministic
  routing this phase needs — it's implementable as-is, no per-slide guessing. Use D3's geometry table
  as the wiring spec.
- **Craft = D1.** Apply D1's treatment on top of D3's regions: the number is the hero element
  (big Space Grotesk, semantic accent alternation), hairline dividers not boxes, the corner-cut
  accent panel on the cover, tinted (not bordered) compare columns.
- **Rhythm = D2.** Adopt D2's deck-level beat so adjacent slides never look the same: alternate the
  image side across split slides, alternate dense/airy, and allow exactly ONE dark tonal break
  (the pull-quote) as the emotional low point.

The type-only slides (cover, top-band, pull-quote, text-led) are the real test — all three solved
the "boring stack" problem with structure (eyebrows, oversized numerals, asymmetric columns,
a vertical rule), not decoration. Keep that principle as a hard rule.

## Recipe → layout decision table (what I'd wire)
Geometry in % of the 960×540 card. `M`=64px margin. Image regions get a scrim + forced-light only
when text overlaps them.

| Recipe | Image role | Geometry (regions) | Treatment |
|---|---|---|---|
| cover-editorial | none / band / column | Title block left, vertical-center; accent rule bottom-left. Optional accent panel right (corner-cut). | Big title; one subtitle line. |
| cover-fullbleed | full-bleed / duotone | Image full-card behind; title lower-third. | Scrim + forced-light title. |
| top-band | band / none | Image strip y0–28% full width; content y35–100% within M. | Heading leads below band. |
| split-image | column | Image x0–46% full height; text x52–100%, vertical-center, ≤3 points. **Side alternates per deck rhythm.** | No scrim (text beside, not over). |
| full-bleed-safe-zone | full-bleed / duotone | Image full-card; text tucked one corner. | Scrim + forced-light. |
| pull-quote | none / full-bleed | Centered both axes, ≤75% width; attribution below w/ accent tick. | One statement, no body. |
| stat-trio | none / texture | Title top; 3 equal cells on baseline row, hairline dividers; number leads each. | Number = hero; texture wash optional. |
| stat-grid | none / texture | Title top; 2×2 matrix, interior hairlines, left accent bar alternating. | Number-led cells. |
| compare-2col | none / duotone | Title top; two 50/50 columns, 1px center divider; left muted / right accent-tinted. | Tint carries the contrast. |
| process-row | none / band | Title top; 4 step-nodes on baseline, numbered discs on a connector track. | Track underline = progression. |
| image-plus-stats | column / band | Image one side; 3 stat cells the other. | Number-led; image beside. |
| text-led | none / texture | Title block + tight supporting line/short list within M; asymmetric, NOT full-width wall. | Structure over length. |

## The fallback fix (the actual bug)
Today, a recipe with no mapping falls to `'stack'` (flat text). New rule: **never fall back to a
bare stack** — an unmapped/imageless slide routes to `text-led` geometry (title block + structured
support), and `cardHasImage()` is corrected to recognize behind-text image roles so split/hero/
full-bleed actually route. Plus: unblock the 2 unreachable recipes (`cover-fullbleed`,
`image-plus-stats`), fix the dead `pickImageRole` branch, and raise the adjacency penalty so
recipes stop clustering.

## What I need from Lisa
Pick a direction — outright (D1/D2/D3/Manager composite) or a mix ("D3 geometry + D1 craft + D2
rhythm" is my recommendation). Once approved, the decision table above becomes the wiring spec for
the implementation pass.
