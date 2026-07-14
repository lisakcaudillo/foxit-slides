/**
 * Output formatter — produces JSON and HTML reports from alignment results.
 *
 * Generates:
 * - JSON report: structured change data with provenance
 * - HTML report: self-contained with Cards + Side-by-Side views
 *
 * Uses word-level LCS diff for inline change highlighting.
 *
 * Ported from: atlas/engine/comparison/formatter.py
 */

import type {
  AlignmentResult,
  DeltaClassification,
  CertaintyLevel,
} from "./aligner";

// ---------------------------------------------------------------------------
// Word-level diff (LCS algorithm)
// ---------------------------------------------------------------------------

export interface DiffSegment {
  text: string;
  type: "equal" | "delete" | "insert";
}

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [];
}

/**
 * Compute word-level diff between two texts using LCS.
 * Returns marked-up HTML strings for each side.
 */
export function wordDiffHtml(
  textA: string,
  textB: string,
): { htmlA: string; htmlB: string } {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  const m = tokensA.length;
  const n = tokensB.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tokensA[i - 1] === tokensB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to get opcodes
  interface OpCode {
    op: "equal" | "delete" | "insert" | "replace";
    i1: number;
    i2: number;
    j1: number;
    j2: number;
  }

  const opcodes: OpCode[] = [];
  let i = m;
  let j = n;

  // Collect matched positions first
  const matchesA: boolean[] = new Array(m).fill(false);
  const matchesB: boolean[] = new Array(n).fill(false);
  let ii = m;
  let jj = n;
  while (ii > 0 && jj > 0) {
    if (tokensA[ii - 1] === tokensB[jj - 1]) {
      matchesA[ii - 1] = true;
      matchesB[jj - 1] = true;
      ii--;
      jj--;
    } else if (dp[ii - 1][jj] >= dp[ii][jj - 1]) {
      ii--;
    } else {
      jj--;
    }
  }

  // Build opcodes from matches
  let ai = 0;
  let bi = 0;
  while (ai < m || bi < n) {
    if (ai < m && bi < n && matchesA[ai] && matchesB[bi]) {
      // Equal
      const startA = ai;
      const startB = bi;
      while (ai < m && bi < n && matchesA[ai] && matchesB[bi]) {
        ai++;
        bi++;
      }
      opcodes.push({ op: "equal", i1: startA, i2: ai, j1: startB, j2: bi });
    } else {
      const startA = ai;
      const startB = bi;
      while (ai < m && !matchesA[ai]) ai++;
      while (bi < n && !matchesB[bi]) bi++;
      if (startA < ai && startB < bi) {
        opcodes.push({ op: "replace", i1: startA, i2: ai, j1: startB, j2: bi });
      } else if (startA < ai) {
        opcodes.push({ op: "delete", i1: startA, i2: ai, j1: startB, j2: bi });
      } else if (startB < bi) {
        opcodes.push({ op: "insert", i1: startA, i2: ai, j1: startB, j2: bi });
      }
    }
  }

  // Build HTML
  const partsA: string[] = [];
  const partsB: string[] = [];

  for (const code of opcodes) {
    const segA = tokensA.slice(code.i1, code.i2).join("");
    const segB = tokensB.slice(code.j1, code.j2).join("");
    const escA = escapeHtml(segA);
    const escB = escapeHtml(segB);

    switch (code.op) {
      case "equal":
        partsA.push(escA);
        partsB.push(escB);
        break;
      case "delete":
        partsA.push(`<mark class="wd-del">${escA}</mark>`);
        break;
      case "insert":
        partsB.push(`<mark class="wd-ins">${escB}</mark>`);
        break;
      case "replace":
        partsA.push(`<mark class="wd-del">${escA}</mark>`);
        partsB.push(`<mark class="wd-ins">${escB}</mark>`);
        break;
    }
  }

  return { htmlA: partsA.join(""), htmlB: partsB.join("") };
}

// ---------------------------------------------------------------------------
// Classification colour scheme
// ---------------------------------------------------------------------------

const CLASSIFICATIONS: DeltaClassification[] = [
  "unchanged",
  "moved",
  "changed",
  "deleted",
  "added",
];

