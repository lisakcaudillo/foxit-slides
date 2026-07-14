'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GripVertical, X, Plus, Sparkles, Loader2, Check, Circle, SlidersHorizontal, MoveHorizontal, Users, FileText, ChevronRight } from 'lucide-react';
import type {
  ContentBlueprint,
  NormalizedIntent,
  BlueprintSection,
} from '@/types/generation';

// ── Props ────────────────────────────────────────────────────────────────────

export interface GenerationProgress {
  currentSectionIndex: number;
  status: 'idle' | 'generating' | 'complete' | 'failed';
}

interface BlueprintEditorProps {
  blueprint: ContentBlueprint;
  intent: NormalizedIntent;
  onBlueprintChange: (blueprint: ContentBlueprint) => void;
  onIntentChange: (intent: NormalizedIntent) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  generationProgress?: GenerationProgress | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DENSITY_LABELS: Record<BlueprintSection['density'], string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const DENSITY_TOOLTIPS: Record<BlueprintSection['density'], string> = {
  low: 'Brief and scannable — fewer details',
  medium: 'Standard level of detail',
  high: 'Comprehensive — full detail',
};

const DENSITIES = ['low', 'medium', 'high'] as const;

// ── Customize dropdown option types ─────────────────────────────────────────

interface CustomizeOption {
  id: string;
  label: string;
  description: string;
}

const LENGTH_OPTIONS: CustomizeOption[] = [
  { id: 'short', label: 'Short', description: '1-5 pages, high-level summary' },
  { id: 'medium', label: 'Medium', description: '5-15 pages, all essential information' },
  { id: 'long', label: 'Long', description: '15+ pages, in-depth information' },
  { id: 'custom', label: 'Custom', description: 'Set a specific page count' },
];

const AUDIENCE_OPTIONS: CustomizeOption[] = [
  { id: 'Executives & senior management', label: 'Executives & senior management', description: 'C-suite and VP-level leaders' },
  { id: 'Legal & compliance', label: 'Legal & compliance', description: 'Legal counsel and compliance officers' },
  { id: 'Experts & specialists', label: 'Experts & specialists', description: 'Domain experts and technical staff' },
  { id: 'General public', label: 'General public', description: 'Broad, non-specialist audience' },
  { id: 'Team members', label: 'Team members', description: 'Internal team and collaborators' },
  { id: 'Clients or customers', label: 'Clients or customers', description: 'External clients and stakeholders' },
  { id: 'Employees or direct reports', label: 'Employees or direct reports', description: 'Staff and direct reports' },
  { id: 'custom', label: 'Custom audience', description: 'Specify your own audience' },
];

const DETAIL_OPTIONS: CustomizeOption[] = [
  { id: 'concise', label: 'Concise', description: 'High-level summary, best for short meetings' },
  { id: 'standard', label: 'Medium', description: 'All necessary information, best for meetings' },
  { id: 'detailed', label: 'Detailed', description: 'In-depth information, best for readouts' },
];

type SubMenuId = 'length' | 'audience' | 'detail' | null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getLengthFromBlueprint(blueprint: ContentBlueprint): string {
  return blueprint.estimatedTotalLength ?? 'medium';
}

function getDetailLabel(depth: string): string {
  const match = DETAIL_OPTIONS.find((o) => o.id === depth);
  return match ? match.label : 'Medium';
}

function getAudienceLabel(audience: string): string {
  const match = AUDIENCE_OPTIONS.find((o) => o.id === audience);
  if (match && match.id !== 'custom') return match.label;
  return audience || 'General public';
}

function getLengthLabel(length: string): string {
  const match = LENGTH_OPTIONS.find((o) => o.id === length);
  return match ? match.label : 'Medium';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BlueprintEditor({
  blueprint,
  intent,
  onBlueprintChange,
  onIntentChange,
  onGenerate,
  isGenerating = false,
  generationProgress = null,
}: BlueprintEditorProps) {
  const [addingSectionName, setAddingSectionName] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Customize dropdown state
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<SubMenuId>(null);
  const [customPageCount, setCustomPageCount] = useState('');
  const [customAudience, setCustomAudience] = useState('');
  const customizeRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
        setActiveSubMenu(null);
      }
    }
    if (customizeOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [customizeOpen]);

  // ── Intent updaters ──────────────────────────────────────────────────────

  const updateIntent = useCallback(
    (patch: Partial<NormalizedIntent>) => {
      onIntentChange({ ...intent, ...patch });
    },
    [intent, onIntentChange],
  );

  // ── Customize selection handlers ─────────────────────────────────────────

