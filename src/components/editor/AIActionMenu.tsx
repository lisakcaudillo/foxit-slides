'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw,
  AlignLeft,
  Maximize2,
  Minimize2,
  Palette,
  ShieldAlert,
  Shield,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Gavel,
  Briefcase,
  Users,
  BookOpen,
  TextSelect,
  Square,
  type LucideIcon,
} from 'lucide-react';

// --- Content type detection ---

interface DetectedSkill {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const CONTENT_PATTERNS: { keywords: string[]; skill: DetectedSkill }[] = [
  {
    keywords: ['confidential', 'non-disclosure', 'proprietary', 'trade secret', 'termination', 'notice period', 'for cause', 'at will', 'liability', 'indemnif', 'damages', 'limitation', 'warrant', 'jurisdiction'],
    skill: { id: 'legal', label: 'Legal Counsel', icon: Gavel, description: 'Check clause protections' },
  },
  {
    keywords: ['employment', 'compensation', 'benefits', 'probation', 'offer letter', 'pto', 'employee'],
    skill: { id: 'hr', label: 'HR Professional', icon: Users, description: 'Check HR compliance' },
  },
  {
    keywords: ['payment', 'invoice', 'fee', 'price', 'revenue', 'cost', 'pricing', 'compensation'],
    skill: { id: 'executive', label: 'Business Strategist', icon: Briefcase, description: 'Verify payment terms' },
  },
  {
    keywords: ['methodology', 'hypothesis', 'findings', 'abstract', 'literature', 'empirical'],
    skill: { id: 'research', label: 'Research Analyst', icon: BookOpen, description: 'Review research rigor' },
  },
];

export function detectBlockContentType(content: string): DetectedSkill | null {
  const text = content.replace(/<[^>]*>/g, '').toLowerCase();
  for (const pattern of CONTENT_PATTERNS) {
    const matchCount = pattern.keywords.filter((kw) => text.includes(kw)).length;
    if (matchCount >= 2) return pattern.skill;
  }
  return null;
}

// --- Quick actions ---

interface ActionItem {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

const QUICK_ACTIONS: ActionItem[] = [
  { id: 'rewrite', icon: RefreshCw, label: 'Rewrite', description: 'Rephrase this block in a different way' },
  { id: 'summarize', icon: AlignLeft, label: 'Summarize', description: 'Condense to key points' },
  { id: 'expand', icon: Maximize2, label: 'Expand', description: 'Add more detail and context' },
  { id: 'shorten', icon: Minimize2, label: 'Shorten', description: 'Make more concise' },
  { id: 'change-tone', icon: Palette, label: 'Change Tone', description: 'Adjust formality or style' },
];

const TONE_OPTIONS = ['Professional', 'Casual', 'Formal', 'Persuasive', 'Simple'];

const REVIEW_ACTIONS: ActionItem[] = [
  { id: 'check-risks', icon: ShieldAlert, label: 'Check for Risks', description: 'Flags potential issues' },
  { id: 'check-compliance', icon: Shield, label: 'Check Compliance', description: 'PII and sensitivity scan' },
  { id: 'simplify-language', icon: MessageCircle, label: 'Simplify Language', description: 'Plain language rewrite' },
];

// --- Menu component ---

interface AIActionMenuProps {
  blockContent: string;
  anchorRect: DOMRect;
  onAction: (action: string) => void;
  onClose: () => void;
}

export default function AIActionMenu({ blockContent, anchorRect, onAction, onClose }: AIActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [toneExpanded, setToneExpanded] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const detectedSkill = detectBlockContentType(blockContent);

  // Check text selection scope
  const [scope, setScope] = useState<'selection' | 'block'>('block');
  useEffect(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      setScope('selection');
    } else {
      setScope('block');
    }
  }, []);