const BADGE_COLOURS: Record<string, [string, string]> = {
  unchanged: ["#6b7280", "#f3f4f6"],
  moved: ["#1d4ed8", "#dbeafe"],
  changed: ["#92400e", "#fef3c7"],
  deleted: ["#991b1b", "#fee2e2"],
  added: ["#166534", "#dcfce7"],
};

const CARD_BORDER: Record<string, string> = {
  unchanged: "#d1d5db",
  moved: "#bfdbfe",
  changed: "#fbbf24",
  deleted: "#fca5a5",
  added: "#6ee7b7",
};

const BLOCK_BG: Record<string, string> = {
  deleted: "#fff5f5",
  added: "#f0fdf4",
  changed_a: "#fffbeb",
  changed_b: "#eff6ff",
};

const CLAUSE_TYPE_STYLE: Record<string, [string, string, string]> = {
  "definition": ["Definition", "#6d28d9", "#ede9fe"],
  "obligation": ["Obligation", "#0369a1", "#e0f2fe"],
  "condition-precedent": ["Condition Precedent", "#a16207", "#fef9c3"],
  "termination": ["Termination", "#b91c1c", "#fee2e2"],
  "representation": ["Representation", "#047857", "#d1fae5"],
};

const CERTAINTY_COLORS: Record<string, [string, string]> = {
  definitive: ["#166534", "#dcfce7"],
  conditional: ["#92400e", "#fef3c7"],
  ambiguous: ["#991b1b", "#fee2e2"],
};

