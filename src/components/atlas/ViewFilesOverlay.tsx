"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { ArrowLeft, X, Save, FileText, ChevronLeft, ChevronRight, Check, Flag, Search, Sparkles, AlertTriangle, Link2, Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComparisonResult, ComparisonChange, DiffPart, ReviewStatus, ClauseRewriteSuggestion } from "./types";
import { BADGE, CLAUSE_TYPE_STYLE } from "./constants";
import { diffWords, cleanText, getReviewRecommendation } from "./utils";
import { SuggestionDisplay, SuggestionLoading, SuggestRewritePrompt } from "./SuggestionCard";

/** Extract all numbers (including decimals, percentages, and currency amounts) from text */
function extractNumbers(text: string): string[] {
  const matches = text.match(/[\d][.\d,]*%?/g);
  return matches ?? [];
}

/** Find numeric differences between two texts, returning formatted change strings */
function findNumericChanges(textA: string, textB: string): string[] {
  const changes: string[] = [];

  // Match currency amounts like "EUR 25,000,000" or "USD 1.5"
  const currencyRegex = /([A-Z]{3})\s+([\d.,]+)/g;
  const currenciesA = new Map<string, string[]>();
  const currenciesB = new Map<string, string[]>();
  let match: RegExpExecArray | null;

  match = currencyRegex.exec(textA);
  while (match !== null) {
    const key = match[1];
    if (!currenciesA.has(key)) currenciesA.set(key, []);
    currenciesA.get(key)!.push(match[2]);
    match = currencyRegex.exec(textA);
  }
  match = currencyRegex.exec(textB);
  while (match !== null) {
    const key = match[1];
    if (!currenciesB.has(key)) currenciesB.set(key, []);
    currenciesB.get(key)!.push(match[2]);
    match = currencyRegex.exec(textB);
  }

  for (const [currency, valuesA] of currenciesA) {
    const valuesB = currenciesB.get(currency);
    if (valuesB) {
      for (let i = 0; i < Math.min(valuesA.length, valuesB.length); i++) {
        if (valuesA[i] !== valuesB[i]) {
          changes.push(`${currency} ${valuesA[i]} \u2192 ${currency} ${valuesB[i]}`);
        }
      }
    }
  }

  // Match percentages like "1.75%" or "2.00%"
  const pctRegex = /([\d.,]+)%/g;
  const pctsA: string[] = [];
  const pctsB: string[] = [];
  match = pctRegex.exec(textA);
  while (match !== null) { pctsA.push(match[1]); match = pctRegex.exec(textA); }
  match = pctRegex.exec(textB);
  while (match !== null) { pctsB.push(match[1]); match = pctRegex.exec(textB); }
  for (let i = 0; i < Math.min(pctsA.length, pctsB.length); i++) {
    if (pctsA[i] !== pctsB[i]) {
      changes.push(`${pctsA[i]}% \u2192 ${pctsB[i]}%`);
    }
  }

  // Match dates like "31. Dezember 2028" or "December 31, 2028"
  const dateRegexDE = /(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/g;
  const datesA: string[] = [];
  const datesB: string[] = [];
  match = dateRegexDE.exec(textA);
  while (match !== null) { datesA.push(match[0]); match = dateRegexDE.exec(textA); }
  match = dateRegexDE.exec(textB);
  while (match !== null) { datesB.push(match[0]); match = dateRegexDE.exec(textB); }
  for (let i = 0; i < Math.min(datesA.length, datesB.length); i++) {
    if (datesA[i] !== datesB[i]) {
      changes.push(`${datesA[i]} \u2192 ${datesB[i]}`);
    }
  }

  // Match standalone numbers not already captured
  const standaloneA = extractNumbers(textA);
  const standaloneB = extractNumbers(textB);
  if (standaloneA.length === standaloneB.length && standaloneA.length > 0) {
    for (let i = 0; i < standaloneA.length; i++) {
      if (standaloneA[i] !== standaloneB[i]) {
        const alreadyCaptured = changes.some(c => c.includes(standaloneA[i]) && c.includes(standaloneB[i]));
        if (!alreadyCaptured) {
          changes.push(`${standaloneA[i]} \u2192 ${standaloneB[i]}`);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(changes)];
}

/** Get context-aware importance text based on clause type */
function getClauseImportance(clauseType: string): string {
  const importanceMap: Record<string, string> = {
    "termination": "Termination terms affect exit rights and risk exposure",
    "obligation": "Obligation changes affect party duties and compliance requirements",
    "definition": "Definition changes can alter the scope of the entire agreement",
    "condition-precedent": "Condition changes affect when rights and obligations activate",
    "fee/payment": "Financial term changes directly impact costs and cash flow",
    "indemnification": "Indemnification changes affect who bears loss and at what cost",
    "liability": "Liability changes directly impact risk exposure and financial ceiling",
    "confidentiality": "Confidentiality changes affect information protection obligations",
    "ip": "Intellectual property changes affect ownership and licensing rights",
    "governing-law": "Governing law changes affect dispute resolution and applicable rules",
    "representation": "Representation changes affect warranty scope and reliance rights",
  };
  return importanceMap[clauseType] ?? "Review this clause type for potential impact on the agreement";
}

/** Generate a diff description by comparing text_a and text_b */
function generateDiffDescription(change: ComparisonChange): string {
  const clauseType = change.clause_type_b ?? change.clause_type_a ?? "clause";
  const cleanType = clauseType.replace("-", " ");

  if (change.classification === "added") {
    const preview = cleanText(change.text_b)?.slice(0, 100) ?? "";
    return `New ${cleanType} clause added: "${preview}${(cleanText(change.text_b)?.length ?? 0) > 100 ? "..." : ""}"`;
  }
  if (change.classification === "deleted") {
    const preview = cleanText(change.text_a)?.slice(0, 100) ?? "";
    return `${cleanType.charAt(0).toUpperCase() + cleanType.slice(1)} clause removed: "${preview}${(cleanText(change.text_a)?.length ?? 0) > 100 ? "..." : ""}"`;
  }
  if (change.classification === "moved") {
    return "Clause moved from original position";
  }
  // "changed" — try to highlight key differences
  if (change.text_a && change.text_b) {
    const numericChanges = findNumericChanges(change.text_a, change.text_b);
    if (numericChanges.length > 0) {
      return `Key values changed: ${numericChanges.slice(0, 3).join(", ")}`;
    }
  }
  return "Content was modified between document versions.";
}

export function ViewFilesOverlay({
  result,
  onClose,
  reviewStatuses,
  onSetReviewStatus,
  reviewComments,
  onSetComment,
  onSave,
  initialChangeIndex,
  suggestions,
  loadingSuggestions,
  activeSkill,
  onFetchSuggestion,
  onAcceptSuggestion,
  onEditSuggestion,
  onDismissSuggestion,
  onRegenerateSuggestion,
  onShowPreviousSuggestion,
  onCancelSuggestion,
}: {
  result: ComparisonResult;
  fileA?: File | null;
  fileB?: File | null;
  onClose: () => void;
  reviewStatuses: Record<string, ReviewStatus>;
  onSetReviewStatus: (sectionId: string, status: ReviewStatus) => void;
  reviewComments?: Record<string, string>;
  onSetComment?: (sectionId: string, comment: string) => void;
  onSave?: () => void;
  initialChangeIndex?: number;
  suggestions?: Record<string, ClauseRewriteSuggestion>;
  loadingSuggestions?: Set<string>;
  activeSkill?: string | null;
  onFetchSuggestion?: (change: ComparisonChange) => void;
  onAcceptSuggestion?: (sectionId: string) => void;
  onEditSuggestion?: (sectionId: string, editedText: string) => void;
  onDismissSuggestion?: (sectionId: string) => void;
  onRegenerateSuggestion?: (change: ComparisonChange, guidance?: string) => void;
  onShowPreviousSuggestion?: (sectionId: string) => void;
  onCancelSuggestion?: (sectionId: string) => void;
}) {
  const [highlightChanges, setHighlightChanges] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [viewMode, setViewMode] = useState<"side-by-side" | "original" | "revised">("side-by-side");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["changed", "added", "deleted", "moved"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  // Onboarding hint — dismissed via localStorage
  const ONBOARDING_KEY = "compose:review-onboarding-dismissed";
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(ONBOARDING_KEY) !== "true";
  });

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch { /* ignore */ }
  }, []);

  // Navigate to initialChangeIndex when provided
  const initialAppliedRef = useRef(false);

  const panelARef = useRef<HTMLDivElement>(null);
  const panelBRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);

  const handleScrollSync = useCallback((source: 'a' | 'b') => {
    if (isScrollSyncing.current) return;
    isScrollSyncing.current = true;

    const sourcePanel = source === 'a' ? panelARef.current : panelBRef.current;
    const targetPanel = source === 'a' ? panelBRef.current : panelARef.current;

    if (sourcePanel && targetPanel) {
      const scrollRatio = sourcePanel.scrollTop / (sourcePanel.scrollHeight - sourcePanel.clientHeight || 1);
      targetPanel.scrollTop = scrollRatio * (targetPanel.scrollHeight - targetPanel.clientHeight);
    }

    requestAnimationFrame(() => { isScrollSyncing.current = false; });
  }, []);

  const sortedChanges = useMemo(
    () => [...result.changes].sort((a, b) => (a.page_a ?? a.page_b ?? 0) - (b.page_a ?? b.page_b ?? 0)),
    [result.changes]
  );

  const nonUnchanged = sortedChanges.filter(c => c.classification !== "unchanged");

  const filteredChanges = useMemo(() => {
    return nonUnchanged.filter(c => {
      if (!activeFilters.has(c.classification)) return false;
      if (highPriorityOnly && (c.review_priority ?? 0) < 0.5) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesClause = c.clause_number?.toLowerCase().includes(q);
        const matchesTextA = c.text_a?.toLowerCase().includes(q);
        const matchesTextB = c.text_b?.toLowerCase().includes(q);
        if (!matchesClause && !matchesTextA && !matchesTextB) return false;
      }
      return true;
    });
  }, [nonUnchanged, activeFilters, searchQuery, highPriorityOnly]);

  const filteredSectionIds = useMemo(
    () => new Set(filteredChanges.map(c => c.section_id)),
    [filteredChanges]
  );

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    [panelARef, panelBRef].forEach(ref => {
      const el = ref.current?.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const goToChange = useCallback((idx: number) => {
    if (idx < 0 || idx >= filteredChanges.length) return;
    setCurrentIdx(idx);
    scrollToSection(filteredChanges[idx].section_id);
  }, [filteredChanges, scrollToSection]);

  const goToPrev = useCallback(() => goToChange(currentIdx - 1), [currentIdx, goToChange]);
  const goToNext = useCallback(() => goToChange(currentIdx + 1), [currentIdx, goToChange]);

  // Apply initial change index on mount
  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (initialChangeIndex !== undefined && initialChangeIndex >= 0 && filteredChanges.length > 0) {
      const idx = Math.min(initialChangeIndex, filteredChanges.length - 1);
      setCurrentIdx(idx);
      scrollToSection(filteredChanges[idx].section_id);
      initialAppliedRef.current = true;
    }
  }, [initialChangeIndex, filteredChanges, scrollToSection]);

  useEffect(() => {
    if (activeSection) {
      const idx = filteredChanges.findIndex(c => c.section_id === activeSection);
      if (idx >= 0 && idx !== currentIdx) setCurrentIdx(idx);
    }
  }, [activeSection, filteredChanges, currentIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goToPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goToNext(); }
      const change = filteredChanges[currentIdx];
      if (!change) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); onSetReviewStatus(change.section_id, "accepted"); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); onSetReviewStatus(change.section_id, "rejected"); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); onSetReviewStatus(change.section_id, "flagged"); }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const textarea = document.querySelector<HTMLTextAreaElement>("textarea[placeholder*='accepted'], textarea[placeholder*='rejection'], textarea[placeholder*='flagged']");
        if (textarea) textarea.focus();
      }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); goToNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToPrev, goToNext, filteredChanges, currentIdx, onSetReviewStatus]);

  const renderDoc = (side: "a" | "b") => {
    const isSectionHeading = (clauseNum: string) =>
      /^§\s*\d+/.test(clauseNum) ||
      /^section\s+\d+/i.test(clauseNum) ||
      /^(article|part|chapter)\s+\d+/i.test(clauseNum) ||
      /^\d+\.$/.test(clauseNum.trim());

    return (
      <div className="mx-auto max-w-2xl py-10 px-12">
        <div className="mb-8 pb-6 border-b border-gray-200">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
            {side === "a" ? "Original" : "Revised"}
          </p>
          <h2 className="text-sm font-semibold text-gray-700">
            {side === "a" ? result.doc_name_a : result.doc_name_b}
          </h2>
        </div>

        <div className="space-y-0">
          {sortedChanges.map((change, idx) => {
            const isA = side === "a";
            const text = cleanText(isA ? change.text_a : (change.text_b ?? null));
            const isActive = activeSection === change.section_id;
            const cls = change.classification;
            const isFiltered = filteredSectionIds.has(change.section_id);
            const isHeading = isSectionHeading(change.clause_number);

            const redClass   = "bg-red-100 text-red-800 rounded px-0.5 border border-red-200 line-through";
            const greenClass = "bg-green-100 text-green-800 rounded px-0.5 border border-green-200";
            const blueClass  = "bg-blue-100 text-blue-800 rounded px-0.5 border border-blue-200";

            const shouldHighlight = highlightChanges && isFiltered;

            const cleanA = cleanText(change.text_a);
            const cleanB = cleanText(change.text_b);
            const wordParts: DiffPart[] | null =
              shouldHighlight && cls === "changed" && cleanA && cleanB
                ? (isA ? diffWords(cleanA, cleanB).partsA
                       : diffWords(cleanA, cleanB).partsB)
                : null;

            const pageNum = isA ? change.page_a : change.page_b;

            return (
              <div
                key={idx}
                data-section={change.section_id}
                className={cn(
                  "relative transition-all duration-200",
                  isHeading ? "mt-8 mb-2" : "mb-4",
                  isActive && isFiltered && "rounded-lg ring-2 ring-orange-400 ring-offset-2 bg-orange-50/20 px-3 -mx-3"
                )}
              >
                {pageNum != null && isFiltered && (
                  <span className="absolute -right-8 top-0 text-[10px] text-gray-300 tabular-nums select-none">
                    {pageNum}
                  </span>
                )}

                {isHeading ? (
                  <p className={cn(
                    "font-semibold leading-snug",
                    isFiltered && shouldHighlight ? (
                      cls === "deleted" && isA ? "text-red-700" :
                      cls === "added" && !isA ? "text-green-700" :
                      "text-gray-900"
                    ) : "text-gray-900",
                    "text-base"
                  )}>
                    {text ?? <span className="text-gray-300 italic text-xs">{isA && cls === "added" ? "— added in revised" : "— removed"}</span>}
                  </p>
                ) : (
                  <p className="text-base text-gray-800 leading-relaxed">
                    {text ? (
                      wordParts ? (
                        wordParts.map((part, pi) =>
                          part.highlighted ? (
                            <mark key={pi} className={cn("bg-transparent not-italic", isA ? redClass : greenClass)}>
                              {part.text}
                            </mark>
                          ) : (
                            <span key={pi}>{part.text}</span>
                          )
                        )
                      ) : shouldHighlight && cls === "deleted" && isA ? (
                        <mark className={cn("bg-transparent not-italic", redClass)}>{text}</mark>
                      ) : shouldHighlight && cls === "added" && !isA ? (
                        <mark className={cn("bg-transparent not-italic", greenClass)}>{text}</mark>
                      ) : shouldHighlight && cls === "moved" ? (
                        <mark className={cn("bg-transparent not-italic", blueClass)}>{text}</mark>
                      ) : (
                        text
                      )
                    ) : (
                      <span className="text-xs italic text-gray-300">
                        {isA && cls === "added" ? "— added in revised version" : "— removed in revised version"}
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* Header */}
      <div className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to Results
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center h-8 border border-gray-200 rounded-lg overflow-hidden">
            {([
              { value: "side-by-side" as const, label: "Side by Side" },
              { value: "original" as const, label: "Original Only" },
              { value: "revised" as const, label: "Revised Only" },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setViewMode(opt.value)}
                className={cn(
                  "h-full px-3 text-xs transition-colors",
                  viewMode === opt.value
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={goToPrev}
              disabled={currentIdx <= 0}
              className="h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-3.5" /> Previous
            </button>
            <span className="text-sm text-gray-600 tabular-nums min-w-[5rem] text-center">
              {filteredChanges.length > 0 ? `${currentIdx + 1} of ${filteredChanges.length}` : "0 of 0"}
            </span>
            <button
              onClick={goToNext}
              disabled={currentIdx >= filteredChanges.length - 1}
              className="h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (onSave) { onSave(); setSaveFlash(true); setTimeout(() => setSaveFlash(false), 1500); } }}
            disabled={!onSave}
            className={cn(
              "h-8 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors",
              saveFlash
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700",
              !onSave && "opacity-40 cursor-not-allowed"
            )}
          >
            {saveFlash ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            {saveFlash ? "Saved" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            <X className="size-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Color Legend — dismissible */}
      {showLegend && (
        <div className="h-8 bg-white border-b border-gray-200 px-4 flex items-center gap-6 flex-shrink-0">
          <span className="text-xs text-gray-500 font-medium">Legend:</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-200" /> Removed
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-200" /> Added
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-200" /> Moved
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-200" /> Changed
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-orange-400" /> Numeric change
          </span>
          <button onClick={() => setShowLegend(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
            Dismiss
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Doc A panel */}
        {(viewMode === "side-by-side" || viewMode === "original") && (
          <div className="flex-1 flex flex-col border-r border-gray-300 overflow-hidden">
            <div className="h-10 bg-white border-b border-gray-200 px-4 flex items-center flex-shrink-0">
              <FileText className="size-3.5 text-gray-500 mr-2 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-700 truncate">{result.doc_name_a}</span>
              <span className="text-[10px] text-gray-500 ml-2">Original</span>
            </div>
            <div ref={panelARef} onScroll={() => handleScrollSync('a')} className="flex-1 overflow-y-auto bg-gray-200 p-4">
              <div className={cn("bg-white rounded-xl min-h-full", viewMode !== "side-by-side" && "max-w-4xl mx-auto")}>
                {renderDoc("a")}
              </div>
            </div>
          </div>
        )}

        {/* Doc B panel */}
        {(viewMode === "side-by-side" || viewMode === "revised") && (
          <div className="flex-1 flex flex-col border-r border-gray-300 overflow-hidden">
            <div className="h-10 bg-white border-b border-gray-200 px-4 flex items-center flex-shrink-0">
              <FileText className="size-3.5 text-gray-500 mr-2 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-700 truncate">{result.doc_name_b}</span>
              <span className="text-[10px] text-gray-500 ml-2">Revised</span>
            </div>
            <div ref={panelBRef} onScroll={() => handleScrollSync('b')} className="flex-1 overflow-y-auto bg-gray-200 p-4">
              <div className={cn("bg-white rounded-xl min-h-full", viewMode !== "side-by-side" && "max-w-4xl mx-auto")}>
                {renderDoc("b")}
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL: Change Navigator + AI Context */}
        <div className="w-[480px] flex flex-col bg-white overflow-hidden border-l border-gray-200">
          {/* Onboarding Hint */}
          {showOnboarding && (
            <div className="flex items-start gap-2 px-4 py-3 bg-violet-50 border-b border-violet-100 text-xs text-violet-700 flex-shrink-0">
              <Info className="size-3.5 flex-shrink-0 mt-0.5" />
              <p className="flex-1 leading-relaxed">Review each change. Accept what&apos;s fine, reject what needs revision, flag what needs discussion.</p>
              <button onClick={dismissOnboarding} className="text-violet-400 hover:text-violet-600 flex-shrink-0">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {/* Change Navigator */}
          <div className="flex-shrink-0 border-b border-gray-200">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Changes ({filteredChanges.length})
              </span>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 cursor-pointer mr-2">
                  <input type="checkbox" checked={highlightChanges} onChange={e => setHighlightChanges(e.target.checked)} className="rounded accent-violet-500 size-3" />
                  <span className="text-[10px] text-gray-500">Highlight</span>
                </label>
                <span className="text-[10px] text-gray-400 mr-1">Filter:</span>
                {(["changed", "added", "deleted", "moved"] as const).map(type => {
                  const isActiveFilter = activeFilters.has(type);
                  const dot = type === "changed" ? "bg-amber-400" : type === "added" ? "bg-green-500" : type === "deleted" ? "bg-red-400" : "bg-blue-400";
                  return (
                    <button
                      key={type}
                      title={`${isActiveFilter ? 'Hide' : 'Show'} ${type} changes`}
                      onClick={() => {
                        const next = new Set(activeFilters);
                        if (next.has(type)) next.delete(type); else next.add(type);
                        setActiveFilters(next);
                        setCurrentIdx(0);
                      }}
                      className={cn("size-5 rounded flex items-center justify-center transition-opacity", isActiveFilter ? "opacity-100" : "opacity-30")}
                    >
                      <span className={cn("size-2.5 rounded-full", dot)} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto border-t border-gray-100">
              {filteredChanges.map((change, idx) => {
                const isActiveItem = idx === currentIdx;
                const reviewStatus: ReviewStatus = reviewStatuses[change.section_id] ?? "pending";
                const statusDot = reviewStatus === "accepted" ? "bg-green-500" : reviewStatus === "rejected" ? "bg-red-500" : reviewStatus === "flagged" ? "bg-amber-500" : null;
                const b = BADGE[change.classification];
                return (
                  <button
                    key={change.section_id}
                    onClick={() => goToChange(idx)}
                    className={cn(
                      "w-full text-left px-4 py-2 flex items-center gap-2 text-xs transition-colors border-b border-gray-50",
                      isActiveItem ? "bg-violet-50 border-l-2 border-l-violet-500" : "hover:bg-gray-50"
                    )}
                  >
                    {statusDot ? <span className={cn("size-2 rounded-full flex-shrink-0", statusDot)} /> : <span className="size-2 flex-shrink-0" />}
                    <span className="font-semibold text-gray-700 w-14 flex-shrink-0 truncate">{change.clause_number}</span>
                    <span className={cn("capitalize font-medium flex-shrink-0", b.text)}>{change.classification}</span>
                    <span className="text-gray-500 truncate flex-1 ml-1">
                      {cleanText(change.text_b ?? change.text_a)?.slice(0, 40) ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Context Panel */}
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const change = filteredChanges[currentIdx];
              if (!change) return (
                <div className="p-6 text-center text-sm text-gray-500">
                  No change selected
                </div>
              );

              const reviewStatus: ReviewStatus = reviewStatuses[change.section_id] ?? "pending";
              const rec = getReviewRecommendation(change);
              const clauseType = change.clause_type_a || change.clause_type_b || null;
              const confidence = change.match_signals?.calibrated_confidence ?? change.match_signals?.confidence_score ?? null;
              const confidenceBand = change.match_signals?.confidence_band ?? (confidence !== null ? (confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low") : null);

              const relatedChanges = filteredChanges.filter((c, i) => {
                if (i === currentIdx) return false;
                const ct = c.clause_type_a || c.clause_type_b;
                return ct !== undefined && ct === clauseType;
              }).slice(0, 3);

              return (
                <div className="p-5 space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900">{change.clause_number}</span>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border capitalize", BADGE[change.classification].bg, BADGE[change.classification].text, BADGE[change.classification].border)}>
                          {change.classification}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {currentIdx + 1}/{filteredChanges.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {([
                        { value: "accepted" as ReviewStatus, label: "Accept", Icon: Check, tooltip: "This change looks good \u2014 mark as reviewed", active: "bg-green-500 text-white border-transparent", inactive: "text-gray-500 border-gray-200 hover:text-green-600 hover:border-green-300 hover:bg-green-50" },
                        { value: "rejected" as ReviewStatus, label: "Reject", Icon: X, tooltip: "This change needs revision \u2014 flag for renegotiation", active: "bg-red-500 text-white border-transparent", inactive: "text-gray-500 border-gray-200 hover:text-red-600 hover:border-red-300 hover:bg-red-50" },
                        { value: "flagged" as ReviewStatus, label: "Flag", Icon: Flag, tooltip: "Come back to this later or escalate to someone else", active: "bg-amber-500 text-white border-transparent", inactive: "text-gray-500 border-gray-200 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50" },
                      ]).map(({ value, label, Icon, tooltip, active, inactive }) => (
                        <button
                          key={value}
                          title={tooltip}
                          onClick={() => onSetReviewStatus(change.section_id, reviewStatus === value ? "pending" : value)}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors", reviewStatus === value ? active : inactive)}
                        >
                          <Icon className="size-3" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Previous / Next navigation near actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={goToPrev}
                        disabled={currentIdx <= 0}
                        className="text-xs text-gray-600 hover:text-gray-900 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        &larr; Previous
                      </button>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {filteredChanges.length > 0 ? `${currentIdx + 1} of ${filteredChanges.length}` : "0 of 0"}
                      </span>
                      <button
                        onClick={goToNext}
                        disabled={currentIdx >= filteredChanges.length - 1}
                        className="text-xs text-gray-600 hover:text-gray-900 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Next &rarr;
                      </button>
                    </div>

                    {reviewStatus !== "pending" && onSetComment && (() => {
                      const comment = reviewComments?.[change.section_id] || "";
                      const borderColor = reviewStatus === "accepted" ? "border-green-200 focus:ring-green-300" : reviewStatus === "rejected" ? "border-red-200 focus:ring-red-300" : "border-amber-200 focus:ring-amber-300";
                      const bgColor = reviewStatus === "accepted" ? "bg-green-50/30" : reviewStatus === "rejected" ? "bg-red-50/30" : "bg-amber-50/30";
                      const placeholder = reviewStatus === "accepted" ? "Why was this change accepted? (optional)" : reviewStatus === "rejected" ? "Reason for rejection..." : "Add a note about why this was flagged...";
                      if (reviewStatus === "flagged" || comment) {
                        return (
                          <textarea
                            placeholder={placeholder}
                            value={comment}
                            onChange={e => onSetComment(change.section_id, e.target.value)}
                            className={`w-full mt-2 p-2 text-xs border rounded-lg resize-none focus:outline-none focus:ring-2 ${borderColor} ${bgColor}`}
                            rows={2}
                          />
                        );
                      }
                      return (
                        <button
                          onClick={() => onSetComment(change.section_id, "")}
                          className="mt-2 text-[11px] italic text-gray-500 hover:text-gray-500 hover:underline cursor-pointer"
                        >
                          Add note...
                        </button>
                      );
                    })()}
                  </div>

                  <hr className="border-gray-100" />

                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-violet-500" />
                      <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">AI Analysis</span>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">What Changed</p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {change.hedged_summary ?? change.impact_summary ?? change.ai_summary ?? generateDiffDescription(change)}
                      </p>
                    </div>

                    {clauseType && (() => {
                      const style = CLAUSE_TYPE_STYLE[clauseType] ?? CLAUSE_TYPE_STYLE["other"];
                      return (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Change Type</p>
                          {change.type_change ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ color: style?.fg, backgroundColor: style?.bg }}
                              >
                                {style?.label ?? clauseType.replace("-", " ")}
                              </span>
                              <ArrowRight className="size-3 text-amber-600 flex-shrink-0" />
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                {change.type_change}
                              </span>
                            </div>
                          ) : (
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block"
                              style={{ color: style?.fg, backgroundColor: style?.bg }}
                            >
                              {style?.label ?? clauseType.replace("-", " ")}
                            </span>
                          )}
                          {change.clause_category && change.clause_category !== clauseType && (
                            <p className="text-xs text-gray-500 mt-1">Category: {change.clause_category}</p>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const numChanges = (change.text_a && change.text_b) ? findNumericChanges(change.text_a, change.text_b) : [];
                      const clauseImportance = clauseType ? getClauseImportance(clauseType) : null;
                      const hasContent = rec || clauseImportance || numChanges.length > 0;
                      if (!hasContent) return null;
                      return (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</p>
                          {rec && (
                            <div className={cn(
                              "text-sm leading-relaxed rounded-lg px-3 py-2",
                              rec.priority === "critical"
                                ? "bg-red-50 text-red-700 border border-red-100"
                                : "bg-amber-50 text-amber-700 border border-amber-100"
                            )}>
                              {rec.priority === "critical" && <AlertTriangle className="size-3 inline mr-1 -mt-0.5" />}
                              {rec.reason}
                            </div>
                          )}
                          {clauseImportance && !rec && (
                            <p className="text-sm text-gray-600 leading-relaxed">{clauseImportance}</p>
                          )}
                          {numChanges.length > 0 && (
                            <div className={cn("mt-2 text-sm leading-relaxed rounded-lg px-3 py-2 bg-violet-50 text-violet-700 border border-violet-100")}>
                              {numChanges.slice(0, 3).map((nc, i) => (
                                <p key={i} className="font-medium">{nc}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Suggested Rewrite — positioned prominently after "Why It Matters" */}
                    {(() => {
                      const sug = suggestions?.[change.section_id];
                      const isLoading = loadingSuggestions?.has(change.section_id);
                      if (isLoading && onCancelSuggestion) {
                        return (
                          <div className="rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/50 p-3">
                            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1.5">AI Suggested Rewrite</p>
                            <SuggestionLoading onCancel={() => onCancelSuggestion(change.section_id)} />
                          </div>
                        );
                      }
                      if (sug && onAcceptSuggestion && onEditSuggestion && onDismissSuggestion && onRegenerateSuggestion) {
                        return (
                          <div className="rounded-lg border-2 border-violet-200 bg-violet-50/50 p-3">
                            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1.5">AI Suggested Rewrite</p>
                            <SuggestionDisplay
                              suggestion={sug}
                              activeSkill={activeSkill ?? undefined}
                              onAccept={() => onAcceptSuggestion(change.section_id)}
                              onEdit={(text) => onEditSuggestion(change.section_id, text)}
                              onDismiss={() => onDismissSuggestion(change.section_id)}
                              onRegenerate={(guidance) => onRegenerateSuggestion(change, guidance)}
                              onShowPrevious={onShowPreviousSuggestion ? () => onShowPreviousSuggestion(change.section_id) : undefined}
                            />
                          </div>
                        );
                      }
                      if (onFetchSuggestion) {
                        const qualifies = (change.review_priority !== undefined && change.review_priority >= 0.25) || (rec !== null);
                        if (qualifies) {
                          return (
                            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/30 p-3">
                              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1.5">AI Suggested Rewrite</p>
                              <SuggestRewritePrompt onRequest={() => onFetchSuggestion(change)} isLoading={false} />
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}

                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Reviewer Focus</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {(() => {
                          if (change.classification === "deleted") return "Confirm this removal was intentional. Check whether the obligation or right covered by this clause is addressed elsewhere.";
                          if (change.classification === "added") return "Review the new language carefully. Assess whether the added clause introduces obligations, restrictions, or exposure.";
                          if (change.classification === "moved") return "Verify the clause content is unchanged. Confirm the new location does not alter its legal effect or scope.";
                          if (change.classification === "changed") return "Compare the original and revised language. Identify whether the change narrows, broadens, or shifts the meaning.";
                          return "Review the clause in context to confirm accuracy.";
                        })()}
                      </p>
                    </div>

                    {confidenceBand && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Confidence</p>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[0, 1, 2].map(i => (
                              <div
                                key={i}
                                className={cn(
                                  "w-5 h-1.5 rounded-full",
                                  confidenceBand === "high" ? "bg-green-400"
                                    : confidenceBand === "medium" && i < 2 ? "bg-amber-400"
                                    : confidenceBand === "low" && i < 1 ? "bg-red-400"
                                    : "bg-gray-200"
                                )}
                              />
                            ))}
                          </div>
                          <span className={cn(
                            "text-xs font-medium capitalize",
                            confidenceBand === "high" ? "text-green-600"
                              : confidenceBand === "medium" ? "text-amber-600"
                              : "text-red-600"
                          )}>
                            {confidenceBand}
                          </span>
                          {confidence !== null && (
                            <span className="text-[10px] text-gray-500 tabular-nums">{Math.round(confidence * 100)}%</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {confidence !== null && confidence >= 0.9
                            ? "Very high \u2014 the AI is confident this match is correct"
                            : confidence !== null && confidence >= 0.7
                            ? "Moderate \u2014 review the match to confirm accuracy"
                            : "Low \u2014 this match may be incorrect, review carefully"}
                        </p>
                        {change.certainty_level && change.certainty_level !== "definitive" && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            {change.certainty_level === "conditional" ? "This assessment depends on context not fully captured in the extracted text." : "Ambiguous \u2014 manual verification recommended."}
                          </p>
                        )}
                      </div>
                    )}

                    {(() => {
                      if (!change.text_a || !change.text_b) return null;
                      const numericDiffs = findNumericChanges(change.text_a, change.text_b);
                      if (numericDiffs.length === 0) return null;
                      return (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Numeric Changes</p>
                          <div className="space-y-1">
                            {numericDiffs.map((diff, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm font-mono bg-gray-50 rounded-md px-2.5 py-1.5 border border-gray-100">
                                <span className="text-gray-700">{diff}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {relatedChanges.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Related Changes</p>
                        <div className="space-y-1">
                          {relatedChanges.map((rc, i) => {
                            const rcIdx = filteredChanges.indexOf(rc);
                            return (
                              <button
                                key={i}
                                onClick={() => goToChange(rcIdx)}
                                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs hover:bg-gray-50 transition-colors group"
                              >
                                <Link2 className="size-3 text-gray-300 group-hover:text-violet-400 flex-shrink-0" />
                                <span className="font-medium text-gray-700">{rc.clause_number}</span>
                                <span className={cn("capitalize", BADGE[rc.classification].text)}>{rc.classification}</span>
                                <span className="text-gray-500 truncate flex-1">
                                  {cleanText(rc.text_b ?? rc.text_a)?.slice(0, 30) ?? ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Suggested Rewrite moved up — after "Why It Matters", before "Reviewer Focus" */}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
