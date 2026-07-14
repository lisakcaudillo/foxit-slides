"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Check, Pencil, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClauseRewriteSuggestion } from "./types";

/* ── Loading skeleton for suggestion generation ── */
export function SuggestionLoading({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      className="glass-tile rounded-xl p-4 relative"
      style={{ borderLeft: '3px solid #6B3FA0' }}
      role="region"
      aria-label="Generating suggested alternative"
      aria-busy="true"
    >
      <button
        onClick={onCancel}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground size-6 flex items-center justify-center rounded"
        title="Cancel generation"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 animate-pulse" style={{ color: '#6B3FA0' }} />
        <span className="text-sm text-muted-foreground">Generating suggested alternative...</span>
      </div>
      <div className="space-y-2">
        <div className="h-4 rounded bg-slate-200 animate-pulse w-full" />
        <div className="h-4 rounded bg-slate-200 animate-pulse w-[70%]" />
        <div className="h-4 rounded bg-slate-200 animate-pulse w-[90%]" />
      </div>
    </div>
  );
}

/* ── On-demand prompt tile ── */
export function SuggestRewritePrompt({
  onRequest,
  isLoading,
}: {
  onRequest: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={onRequest}
      disabled={isLoading}
      className="w-full glass-tile rounded-xl p-4 flex items-center gap-3 text-left text-base text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
      style={{ borderLeft: '3px solid transparent' }}
    >
      <Sparkles className="size-4 flex-shrink-0" style={{ color: '#6B3FA0' }} />
      <span className="flex-1">Get an AI-suggested alternative</span>
      <span className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:border-primary/30 bg-white text-foreground">
        Suggest Rewrite
      </span>
    </button>
  );
}

/* ── Full suggestion card with actions ── */
export function SuggestionDisplay({
  suggestion,
  activeSkill,
  onAccept,
  onEdit,
  onDismiss,
  onRegenerate,
  onShowPrevious,
}: {
  suggestion: ClauseRewriteSuggestion;
  activeSkill?: string | null;
  onAccept: () => void;
  onEdit: (editedText: string) => void;
  onDismiss: () => void;
  onRegenerate: (guidance?: string) => void;
  onShowPrevious?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(suggestion.edited_text ?? suggestion.suggested_text);
  const [showRegenInput, setShowRegenInput] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [dismissedNote, setDismissedNote] = useState(false);
  const [acceptedNote, setAcceptedNote] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAccept = useCallback(() => {
    onAccept();
    setAcceptedNote(true);
    setTimeout(() => setAcceptedNote(false), 5000);
  }, [onAccept]);

  const handleSaveEdit = useCallback(() => {
    onEdit(editText);
    setIsEditing(false);
  }, [editText, onEdit]);

  const handleDismiss = useCallback(() => {
    onDismiss();
    setDismissedNote(true);
  }, [onDismiss]);

  const handleRegenerate = useCallback(() => {
    onRegenerate(guidance || undefined);
    setShowRegenInput(false);
    setGuidance("");
  }, [guidance, onRegenerate]);

  // Dismissed state
  if (suggestion.status === 'dismissed' || dismissedNote) {
    return (
      <div className="text-sm text-muted-foreground py-2 flex items-center gap-2">
        <span>Suggestion dismissed</span>
        <button
          onClick={() => { setDismissedNote(false); /* parent handles restore via onDismiss toggle */ }}
          className="text-sm font-medium hover:underline"
          style={{ color: '#6B3FA0' }}
        >
          Show again
        </button>
      </div>
    );
  }

  // Accepted state
  if (suggestion.status === 'accepted') {
    return (
      <div
        className="glass-tile rounded-xl p-4"
        style={{ borderLeft: '3px solid #6B3FA0' }}
        role="region"
        aria-label={`Accepted rewrite for clause ${suggestion.section_id}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Check className="size-4" style={{ color: '#6B3FA0' }} />
          <span className="text-sm font-semibold text-foreground">Rewrite accepted</span>
          {activeSkill && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107, 63, 160, 0.1)', color: '#6B3FA0' }}>
              <Sparkles className="size-3" /> {activeSkill}
            </span>
          )}
        </div>
        <blockquote className="text-base text-foreground leading-relaxed pl-3 border-l-2 border-slate-200">
          {suggestion.edited_text ?? suggestion.suggested_text}
        </blockquote>
        {acceptedNote && (
          <p className="text-sm text-muted-foreground mt-2 animate-in fade-in">
            Counterparty&apos;s version marked as rejected
          </p>
        )}
      </div>
    );
  }

  // Pending / editable state
  return (
    <div
      className="glass-tile rounded-xl p-4"
      style={{ borderLeft: '3px solid #6B3FA0' }}
      role="region"
      aria-label={`AI suggested alternative for clause ${suggestion.section_id}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4" style={{ color: '#6B3FA0' }} />
        <span className="text-sm font-semibold text-foreground">Suggested Rewrite</span>
        {activeSkill && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107, 63, 160, 0.1)', color: '#6B3FA0' }}>
            <Sparkles className="size-3" /> {activeSkill}
          </span>
        )}
      </div>

      {/* Suggested text */}
      {isEditing ? (
        <div className="mb-3">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full min-h-[100px] text-base text-foreground leading-relaxed rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSaveEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
            >
              Save Edit
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditText(suggestion.edited_text ?? suggestion.suggested_text); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <blockquote className="text-base text-foreground leading-relaxed pl-3 border-l-2 border-slate-200 mb-3">
          {suggestion.edited_text ?? suggestion.suggested_text}
        </blockquote>
      )}

      {/* Rationale */}
      {!isEditing && (
        <div className="border-t pt-3 mt-3" style={{ borderColor: 'rgba(107, 63, 160, 0.1)' }}>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Why</span>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">{suggestion.rationale}</p>
        </div>
      )}

      {/* Action buttons */}
      {!isEditing && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={handleAccept}
            title="Accept this suggested rewrite and include it in the response memo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
          >
            <Check className="size-3.5" /> Accept Rewrite
          </button>
          <button
            onClick={() => { setIsEditing(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
            title="Edit the suggested text before accepting"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-foreground text-sm font-medium transition-colors"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
          <button
            onClick={handleDismiss}
            title="Dismiss this suggestion"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" /> Dismiss
          </button>
          <button
            onClick={() => setShowRegenInput(prev => !prev)}
            title="Generate a different suggestion with optional guidance"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="size-3.5" /> Try Different
          </button>
        </div>
      )}

      {/* Regenerate input */}
      {showRegenInput && !isEditing && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="More conservative, keep original cap amount..."
            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            onKeyDown={(e) => { if (e.key === 'Enter') handleRegenerate(); }}
          />
          <button
            onClick={handleRegenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
          >
            Regen
          </button>
        </div>
      )}

      {/* Previous suggestion link */}
      {suggestion.previousSuggestion && !isEditing && (
        <button
          onClick={onShowPrevious}
          className="text-sm font-medium mt-2 hover:underline"
          style={{ color: '#6B3FA0' }}
        >
          Previous suggestion
        </button>
      )}
    </div>
  );
}
