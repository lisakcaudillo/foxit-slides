"use client";

import { useState } from "react";
import {
  ChevronRight,
  Sparkles,
  Check,
  X,
  Flag,
  Plus,
  Minus,
  Pencil,
  ArrowRight,
  Equal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ComparisonChange, ReviewStatus, ClauseRewriteSuggestion } from "./types";
import { CLAUSE_TYPE_STYLE } from "./constants";
import { diffWords, getReviewRecommendation } from "./utils";
import { SuggestionDisplay, SuggestionLoading, SuggestRewritePrompt } from "./SuggestionCard";

/* ── Classification icon + color config ── */
const CLASSIFICATION_CONFIG: Record<
  string,
  { icon: typeof Plus; bg: string; text: string; border: string; iconBg: string }
> = {
  added:     { icon: Plus,      bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200/50", iconBg: "bg-green-100 text-green-600" },
  deleted:   { icon: Minus,     bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200/50",   iconBg: "bg-red-100 text-red-600" },
  changed:   { icon: Pencil,    bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200/50", iconBg: "bg-amber-100 text-amber-600" },
  moved:     { icon: ArrowRight, bg: "bg-blue-50",  text: "text-blue-700",   border: "border-blue-200/50",  iconBg: "bg-blue-100 text-blue-600" },
  unchanged: { icon: Equal,     bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200/50",  iconBg: "bg-gray-100 text-gray-400" },
};

/* ── Glass card base styles ── */
const GLASS_CARD =
  "rounded-xl overflow-hidden backdrop-blur-[12px] border";
const GLASS_BG =
  "bg-white/60";

/* ── Clause type chip colors ── */
const CLAUSE_CHIP_CLASSES: Record<string, string> = {
  obligation:          "bg-blue-100 text-blue-700",
  termination:         "bg-red-100 text-red-700",
  definition:          "bg-purple-100 text-purple-700",
  "condition-precedent": "bg-amber-100 text-amber-700",
  representation:      "bg-green-100 text-green-700",
};

function getClauseChipClass(category: string): string {
  return CLAUSE_CHIP_CLASSES[category] ?? "bg-slate-100 text-slate-600";
}

/* ── Accept / Reject / Flag buttons ── */
function ReviewButtons({
  sectionId,
  status,
  onReview,
}: {
  sectionId: string;
  status: ReviewStatus;
  onReview: (sectionId: string, status: ReviewStatus) => void;
}) {
  const btn = "size-6 rounded-md flex items-center justify-center transition-colors";
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        title="Accept"
        onClick={() => onReview(sectionId, status === "accepted" ? "pending" : "accepted")}
        className={cn(btn, status === "accepted" ? "bg-green-100 text-green-700" : "bg-transparent text-gray-400 hover:bg-green-50 hover:text-green-600")}
      >
        <Check className="size-3" />
      </button>
      <button
        title="Reject"
        onClick={() => onReview(sectionId, status === "rejected" ? "pending" : "rejected")}
        className={cn(btn, status === "rejected" ? "bg-red-100 text-red-700" : "bg-transparent text-gray-400 hover:bg-red-50 hover:text-red-600")}
      >
        <X className="size-3" />
      </button>
      <button
        title="Flag for review"
        onClick={() => onReview(sectionId, status === "flagged" ? "pending" : "flagged")}
        className={cn(btn, status === "flagged" ? "bg-amber-100 text-amber-700" : "bg-transparent text-gray-400 hover:bg-amber-50 hover:text-amber-600")}
      >
        <Flag className="size-3" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ComparisonCard — compact default, expandable detail
   ═══════════════════════════════════════════════════════════════ */

export function ComparisonCard({
  change,
  reviewStatus = "pending",
  onReview,
  suggestion,
  isLoadingSuggestion,
  activeSkill,
  onFetchSuggestion,
  onAcceptSuggestion,
  onEditSuggestion,
  onDismissSuggestion,
  onRegenerateSuggestion,
  onShowPreviousSuggestion,
  onCancelSuggestion,
}: {
  change: ComparisonChange;
  reviewStatus?: ReviewStatus;
  onReview?: (sectionId: string, status: ReviewStatus) => void;
  suggestion?: ClauseRewriteSuggestion;
  isLoadingSuggestion?: boolean;
  activeSkill?: string | null;
  onFetchSuggestion?: (change: ComparisonChange) => void;
  onAcceptSuggestion?: (sectionId: string) => void;
  onEditSuggestion?: (sectionId: string, editedText: string) => void;
  onDismissSuggestion?: (sectionId: string) => void;
  onRegenerateSuggestion?: (change: ComparisonChange, guidance?: string) => void;
  onShowPreviousSuggestion?: (sectionId: string) => void;
  onCancelSuggestion?: (sectionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = CLASSIFICATION_CONFIG[change.classification] ?? CLASSIFICATION_CONFIG.unchanged;
  const IconComponent = config.icon;

  const clauseStyle = change.clause_category
    ? CLAUSE_TYPE_STYLE[change.clause_category] ?? CLAUSE_TYPE_STYLE["other"]
    : null;

  /* One-line description for compact view */
  const compactDescription =
    change.ai_summary ??
    change.hedged_summary ??
    change.impact_summary ??
    (change.text_a ? (change.text_a.length > 80 ? change.text_a.slice(0, 80) + "..." : change.text_a) : null) ??
    (change.text_b ? (change.text_b.length > 80 ? change.text_b.slice(0, 80) + "..." : change.text_b) : null);

  return (
    <div
      className={cn(
        GLASS_CARD,
        GLASS_BG,
        config.border,
        "group transition-shadow hover:shadow-md",
      )}
    >
      {/* ── Compact header (always visible) ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        {/* Icon circle */}
        <span className={cn("flex items-center justify-center size-7 rounded-full flex-shrink-0", config.iconBg)}>
          <IconComponent className="size-3.5" />
        </span>

        {/* Classification badge */}
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0", config.bg, config.text)}>
          {change.classification}
        </span>

        {/* Clause type chip */}
        {change.clause_category && clauseStyle && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
              getClauseChipClass(change.clause_category),
            )}
          >
            {clauseStyle.label}
          </span>
        )}

        {/* One-line description */}
        <span className="text-base text-slate-700 flex-1 min-w-0 truncate">
          {compactDescription ?? `Section ${change.section_id ?? "—"}`}
        </span>

        {/* Review buttons — visible on hover or when expanded */}
        {onReview && (
          <span className={cn(
            "transition-opacity flex-shrink-0",
            expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}>
            <ReviewButtons sectionId={change.section_id} status={reviewStatus} onReview={onReview} />
          </span>
        )}

        <ChevronRight className={cn("size-4 text-slate-400 transition-transform flex-shrink-0", expanded && "rotate-90")} />
      </button>

      {/* ── Expanded detail ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100/60">
              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-3 pt-3 text-sm text-slate-500">
                {change.clause_number && (
                  <span className="font-mono text-slate-400">{change.clause_number}</span>
                )}
                {change.section_id && (
                  <span>Section {change.section_id}</span>
                )}
                {(() => {
                  const pageRef =
                    change.classification === "deleted" ? `Page ${change.page_a}`
                    : change.classification === "added" ? `Page ${change.page_b}`
                    : change.page_a !== null && change.page_b !== null && change.page_a !== change.page_b
                      ? `Page ${change.page_a} → ${change.page_b}`
                      : `Page ${change.page_a ?? change.page_b ?? "—"}`;
                  return <span className="text-slate-400">{pageRef}</span>;
                })()}
                {change.certainty_level && (
                  <span
                    className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded capitalize",
                      change.certainty_level === "definitive" && "bg-violet-50 text-violet-600",
                      change.certainty_level === "conditional" && "bg-slate-100 text-slate-500",
                      change.certainty_level === "ambiguous" && "bg-slate-50 text-slate-400",
                    )}
                  >
                    {change.certainty_level}
                  </span>
                )}
                {change.review_priority !== undefined && change.review_priority > 0.4 && (
                  <span className={cn(
                    "text-xs font-semibold px-1.5 py-0.5 rounded",
                    change.review_priority > 0.7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                  )}>
                    {change.review_priority > 0.7 ? "Critical" : "Review"}
                  </span>
                )}
              </div>

              {/* Confidence detail */}
              {change.match_signals && (
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span>Confidence: {((change.match_signals.calibrated_confidence ?? change.match_signals.confidence_score) * 100).toFixed(0)}%</span>
                  {change.match_signals.anchor_term_overlap !== undefined && (
                    <span>Anchor overlap: {(change.match_signals.anchor_term_overlap * 100).toFixed(0)}%</span>
                  )}
                  {change.match_signals.text_similarity !== undefined && (
                    <span>Similarity: {(change.match_signals.text_similarity * 100).toFixed(0)}%</span>
                  )}
                </div>
              )}

              {/* Text content */}
              {change.classification === "changed" && (() => {
                const { partsA, partsB } = diffWords(change.text_a ?? "", change.text_b ?? "");
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50/80 rounded-lg p-3">
                      <div className="text-xs font-semibold text-amber-600 mb-1.5">Version A</div>
                      <p className="text-base text-slate-700 leading-relaxed">
                        {partsA.map((part, i) =>
                          part.highlighted
                            ? <del key={i} className="bg-red-100 text-red-700 line-through">{part.text}</del>
                            : <span key={i}>{part.text}</span>
                        )}
                      </p>
                    </div>
                    <div className="bg-blue-50/80 rounded-lg p-3">
                      <div className="text-xs font-semibold text-blue-600 mb-1.5">Version B</div>
                      <p className="text-base text-slate-700 leading-relaxed">
                        {partsB.map((part, i) =>
                          part.highlighted
                            ? <ins key={i} className="bg-violet-100 text-violet-700 no-underline">{part.text}</ins>
                            : <span key={i}>{part.text}</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })()}
              {change.classification === "deleted" && (
                <div className="bg-red-50/80 rounded-lg p-3">
                  <div className="text-xs font-semibold text-red-500 mb-1.5">Removed</div>
                  <p className="text-base text-slate-700 leading-relaxed">{change.text_a}</p>
                </div>
              )}
              {change.classification === "added" && (
                <div className="bg-green-50/80 rounded-lg p-3">
                  <div className="text-xs font-semibold text-green-600 mb-1.5">Added</div>
                  <p className="text-base text-slate-700 leading-relaxed">{change.text_b}</p>
                </div>
              )}
              {change.classification === "moved" && (
                <div className="bg-blue-50/80 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-500 mb-1.5">
                    Moved from page {change.page_a} to page {change.page_b}
                  </div>
                  <p className="text-base text-slate-700 leading-relaxed">{change.text_a}</p>
                </div>
              )}
              {change.classification === "unchanged" && (
                <div className="bg-slate-50/80 rounded-lg p-3">
                  <p className="text-base text-slate-500 leading-relaxed">{change.text_a}</p>
                </div>
              )}

              {/* AI summary */}
              {change.ai_summary && (
                <div className="flex items-start gap-2 bg-violet-50/80 border border-violet-100 rounded-lg px-3 py-2.5">
                  <Sparkles className="size-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-0.5">AI Analysis</div>
                    <p className="text-base text-violet-800 leading-relaxed">{change.ai_summary}</p>
                  </div>
                </div>
              )}
              {(change.hedged_summary || change.impact_summary) && (
                <div className="flex items-start gap-2 bg-orange-50/80 border border-orange-100 rounded-lg px-3 py-2.5">
                  <Sparkles className="size-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-orange-800 leading-relaxed">{change.hedged_summary ?? change.impact_summary}</p>
                    {change.hedged_summary && change.impact_summary && change.hedged_summary !== change.impact_summary && (
                      <p className="text-sm text-orange-600/70 leading-relaxed mt-1">{change.impact_summary}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Clause Rewrite Suggestion */}
              {isLoadingSuggestion && onCancelSuggestion && (
                <SuggestionLoading onCancel={() => onCancelSuggestion(change.section_id)} />
              )}
              {suggestion && !isLoadingSuggestion && onAcceptSuggestion && onEditSuggestion && onDismissSuggestion && onRegenerateSuggestion && (
                <SuggestionDisplay
                  suggestion={suggestion}
                  activeSkill={activeSkill ? activeSkill : undefined}
                  onAccept={() => onAcceptSuggestion(change.section_id)}
                  onEdit={(text) => onEditSuggestion(change.section_id, text)}
                  onDismiss={() => onDismissSuggestion(change.section_id)}
                  onRegenerate={(guidance) => onRegenerateSuggestion(change, guidance)}
                  onShowPrevious={onShowPreviousSuggestion ? () => onShowPreviousSuggestion(change.section_id) : undefined}
                />
              )}
              {!suggestion && !isLoadingSuggestion && onFetchSuggestion && (() => {
                const rec = getReviewRecommendation(change);
                const qualifies = (change.review_priority !== undefined && change.review_priority >= 0.25) || (rec !== null);
                return qualifies ? (
                  <SuggestRewritePrompt onRequest={() => onFetchSuggestion(change)} isLoading={false} />
                ) : null;
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SideBySideCard — used in the ViewFilesOverlay
   ═══════════════════════════════════════════════════════════════ */

export function SideBySideCard({ change }: { change: ComparisonChange }) {
  const config = CLASSIFICATION_CONFIG[change.classification] ?? CLASSIFICATION_CONFIG.unchanged;
  const IconComponent = config.icon;

  const clauseStyle = change.clause_category
    ? CLAUSE_TYPE_STYLE[change.clause_category] ?? CLAUSE_TYPE_STYLE["other"]
    : null;

  return (
    <div className={cn(GLASS_CARD, GLASS_BG, config.border)}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100/60">
        {/* Icon circle */}
        <span className={cn("flex items-center justify-center size-6 rounded-full flex-shrink-0", config.iconBg)}>
          <IconComponent className="size-3" />
        </span>

        {/* Classification badge */}
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", config.bg, config.text)}>
          {change.classification}
        </span>

        {/* Clause type chip */}
        {change.clause_category && clauseStyle && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
              getClauseChipClass(change.clause_category),
            )}
          >
            {clauseStyle.label}
          </span>
        )}

        <span className="text-base font-medium text-slate-700">
          {change.clause_number && <span className="text-slate-400 mr-2">{change.clause_number}</span>}
          {change.section_id && `Section ${change.section_id}`}
        </span>
      </div>
      {(() => {
        const hasWordDiff = change.classification === "changed" && change.text_a && change.text_b;
        const diff = hasWordDiff ? diffWords(change.text_a!, change.text_b!) : null;
        return (
          <div className="grid grid-cols-2 divide-x divide-slate-100/60">
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-400 mb-2">Document A</div>
              <p className="text-base text-slate-700 leading-relaxed">
                {diff ? diff.partsA.map((part, i) =>
                  part.highlighted
                    ? <del key={i} className="bg-red-100 text-red-700 line-through">{part.text}</del>
                    : <span key={i}>{part.text}</span>
                ) : (change.text_a ?? <span className="text-slate-300 italic">Not present</span>)}
              </p>
            </div>
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-400 mb-2">Document B</div>
              <p className="text-base text-slate-700 leading-relaxed">
                {diff ? diff.partsB.map((part, i) =>
                  part.highlighted
                    ? <ins key={i} className="bg-violet-100 text-violet-700 no-underline">{part.text}</ins>
                    : <span key={i}>{part.text}</span>
                ) : (change.text_b ?? <span className="text-slate-300 italic">Not present</span>)}
              </p>
            </div>
          </div>
        );
      })()}
      {/* Confidence detail */}
      {change.match_signals && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100/60 text-sm text-slate-500">
          <span>Confidence: {((change.match_signals.calibrated_confidence ?? change.match_signals.confidence_score) * 100).toFixed(0)}%</span>
          {change.match_signals.anchor_term_overlap !== undefined && (
            <span>Anchor overlap: {(change.match_signals.anchor_term_overlap * 100).toFixed(0)}%</span>
          )}
        </div>
      )}
      {(change.hedged_summary || change.impact_summary) && (
        <div className="flex items-start gap-2 bg-orange-50/80 border-t border-orange-100 px-4 py-2.5">
          <Sparkles className="size-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-base text-orange-800 leading-relaxed">{change.hedged_summary ?? change.impact_summary}</p>
            {change.hedged_summary && change.impact_summary && change.hedged_summary !== change.impact_summary && (
              <p className="text-sm text-orange-600/70 leading-relaxed mt-1">{change.impact_summary}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