  const handleLengthSelect = useCallback(
    (id: string) => {
      if (id === 'custom') return; // custom handled via input
      const lengthMap: Record<string, { estimatedTotalLength: ContentBlueprint['estimatedTotalLength']; suggestedPageCount: number }> = {
        short: { estimatedTotalLength: 'short', suggestedPageCount: 3 },
        medium: { estimatedTotalLength: 'medium', suggestedPageCount: 10 },
        long: { estimatedTotalLength: 'long', suggestedPageCount: 20 },
      };
      const mapped = lengthMap[id];
      if (mapped) {
        onBlueprintChange({ ...blueprint, ...mapped });
        // Also update depth to match length
        const depthMap: Record<string, NormalizedIntent['desiredDepth']> = {
          short: 'concise',
          medium: 'standard',
          long: 'detailed',
        };
        updateIntent({ desiredDepth: depthMap[id] ?? 'standard' });
      }
      setCustomizeOpen(false);
      setActiveSubMenu(null);
    },
    [blueprint, onBlueprintChange, updateIntent],
  );

  const handleCustomPageCount = useCallback(
    (value: string) => {
      const pages = parseInt(value, 10);
      if (pages > 0) {
        const length: ContentBlueprint['estimatedTotalLength'] =
          pages <= 5 ? 'short' : pages <= 15 ? 'medium' : 'long';
        onBlueprintChange({ ...blueprint, estimatedTotalLength: length, suggestedPageCount: pages });
      }
    },
    [blueprint, onBlueprintChange],
  );

  const handleAudienceSelect = useCallback(
    (id: string) => {
      if (id === 'custom') return; // custom handled via input
      updateIntent({ audience: id });
      setCustomizeOpen(false);
      setActiveSubMenu(null);
    },
    [updateIntent],
  );

  const handleCustomAudienceSubmit = useCallback(() => {
    const trimmed = customAudience.trim();
    if (trimmed) {
      updateIntent({ audience: trimmed });
      setCustomAudience('');
      setCustomizeOpen(false);
      setActiveSubMenu(null);
    }
  }, [customAudience, updateIntent]);

  const handleDetailSelect = useCallback(
    (id: string) => {
      const depthMap: Record<string, NormalizedIntent['desiredDepth']> = {
        concise: 'concise',
        standard: 'standard',
        detailed: 'detailed',
      };
      updateIntent({ desiredDepth: depthMap[id] ?? 'standard' });
      setCustomizeOpen(false);
      setActiveSubMenu(null);
    },
    [updateIntent],
  );

  // ── Blueprint section updaters ───────────────────────────────────────────

  const updateSection = useCallback(
    (index: number, patch: Partial<BlueprintSection>) => {
      const next = [...blueprint.sections];
      next[index] = { ...next[index], ...patch };
      onBlueprintChange({ ...blueprint, sections: next });
    },
    [blueprint, onBlueprintChange],
  );

  const removeSection = useCallback(
    (index: number) => {
      const next = blueprint.sections.filter((_, i) => i !== index);
      onBlueprintChange({ ...blueprint, sections: next });
    },
    [blueprint, onBlueprintChange],
  );

  const addSection = useCallback(() => {
    const name = addingSectionName.trim();
    if (!name) return;
    const newSection: BlueprintSection = {
      name,
      purpose: 'New section',
      density: 'medium',
      preferredBlockTypes: ['paragraph'],
    };
    onBlueprintChange({
      ...blueprint,
      sections: [...blueprint.sections, newSection],
    });
    setAddingSectionName('');
    setIsAddingSection(false);
  }, [addingSectionName, blueprint, onBlueprintChange]);

