# Phase 2 — Recipe→Layout Routing + Background Art + Style Foundation

Consolidated spec from the design-table. Supersedes MANAGER-recommendation.md (which holds the
layout geometry table — still valid, referenced below).

## Decisions locked (Lisa, this session)
- **Layout base:** Manager composite (round-1 winner). — *pending explicit final sign-off*
- **Background art:** mixed BY SLIDE ROLE — glass covers · per-theme motif on content slides · texture wash on stat/quote slides. Built with the REAL assets (Background.svg glass vocabulary, CoverArt motifs, real icon set).
- **Art intensity:** NOT a global user knob. It is a **property of style/archetype.** Both Restrained and Expressive ship; the system picks which.
- **Style foundation** is built INTO Phase 2. The user-facing Magic/style UI + AI bespoke-theme generation is a **separate follow-on phase**.

---

## Part A — Layout routing fix (original Phase 2 scope)
The converter currently dumps most slides to flat stacked text. Fix:
- `templateForRecipe()` honors each recipe → its real layout (geometry table in MANAGER-recommendation.md).
- `cardHasImage()` recognizes behind-text image roles (full-bleed/duotone/texture/background) so hero/split route.
- Unblock the 2 unreachable recipes (`cover-fullbleed`, `image-plus-stats`).
- Fix the dead `pickImageRole` branch; raise the adjacency penalty so recipes stop clustering.
- **Never fall back to a bare `stack`** — an unmapped/imageless slide routes to `text-led` geometry (structured), not flat text.

## Part B — Background art by slide role
| Slide role | Art treatment | Asset source |
|---|---|---|
| Cover | Glassmorphism backdrop, theme-tinted, scrim/veil off the title | inline Background.svg glass vocabulary |
| Content (band/compare/process/split/icon-grid) | Subtle per-theme motif, corner-anchored, low opacity | CoverArt.tsx motif language |
| Stat / quote | Texture wash / soft gradient field | library texture images / CoverArt washes |
- Contrast machinery reused: art on `z=0`, content `z≥2`; scrim + forced-light where text overlaps art; motifs kept out of text safe zones.
- **Intensity scales the art** (opacity/size/presence) per the `artIntensity` of the active style — see Part C.

## Part C — Style → archetype → art-intensity foundation (the new bit)
The 42 themes are ALREADY tagged with an archetype (`editorial / cinematic / warm / product`) the planner reads. Phase 2 lights that up as a real style axis:
- Add `artIntensity: 'restrained' | 'medium' | 'expressive'` (data, in design-types/recipes).
- Add a **style** concept mapping each style → archetype + theme pool + artIntensity:

| Style | Archetype | Theme pool | Art intensity |
|---|---|---|---|
| ✨ **Magic** (default) | AI/heuristic picks from content | all | picked |
| Modern | editorial | light | restrained |
| Corporate | product | muted/professional | restrained |
| Tech | cinematic | dark | medium |
| Bold / Expressive | cinematic | — | expressive |
| Artistic / Abstract | (expressive) | abstract/glass-forward | expressive |

- **Default = Magic:** a heuristic (later AI) reads content signals (topic / audience / tone) and selects archetype + theme + intensity. This replaces today's *random* theme-on-generate with an *intelligent* pick.
- Output drives BOTH theme selection AND background-art intensity — one decision, not two knobs.

---

## Follow-on phase (separate) — "Magic" UI + bespoke themes
NOT in Phase 2. Captured so we don't lose it (Lisa: "Full" scope):
- User-facing **style chip row** (Modern / Corporate / Tech / Bold / Artistic / ✨ Magic) — default Magic, optional steer. Consolidates the fragmented Inspire/Layouts/Templates entry points; **no new competing button.**
- **AI generates a bespoke theme per deck** (not just pick from the 42) — ties into the existing theme-from-inspiration capability.

## Parked / separate
- **Layouts picker reportedly broken** (Lisa flagged "I don't think it works") — verify as its own bug, not part of Phase 2.

## Gate
Implementation starts only after Lisa: (1) confirms the Manager-composite layout base, (2) signs off this spec.