  // Entrance animation
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setIsVisible(true);
    } else {
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on scroll
  useEffect(() => {
    const handleScroll = () => onClose();
    const scrollParent = document.querySelector('[data-canvas-scroll]') || window;
    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [onClose]);

  // Collect all focusable action ids for keyboard nav
  const allActionIds: string[] = [];
  if (detectedSkill) allActionIds.push(`skill-${detectedSkill.id}`);
  for (const a of QUICK_ACTIONS) {
    allActionIds.push(a.id);
    if (a.id === 'change-tone' && toneExpanded) {
      for (const t of TONE_OPTIONS) allActionIds.push(`tone-${t.toLowerCase()}`);
    }
  }
  if (reviewExpanded) {
    for (const a of REVIEW_ACTIONS) allActionIds.push(a.id);
  }
  allActionIds.push('custom-input');

  const handleActionClick = useCallback(
    (actionId: string) => {
      onAction(actionId);
      onClose();
    },
    [onAction, onClose],
  );

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, allActionIds.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusIndex(allActionIds.length - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < allActionIds.length) {
          const actionId = allActionIds[focusIndex];
          if (actionId === 'custom-input') {
            inputRef.current?.focus();
          } else {
            handleActionClick(actionId);
          }
        }
      }
    },
    [allActionIds, focusIndex, handleActionClick],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;

    // Route to agent chat if document-scope phrase detected
    const docScopePatterns = ['entire document', 'whole document', 'all sections', 'every paragraph', 'document'];
    const lower = customPrompt.toLowerCase();
    const isDocScope = docScopePatterns.some((p) => lower.includes(p));

    if (isDocScope) {
      onAction(`agent-chat::${customPrompt}`);
    } else {
      onAction(`custom-rewrite::${customPrompt}`);
    }
    onClose();
  }, [customPrompt, onAction, onClose]);

  // Position: anchor to right of sparkle button, or left if near viewport edge
  const menuWidth = 280;
  let left = anchorRect.right + 8;
  let top = anchorRect.top;

  if (left + menuWidth > window.innerWidth - 16) {
    left = anchorRect.left - menuWidth - 8;
  }
  if (top + 420 > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - 420 - 16);
  }

  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="AI actions for this block"
      className="fixed"
      style={{
        top,
        left,
        width: menuWidth,
        maxHeight: 420,
        zIndex: 40,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(4px)',
        transition: prefersReduced ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out',
        overflowY: 'auto',
      }}
      onKeyDown={handleMenuKeyDown}
    >
      <div className="glass-card" style={{ borderRadius: '10px', padding: '8px 0' }}>
        {/* Scope indicator */}
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {scope === 'selection' ? (
            <TextSelect className="size-3 text-slate-400" />
          ) : (
            <Square className="size-3 text-slate-400" />
          )}
          <span className="text-xs text-slate-400">
            {scope === 'selection' ? 'Selected text' : 'Full block'}
          </span>
        </div>

        {/* Section 1: Suggested Skill */}
        {detectedSkill && (
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <button
              role="menuitem"
              id={`ai-menu-skill-${detectedSkill.id}`}
              onClick={() => handleActionClick(`skill-${detectedSkill.id}`)}
              className="w-full text-left"
              style={{
                padding: '8px 12px',
                background: 'rgba(107,63,160,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                minHeight: '44px',
              }}
              onMouseEnter={() => {
                const idx = allActionIds.indexOf(`skill-${detectedSkill.id}`);
                if (idx >= 0) setFocusIndex(idx);
              }}
            >
              <detectedSkill.icon className="size-4 flex-shrink-0" style={{ color: '#6B3FA0' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700">
                  Suggested: {detectedSkill.label}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {detectedSkill.description}
                </div>
              </div>
              <span
                className="text-sm font-semibold flex-shrink-0"
                style={{ color: '#6B3FA0' }}
              >
                Apply
              </span>
            </button>
          </div>
        )}

        {/* Section 2: Quick Actions */}
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '4px 0' }}>
          {QUICK_ACTIONS.map((action) => {
            const idx = allActionIds.indexOf(action.id);
            const isFocused = focusIndex === idx;

            if (action.id === 'change-tone') {
              return (
                <div key={action.id}>
                  <button
                    role="menuitem"
                    id={`ai-menu-${action.id}`}
                    onClick={() => setToneExpanded(!toneExpanded)}
                    className="w-full text-left"
                    style={{
                      minHeight: 44,
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      background: isFocused ? 'rgba(0,0,0,0.04)' : 'transparent',
                    }}
                    onMouseEnter={() => setFocusIndex(idx)}
                  >
                    <action.icon className="size-4 text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-slate-700">{action.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{action.description}</div>
                    </div>
                    {toneExpanded ? (
                      <ChevronUp className="size-3.5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="size-3.5 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                  {toneExpanded && (
                    <div style={{ paddingLeft: 38 }}>
                      {TONE_OPTIONS.map((tone) => {
                        const toneId = `tone-${tone.toLowerCase()}`;
                        const toneIdx = allActionIds.indexOf(toneId);
                        const toneFocused = focusIndex === toneIdx;
                        return (
                          <button
                            key={tone}
                            role="menuitem"
                            id={`ai-menu-${toneId}`}
                            onClick={() => handleActionClick(`change-tone::${tone.toLowerCase()}`)}
                            className="w-full text-left"
                            style={{
                              minHeight: 44,
                              padding: '0 12px',
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              background: toneFocused ? 'rgba(0,0,0,0.04)' : 'transparent',
                            }}
                            onMouseEnter={() => setFocusIndex(toneIdx)}
                          >
                            <span className="text-sm text-slate-600">{tone}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={action.id}
                role="menuitem"
                id={`ai-menu-${action.id}`}
                onClick={() => handleActionClick(action.id)}
                className="w-full text-left"
                style={{
                  height: 40,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  background: isFocused ? 'rgba(0,0,0,0.04)' : 'transparent',
                }}
                onMouseEnter={() => setFocusIndex(idx)}
              >
                <action.icon className="size-4 text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-base text-slate-700">{action.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{action.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section 3: Review Actions (collapsible) */}
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={() => setReviewExpanded(!reviewExpanded)}
            className="w-full text-left"
            style={{
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <span className="text-sm font-semibold text-slate-500">Review</span>
            {reviewExpanded ? (
              <ChevronUp className="size-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="size-3.5 text-slate-400" />
            )}
          </button>
          {reviewExpanded && (
            <div style={{ padding: '0 0 4px 0' }}>
              {REVIEW_ACTIONS.map((action) => {
                const idx = allActionIds.indexOf(action.id);
                const isFocused = focusIndex === idx;
                return (
                  <button
                    key={action.id}
                    role="menuitem"
                    id={`ai-menu-${action.id}`}
                    onClick={() => handleActionClick(action.id)}
                    className="w-full text-left"
                    style={{
                      minHeight: 44,
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      background: isFocused ? 'rgba(0,0,0,0.04)' : 'transparent',
                    }}
                    onMouseEnter={() => setFocusIndex(idx)}
                  >
                    <action.icon className="size-4 text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-slate-700">{action.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{action.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 4: Custom Prompt */}
        <div style={{ padding: '8px 12px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Describe what you want..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCustomSubmit();
              }
              // Stop propagation to prevent menu-level arrow nav while typing
              e.stopPropagation();
            }}
            onFocus={() => setFocusIndex(allActionIds.indexOf('custom-input'))}
            className="w-full text-sm text-slate-700 placeholder:text-slate-400"
            style={{
              height: 36,
              padding: '0 12px',
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 6,
              outline: 'none',
            }}
            onFocusCapture={(e) => {
              (e.target as HTMLInputElement).style.borderColor = '#6B3FA0';
              (e.target as HTMLInputElement).style.boxShadow = '0 0 0 1px #6B3FA0';
            }}
            onBlurCapture={(e) => {
              (e.target as HTMLInputElement).style.borderColor = 'rgba(0,0,0,0.08)';
              (e.target as HTMLInputElement).style.boxShadow = 'none';
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