  // ── Drag and drop ────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, toIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === toIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      const next = [...blueprint.sections];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(toIndex, 0, moved);
      onBlueprintChange({ ...blueprint, sections: next });
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, blueprint, onBlueprintChange],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── Summary computation ──────────────────────────────────────────────────

  const totalWords = blueprint.sections.reduce(
    (sum, s) => sum + (s.estimatedWordCount ?? 0),
    0,
  );
  const sectionCount = blueprint.sections.length;

  // ── Generation progress derived state ───────────────────────────────────
  const isInProgress = generationProgress?.status === 'generating';
  const isComplete = generationProgress?.status === 'complete';
  const isFailed = generationProgress?.status === 'failed';
  const controlsDisabled = isInProgress || isComplete;
  const progressPercent = generationProgress && sectionCount > 0
    ? Math.min((generationProgress.currentSectionIndex / sectionCount) * 100, 100)
    : 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* ── Progress bar ────────────────────────────────────────────── */}
        {(isInProgress || isComplete) && (
          <div className="h-1 bg-slate-100">
            <div
              className="h-1 bg-violet-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        <div className="p-6 space-y-6">
        {/* ── Top: Document Plan heading + Customize button ──────────────── */}
        <div className={`space-y-3${controlsDisabled ? ' pointer-events-none opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Your Document Plan
            </h2>

            {/* Customize button + dropdown */}
            <div className="relative" ref={customizeRef}>
              <button
                type="button"
                onClick={() => {
                  setCustomizeOpen((prev) => !prev);
                  setActiveSubMenu(null);
                }}
                className="bg-slate-900 text-white rounded-full px-4 py-2 text-sm font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                aria-label="Customize document settings"
              >
                <SlidersHorizontal size={16} />
                Customize
              </button>

              {/* Main dropdown */}
              {customizeOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-slate-200 py-2 min-w-[220px] z-50">
                  {/* Length */}
                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubMenu('length')}
                  >
                    <div className="px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <MoveHorizontal size={16} className="text-slate-400" />
                        <span className="font-medium text-slate-900">Length</span>
                      </div>
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>

                    {/* Length sub-menu */}
                    {activeSubMenu === 'length' && (
                      <div className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-slate-200 py-2 min-w-[280px] z-50">
                        {LENGTH_OPTIONS.map((opt) => {
                          const currentLength = getLengthFromBlueprint(blueprint);
                          const isSelected = opt.id === currentLength;

                          if (opt.id === 'custom') {
                            return (
                              <div key={opt.id} className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={customPageCount}
                                    onChange={(e) => setCustomPageCount(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleCustomPageCount(customPageCount);
                                        setCustomizeOpen(false);
                                        setActiveSubMenu(null);
                                      }
                                    }}
                                    placeholder="Page count"
                                    className="h-8 w-24 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                  />
                                  <span className="text-xs text-slate-500">pages</span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleLengthSelect(opt.id)}
                              className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-3 cursor-pointer text-left"
                            >
                              <div className="w-4 flex-shrink-0">
                                {isSelected && <Check size={14} className="text-violet-600" />}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{opt.label}</div>
                                <div className="text-xs text-slate-500">{opt.description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Audience */}
                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubMenu('audience')}
                  >
                    <div className="px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Users size={16} className="text-slate-400" />
                        <span className="font-medium text-slate-900">Audience</span>
                      </div>
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>

                    {/* Audience sub-menu */}
                    {activeSubMenu === 'audience' && (
                      <div className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-slate-200 py-2 min-w-[280px] z-50 max-h-[360px] overflow-y-auto">
                        {AUDIENCE_OPTIONS.map((opt) => {
                          const isSelected = opt.id === intent.audience;

                          if (opt.id === 'custom') {
                            return (
                              <div key={opt.id} className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={customAudience}
                                    onChange={(e) => setCustomAudience(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleCustomAudienceSubmit();
                                    }}
                                    placeholder="Custom audience..."
                                    className="h-8 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                  />
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleAudienceSelect(opt.id)}
                              className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-3 cursor-pointer text-left"
                            >
                              <div className="w-4 flex-shrink-0">
                                {isSelected && <Check size={14} className="text-violet-600" />}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{opt.label}</div>
                                <div className="text-xs text-slate-500">{opt.description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Level of Detail */}
                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubMenu('detail')}
                  >
                    <div className="px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-slate-400" />
                        <span className="font-medium text-slate-900">Level of Detail</span>
                      </div>
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>

                    {/* Detail sub-menu */}
                    {activeSubMenu === 'detail' && (
                      <div className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-slate-200 py-2 min-w-[280px] z-50">
                        {DETAIL_OPTIONS.map((opt) => {
                          const isSelected = opt.id === intent.desiredDepth;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleDetailSelect(opt.id)}
                              className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-3 cursor-pointer text-left"
                            >
                              <div className="w-4 flex-shrink-0">
                                {isSelected && <Check size={14} className="text-violet-600" />}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{opt.label}</div>
                                <div className="text-xs text-slate-500">{opt.description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Selected values summary tags */}
          <p className="text-xs text-slate-500">
            {getLengthLabel(getLengthFromBlueprint(blueprint))}
            {' \u00B7 '}
            {getAudienceLabel(intent.audience)}
            {' \u00B7 '}
            {getDetailLabel(intent.desiredDepth)} detail
          </p>
        </div>

        {/* ── Middle: Section outline ───────────────────────────────────── */}
        <div className="space-y-1">
          {blueprint.sections.map((section, index) => {
            // Determine section progress status icon
            const sectionIsComplete = isComplete || (isInProgress && generationProgress && index < generationProgress.currentSectionIndex);
            const sectionIsActive = isInProgress && generationProgress && index === generationProgress.currentSectionIndex;
            const sectionIsWaiting = isInProgress && generationProgress && index > generationProgress.currentSectionIndex;

            return (
            <div
              key={index}
              draggable={!controlsDisabled}
              onDragStart={controlsDisabled ? undefined : (e) => handleDragStart(e, index)}
              onDragOver={controlsDisabled ? undefined : (e) => handleDragOver(e, index)}
              onDrop={controlsDisabled ? undefined : (e) => handleDrop(e, index)}
              onDragEnd={controlsDisabled ? undefined : handleDragEnd}
              className={`group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors ${
                sectionIsActive ? 'bg-violet-50' :
                dragOverIndex === index ? 'bg-violet-50' : 'hover:bg-slate-50'
              } ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              {/* Progress icon or drag handle */}
              {(isInProgress || isComplete) ? (
                <div className="mt-0.5 flex h-[44px] w-6 items-center justify-center">
                  {sectionIsComplete ? (
                    <Check size={16} className="text-violet-600" />
                  ) : sectionIsActive ? (
                    <Loader2 size={16} className="text-violet-600 animate-spin" />
                  ) : (
                    <Circle size={16} className="text-slate-300" />
                  )}
                </div>
              ) : (
              <button
                type="button"
                className="mt-0.5 flex h-[44px] w-6 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
                aria-label={`Drag to reorder ${section.name}`}
                tabIndex={-1}
              >
                <GripVertical size={16} />
              </button>
              )}

              {/* Section info */}
              <div className="flex-1 min-w-0">
                {controlsDisabled ? (
                  <span className="block text-sm font-medium text-slate-900">{section.name}</span>
                ) : (
                <input
                  type="text"
                  value={section.name}
                  onChange={(e) =>
                    updateSection(index, { name: e.target.value })
                  }
                  className="block w-full text-sm font-medium text-slate-900 bg-transparent border-none p-0 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
                  aria-label={`Section name ${index + 1}`}
                />
                )}
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {section.purpose}
                </p>
              </div>

              {/* Density toggle — hidden during generation */}
              {!controlsDisabled && (
              <div className="flex items-center gap-1 mt-0.5">
                {DENSITIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateSection(index, { density: d })}
                    className={`h-7 min-w-[44px] px-2 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      section.density === d
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                    aria-label={`Set ${section.name} density to ${d}`}
                    title={DENSITY_TOOLTIPS[d]}
                  >
                    {DENSITY_LABELS[d]}
                  </button>
                ))}
              </div>
              )}

              {/* Estimated word count */}
              {section.estimatedWordCount != null && (
                <span className="mt-1 whitespace-nowrap text-xs text-slate-400">
                  ~{section.estimatedWordCount}w
                </span>
              )}

              {/* Remove button — hidden during generation */}
              {!controlsDisabled && (
              <button
                type="button"
                onClick={() => removeSection(index)}
                className="mt-0.5 flex h-[44px] w-8 items-center justify-center rounded text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-slate-500 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                aria-label={`Remove section ${section.name}`}
              >
                <X size={14} />
              </button>
              )}
            </div>
            );
          })}

          {/* Add section — hidden during generation */}
          {controlsDisabled ? null : isAddingSection ? (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-6" /> {/* spacer for alignment */}
              <input
                ref={addInputRef}
                type="text"
                value={addingSectionName}
                onChange={(e) => setAddingSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSection();
                  if (e.key === 'Escape') {
                    setIsAddingSection(false);
                    setAddingSectionName('');
                  }
                }}
                placeholder="Section name..."
                className="h-8 flex-1 rounded-full border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                autoFocus
              />
              <button
                type="button"
                onClick={addSection}
                disabled={!addingSectionName.trim()}
                className="h-8 min-w-[44px] rounded-full bg-violet-600 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-40"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingSection(false);
                  setAddingSectionName('');
                }}
                className="h-8 min-w-[44px] rounded-full border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAddingSection(true);
                setTimeout(() => addInputRef.current?.focus(), 0);
              }}
              className="flex h-[44px] items-center gap-1.5 px-2 text-sm text-violet-600 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
            >
              <Plus size={16} />
              Add section
            </button>
          )}
        </div>

        {/* ── Bottom: Summary + Generate ────────────────────────────────── */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500 text-center">
            {totalWords > 0 ? `~${totalWords.toLocaleString()} words` : 'Word count TBD'}
            {' \u00B7 '}
            {blueprint.suggestedPageCount}{' '}
            {blueprint.suggestedPageCount === 1 ? 'page' : 'pages'}
            {' \u00B7 '}
            {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
          </p>

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || controlsDisabled || sectionCount === 0}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-white text-sm font-semibold transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isComplete ? (
              <>
                <Check size={16} />
                Document ready
              </>
            ) : isInProgress ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Building your document...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
