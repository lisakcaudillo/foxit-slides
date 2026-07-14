/**
 * slide-manifest.ts — build the ROLE MANIFEST a slide's VLM judge call needs to
 * return ELEMENT-ADDRESSED verdicts.
 *
 * The VLM sees a flat PNG; it cannot know that "the big text up top" is the
 * `title` vs. a `metric-value`. So at judge time it hands it the slide's
 * element→content map (built from the freeform blocks the judge already has) and
 * a CLOSED LIST of role names. The VLM then names which element each criterion is
 * about (`element`) + a `change` type, and the fixer maps role→block
 * deterministically. Identity comes from this data, NOT from the render — so the
 * render only has to be good enough for taste.
 *
 * v1 scope: FILLED text elements only. Empty/available slots (for "fill" /
 * add-element) need the layout skeleton and are deferred to the editorial item.
 *
 * Role parsing mirrors geometry-audit.ts exactly: a structured block id is
 * `ff-struct-${role}-${group ?? 'x'}-${i}`, so `(.+)-(\d+)$` recovers the
 * role-group (e.g. `title-cover-title`, `metric-value-sub`). Multi-instance
 * slots (e.g. 3 sub-metrics) share one role-group — addressed at group level in
 * v1, with each instance's content shown.
 */
import type { Card, FreeformTextBlock } from '@/types/card-template';

export interface SlideManifest {
  /** Distinct role-groups present on the slide — the ENUM for the verdict's `element`. */
  roles: string[];
  /** Pre-formatted block for the VLM prompt. Empty string when nothing was extracted. */
  text: string;
}

function trunc(s: string, n = 100): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Role-group for a structured text block, mirroring geometry-audit's parse. */
export function roleGroupOf(block: { id?: string; role?: string }): string {
  if (block.role && block.role.trim()) return block.role.trim();
  const id = typeof block.id === 'string' ? block.id : '';
  const m = id.match(/^ff-struct-(.+)-(\d+)$/);
  return m ? m[1] : (id || 'element');
}

/**
 * Build the role manifest for ONE card. Returns the closed role list + a prompt
 * block. Only non-empty text blocks contribute.
 */
export function buildSlideManifest(card: Card): SlideManifest {
  const byRole = new Map<string, string[]>();
  for (const b of card.freeform ?? []) {
    if (b.type !== 'text') continue;
    const content = ((b as FreeformTextBlock).content ?? '').trim();
    if (!content) continue;
    const rg = roleGroupOf(b as { id?: string; role?: string });
    const arr = byRole.get(rg) ?? [];
    arr.push(content);
    byRole.set(rg, arr);
  }

  const roles = [...byRole.keys()];
  if (roles.length === 0) return { roles: [], text: '' };

  const lines = [...byRole.entries()].map(([rg, vals]) => {
    if (vals.length === 1) {
      return `  ${rg} = "${trunc(vals[0])}" (${wordCount(vals[0])}w)`;
    }
    const shown = vals.map((v, i) => `[${i}] "${trunc(v, 60)}"`).join('  ');
    return `  ${rg} ×${vals.length} = ${shown}`;
  });

  const text =
    'ELEMENTS ON THIS SLIDE (role = current content; address criteria by these role names):\n' +
    lines.join('\n');

  return { roles, text };
}