const GROUP_ORDER: DeltaClassification[] = [
  "changed",
  "deleted",
  "added",
  "moved",
  "unchanged",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function pageRef(row: AlignmentResult): string {
  const { page_a: pa, page_b: pb, classification: cls } = row;
  if (cls === "deleted") return pa !== null ? `p.${pa}` : "";
  if (cls === "added") return pb !== null ? `p.${pb}` : "";
  if (cls === "moved") return `p.${pa} → p.${pb}`;
  if (pa !== null && pb !== null) return pa !== pb ? `p.${pa} → p.${pb}` : `p.${pa}`;
  return pa !== null ? `p.${pa}` : pb !== null ? `p.${pb}` : "";
}

function sortedRows(
  rows: AlignmentResult[],
  sortMode: "page" | "priority" = "page",
): AlignmentResult[] {
  if (sortMode === "priority") {
    return [...rows].sort((a, b) => {
      const dp = (b.review_priority ?? 0) - (a.review_priority ?? 0);
      if (dp !== 0) return dp;
      return (a.page_a ?? a.page_b ?? 9999) - (b.page_a ?? b.page_b ?? 9999);
    });
  }
  return [...rows].sort((a, b) => {
    const pa = a.page_a ?? a.page_b ?? 9999;
    const pb = b.page_a ?? b.page_b ?? 9999;
    if (pa !== pb) return pa - pb;
    return (a.page_b ?? 9999) - (b.page_b ?? 9999);
  });
}

function snippet(row: AlignmentResult, maxChars: number = 100): string {
  const cls = row.classification;
  const text =
    cls === "added" ? row.text_b ?? "" : row.text_a ?? "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      const s = trimmed.slice(0, maxChars);
      return trimmed.length > maxChars ? s + "\u2026" : s;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// JSON report
// ---------------------------------------------------------------------------

export interface JsonReport {
  generated_at: string;
  document_a: string;
  document_b: string;
  summary: {
    total_chunks_a: number;
    total_chunks_b: number;
    unchanged: number;
    moved: number;
    changed: number;
    deleted: number;
    added: number;
  };
  changes: JsonChange[];
}

export interface JsonChange {
  classification: DeltaClassification;
  section_id: string | null;
  clause_number: string | null;
  page_a: number | null;
  page_b: number | null;
  combined_score: number;
  text_a: string | null;
  text_b: string | null;
  impact_summary: string | null;
  hedged_summary: string | null;
  certainty_level: CertaintyLevel | null;
  match_signals: AlignmentResult["match_signals"];
  summary_verified: boolean | null;
  clause_type_a: string | null;
  clause_type_b: string | null;
  review_priority: number;
  type_change: string | null;
  provenance: {
    mode: string;
    chunk_id_a: number | null;
    chunk_id_b: number | null;
    page_span_a: [number, number] | null;
    page_span_b: [number, number] | null;
    alignment_confidence: number;
    verified: boolean | null;
  };
}

export function buildJsonReport(
  rows: AlignmentResult[],
  docNameA: string,
  docNameB: string,
  generatedAt?: string,
): JsonReport {
  const ts = generatedAt ?? new Date().toISOString();

  const counts: Record<DeltaClassification, number> = {
    unchanged: 0,
    moved: 0,
    changed: 0,
    deleted: 0,
    added: 0,
  };
  for (const r of rows) {
    counts[r.classification] = (counts[r.classification] ?? 0) + 1;
  }

  const totalA = rows.filter((r) => r.chunk_id_a !== null).length;
  const totalB = rows.filter((r) => r.chunk_id_b !== null).length;

  const changes: JsonChange[] = sortedRows(rows).map((r) => {
    const pageSpanA: [number, number] | null =
      r.page_a !== null
        ? [r.page_a, r.page_span_end_a ?? r.page_a]
        : null;
    const pageSpanB: [number, number] | null =
      r.page_b !== null
        ? [r.page_b, r.page_span_end_b ?? r.page_b]
        : null;

    return {
      classification: r.classification,
      section_id: r.section_id,
      clause_number: r.clause_number,
      page_a: r.page_a,
      page_b: r.page_b,
      combined_score: Math.round(r.combined_score * 10000) / 10000,
      text_a: r.text_a,
      text_b: r.text_b,
      impact_summary: r.impact_summary,
      hedged_summary: r.hedged_summary,
      certainty_level: r.certainty_level,
      match_signals: r.match_signals,
      summary_verified: r.summary_verified,
      clause_type_a: r.clause_type_a,
      clause_type_b: r.clause_type_b,
      review_priority: r.review_priority,
      type_change: r.type_change,
      provenance: {
        mode: r.source_mode,
        chunk_id_a: r.chunk_id_a,
        chunk_id_b: r.chunk_id_b,
        page_span_a: pageSpanA,
        page_span_b: pageSpanB,
        alignment_confidence: Math.round(r.combined_score * 10000) / 10000,
        verified: r.summary_verified,
      },
    };
  });

  return {
    generated_at: ts,
    document_a: docNameA,
    document_b: docNameB,
    summary: {
      total_chunks_a: totalA,
      total_chunks_b: totalB,
      ...counts,
    },
    changes,
  };
}

// ---------------------------------------------------------------------------
// HTML report builder
// ---------------------------------------------------------------------------

function renderCertBadge(certLevel: CertaintyLevel | null): string {
  if (!certLevel) return "";
  const [fg, bg] = CERTAINTY_COLORS[certLevel] ?? ["#6b7280", "#f3f4f6"];
  return (
    `<span style="display:inline-block;font-size:10px;font-weight:600;` +
    `color:${fg};background:${bg};padding:1px 6px;border-radius:9999px;` +
    `margin-right:6px;vertical-align:middle;text-transform:uppercase">` +
    `${escapeHtml(certLevel)}</span>`
  );
}

function renderCard(row: AlignmentResult, idx: number): string {
  const cls = row.classification;
  const [badgeFg, badgeBg] = BADGE_COLOURS[cls] ?? ["#374151", "#f9fafb"];
  const borderCol = CARD_BORDER[cls] ?? "#e5e7eb";

  const clause = escapeHtml(row.clause_number ?? row.section_id ?? "\u2014");
  const pageRefStr = escapeHtml(pageRef(row));
  const snippetStr = escapeHtml(snippet(row));

  let bodyHtml = "";

  if (cls === "changed") {
    const textA = row.text_a ?? "";
    const textB = row.text_b ?? "";
    const { htmlA: diffA, htmlB: diffB } = wordDiffHtml(textA, textB);
    bodyHtml =
      `<div class="side-by-side">` +
      `<div class="side side-a"><div class="side-label">Original</div><pre class="diff-pre">${diffA}</pre></div>` +
      `<div class="side side-b"><div class="side-label">Revised</div><pre class="diff-pre">${diffB}</pre></div>` +
      `</div>`;
    const displaySummary = row.hedged_summary ?? row.impact_summary;
    if (displaySummary) {
      bodyHtml +=
        `<div class="impact-callout">` +
        `${renderCertBadge(row.certainty_level)}` +
        `<span class="impact-label">Impact</span> ${escapeHtml(displaySummary)}` +
        `</div>`;
    }
  } else if (cls === "moved") {
    const text = row.text_a ?? row.text_b ?? "";
    const note =
      row.page_a !== null && row.page_b !== null
        ? `Moved from p.${row.page_a} to p.${row.page_b}`
        : "Position changed";
    bodyHtml =
      `<div class="moved-note">${escapeHtml(note)}</div>` +
      `<div class="text-block" style="background:#eff6ff"><pre class="tb-text">${escapeHtml(text)}</pre></div>`;
  } else if (cls === "deleted") {
    bodyHtml = `<div class="text-block" style="background:${BLOCK_BG.deleted}"><pre class="tb-text">${escapeHtml(row.text_a ?? "")}</pre></div>`;
  } else if (cls === "added") {
    bodyHtml = `<div class="text-block" style="background:${BLOCK_BG.added}"><pre class="tb-text">${escapeHtml(row.text_b ?? "")}</pre></div>`;
  } else {
    // unchanged
    const text = row.text_a ?? row.text_b ?? "";
    bodyHtml = `<div class="text-block" style="background:#f8fafc"><pre class="tb-text">${escapeHtml(text)}</pre></div>`;
  }

  const confidence = row.combined_score;
  const lowConfBadge =
    confidence < 0.7
      ? ` <span class="badge-lowconf" title="Low alignment confidence (${Math.round(confidence * 100)}%) — review recommended">\u26A0 review</span>`
      : "";

  // Clause type chip
  const clauseType = row.clause_type_a ?? row.clause_type_b ?? null;
  let clauseTypeChip = "";
  if (clauseType && clauseType in CLAUSE_TYPE_STYLE) {
    const [ctLabel, ctFg, ctBg] = CLAUSE_TYPE_STYLE[clauseType];
    clauseTypeChip =
      ` <span class="badge clause-type-badge" style="color:${ctFg};background:${ctBg};font-size:0.7em">` +
      `${escapeHtml(ctLabel)}</span>`;
  }

  return (
    `<details class="card" id="card-${idx}" data-cls="${escapeHtml(cls)}" ` +
    `style="border-left:3px solid ${borderCol}">` +
    `<summary class="card-summary">` +
    `<span class="badge" style="color:${badgeFg};background:${badgeBg}">${escapeHtml(cls)}</span>` +
    `${clauseTypeChip}${lowConfBadge}` +
    `<span class="card-clause">${clause}</span>` +
    `<span class="card-snippet">${snippetStr}</span>` +
    `<span class="card-page">${pageRefStr}</span>` +
    `</summary>` +
    `<div class="card-body">${bodyHtml}</div>` +
    `</details>`
  );
}

/**
 * Build a self-contained HTML comparison report.
 *
 * Includes Cards view (grouped by classification) and inline word-level diffs.
 */
export function buildHtmlReport(
  rows: AlignmentResult[],
  docNameA: string,
  docNameB: string,
  generatedAt?: string,
): string {
  const ts = generatedAt ?? new Date().toISOString();
  const tsDisplay = ts.replace("T", " ").replace("Z", " UTC").slice(0, 19);

  const counts: Record<DeltaClassification, number> = {
    unchanged: 0,
    moved: 0,
    changed: 0,
    deleted: 0,
    added: 0,
  };
  for (const r of rows) {
    counts[r.classification] = (counts[r.classification] ?? 0) + 1;
  }

  const groups: Record<DeltaClassification, AlignmentResult[]> = {
    changed: [],
    deleted: [],
    added: [],
    moved: [],
    unchanged: [],
  };
  for (const r of sortedRows(rows)) {
    groups[r.classification].push(r);
  }

  const meaningful = counts.changed + counts.deleted + counts.added;

  // Cards
  let globalIdx = 0;
  let groupsHtml = "";
  for (const cls of GROUP_ORDER) {
    const clsRows = groups[cls];
    const [badgeFg, badgeBg] = BADGE_COLOURS[cls] ?? ["#374151", "#f9fafb"];

    let cardsHtml = "";
    for (const r of clsRows) {
      cardsHtml += renderCard(r, globalIdx) + "\n";
      globalIdx++;
    }
    const emptyHtml = clsRows.length === 0 ? `<p class="group-empty">No ${cls} items.</p>` : "";

    groupsHtml +=
      `<section class="group" id="group-${cls}" data-cls="${cls}">` +
      `<div class="group-header">` +
      `<span class="group-badge" style="color:${badgeFg};background:${badgeBg}">${cls.charAt(0).toUpperCase() + cls.slice(1)}</span>` +
      `<span class="group-count">${counts[cls]}</span>` +
      `</div>` +
      `${cardsHtml}${emptyHtml}` +
      `</section>\n`;
  }

  const styles = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
       font-size: 13px; line-height: 1.5; color: #0f172a; background: #f1f5f9; }
.toolbar { position: sticky; top: 0; z-index: 100; background: #fff; border-bottom: 1px solid #e2e8f0;
  padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
.toolbar-title { font-size: 14px; font-weight: 600; color: #0f172a; }
.toolbar-meta { font-size: 11px; color: #94a3b8; }
.main { max-width: 960px; margin: 0 auto; padding: 16px; }
.group { margin-bottom: 24px; }
.group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.group-badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 9999px; text-transform: capitalize; }
.group-count { font-size: 12px; color: #94a3b8; }
.group-empty { font-size: 12px; color: #94a3b8; padding: 8px 12px; }
.card { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; background: #fff; overflow: hidden; }
.card-summary { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; }
.card-summary::-webkit-details-marker { display: none; }
.badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 9999px; text-transform: capitalize; }
.badge-lowconf { font-size: 10px; color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 9999px; }
.card-clause { font-weight: 500; min-width: 60px; }
.card-snippet { color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-page { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
.card-body { padding: 12px 14px; border-top: 1px solid #f1f5f9; }
.side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }
.diff-pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 12px; line-height: 1.6; }
mark.wd-del { background: #fecaca; color: #991b1b; text-decoration: line-through; border-radius: 2px; padding: 0 1px; }
mark.wd-ins { background: #bbf7d0; color: #166534; border-radius: 2px; padding: 0 1px; }
.text-block { padding: 8px 12px; border-radius: 6px; margin-top: 6px; }
.tb-text { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 12px; line-height: 1.6; }
.moved-note { font-size: 12px; color: #1d4ed8; font-weight: 500; margin-bottom: 6px; }
.impact-callout { margin-top: 10px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #6366f1; border-radius: 4px; font-size: 12px; }
.impact-label { font-weight: 600; color: #6366f1; margin-right: 4px; }
.clause-type-badge { margin-left: 4px; }
.summary-bar { display: flex; gap: 16px; padding: 12px 0; font-size: 13px; }
.summary-stat { display: flex; align-items: center; gap: 4px; }
.summary-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  `.trim();

  // Summary bar
  const summaryItems = [
    { label: "Changed", count: counts.changed, color: "#fbbf24" },
    { label: "Deleted", count: counts.deleted, color: "#fca5a5" },
    { label: "Added", count: counts.added, color: "#6ee7b7" },
    { label: "Moved", count: counts.moved, color: "#bfdbfe" },
    { label: "Unchanged", count: counts.unchanged, color: "#d1d5db" },
  ];
  const summaryBarHtml = summaryItems
    .map(
      (s) =>
        `<div class="summary-stat"><span class="summary-dot" style="background:${s.color}"></span>${s.label}: ${s.count}</div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comparison: ${escapeHtml(docNameA)} vs ${escapeHtml(docNameB)}</title>
<style>${styles}</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">${escapeHtml(docNameA)} vs ${escapeHtml(docNameB)}</span>
  <span class="toolbar-meta">${escapeHtml(tsDisplay)} · ${meaningful} meaningful change(s)</span>
</div>
<div class="main">
  <div class="summary-bar">${summaryBarHtml}</div>
  ${groupsHtml}
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Convenience: format both reports
// ---------------------------------------------------------------------------

export interface FormattedReports {
  json: JsonReport;
  html: string;
}

/**
 * Format alignment results into both JSON and HTML reports.
 */
export function formatReport(
  results: AlignmentResult[],
  docNameA: string,
  docNameB: string,
): FormattedReports {
  const ts = new Date().toISOString();
  return {
    json: buildJsonReport(results, docNameA, docNameB, ts),
    html: buildHtmlReport(results, docNameA, docNameB, ts),
  };
}
