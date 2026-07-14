import type { ComparisonChange, DiffPart, ReviewRecommendation } from "./types";

/** Strip markdown and PDF-extraction artifacts from ingested text. */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-=]{3,}\s*$/gm, "")
    .replace(/\|\s*-{2,}\s*/g, "")
    .replace(/\|\s*\|/g, " ")
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+|\s+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getReviewRecommendation(change: ComparisonChange): ReviewRecommendation | null {
  if (change.classification === "unchanged" || change.classification === "moved") return null;

  const haystack = ((change.text_a ?? "") + " " + (change.text_b ?? "")).toLowerCase();
  const cls = change.classification;

  const is = (pattern: RegExp) => pattern.test(haystack);
  const termination   = is(/terminat|exit right|written notice|notice period/);
  const liability     = is(/liabilit|indemnif|cap|limitation of|shall not exceed/);
  const payment       = is(/payment|invoice|days of invoice|fee|price|due within/);
  const arbitration   = is(/arbitrat|dispute resolution|binding|jury trial|court proceeding/);
  const ip            = is(/intellectual property|proprietary|patent|copyright|trademark|work for hire/);
  const confidential  = is(/confidential|non-disclos|nda|trade secret/);
  const nonCompete    = is(/non-compet|compete|solicit|restrain/);
  const subcontract   = is(/subcontract|third.party|vendor|delegate/);
  const governing     = is(/governing law|jurisdiction|choice of law/);

  if (cls === "deleted") {
    if (termination)  return { priority: "critical",     reason: "Termination clause removed — exit rights may be lost" };
    if (liability)    return { priority: "critical",     reason: "Liability protection removed" };
    if (ip)           return { priority: "critical",     reason: "IP ownership clause removed" };
    if (confidential) return { priority: "recommended",  reason: "Confidentiality obligation removed" };
    if (nonCompete)   return { priority: "recommended",  reason: "Non-compete clause removed" };
    return           { priority: "recommended",          reason: "Clause deleted — confirm this was intentional" };
  }

  if (cls === "added") {
    if (arbitration)  return { priority: "critical",     reason: "Mandatory arbitration added — waives right to court" };
    if (nonCompete)   return { priority: "critical",     reason: "Non-compete added — review scope and duration" };
    if (subcontract)  return { priority: "critical",     reason: "Subcontracting right added without consent" };
    if (liability)    return { priority: "recommended",  reason: "New liability clause — review exposure" };
    if (ip)           return { priority: "recommended",  reason: "New IP clause — review ownership terms" };
    return           { priority: "recommended",          reason: "New clause added — review scope" };
  }

  if (cls === "changed") {
    if (liability)    return { priority: "critical",     reason: "Liability cap or terms changed" };
    if (payment)      return { priority: "recommended",  reason: "Payment terms modified — check cash flow impact" };
    if (termination)  return { priority: "recommended",  reason: "Termination conditions changed" };
    if (confidential) return { priority: "recommended",  reason: "Confidentiality terms changed" };
    if (governing)    return { priority: "recommended",  reason: "Governing law or jurisdiction changed" };
  }

  return null;
}

export function diffWords(a: string, b: string): { partsA: DiffPart[]; partsB: DiffPart[] } {
  const wa = a.split(" ");
  const wb = b.split(" ");
  const m = wa.length, n = wb.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wa[i-1] === wb[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const unchangedA = new Array<boolean>(m).fill(false);
  const unchangedB = new Array<boolean>(n).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (wa[i-1] === wb[j-1]) { unchangedA[i-1] = true; unchangedB[j-1] = true; i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) i--;
    else j--;
  }

  const consolidate = (words: string[], unchanged: boolean[]): DiffPart[] => {
    if (!words.length) return [];
    const parts: DiffPart[] = [];
    let cur = words[0];
    let curHL = !unchanged[0];
    for (let k = 1; k < words.length; k++) {
      const hl = !unchanged[k];
      if (hl === curHL) { cur += " " + words[k]; }
      else { parts.push({ text: cur, highlighted: curHL }); cur = words[k]; curHL = hl; }
    }
    parts.push({ text: cur, highlighted: curHL });
    return parts.map((p, idx) => idx === 0 ? p : { ...p, text: " " + p.text });
  };

  return { partsA: consolidate(wa, unchangedA), partsB: consolidate(wb, unchangedB) };
}

export function getSeverity(priority: number | undefined): { label: string; fg: string; bg: string; border: string; bar: string } {
  const p = priority ?? 0;
  if (p >= 0.75) return { label: "Critical", fg: "text-red-700", bg: "bg-red-100", border: "border-red-200", bar: "bg-red-500" };
  if (p >= 0.50) return { label: "High", fg: "text-orange-700", bg: "bg-orange-100", border: "border-orange-200", bar: "bg-orange-500" };
  if (p >= 0.25) return { label: "Medium", fg: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200", bar: "bg-amber-400" };
  return { label: "Low", fg: "text-gray-500", bg: "bg-gray-100", border: "border-gray-200", bar: "bg-gray-300" };
}
