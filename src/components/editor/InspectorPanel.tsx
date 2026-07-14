'use client';

import { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Shield,
  Tag,
  Loader2,
  Sparkles,
  Hash,
  Type,
  Calendar,
  FileType,
  LetterText,
  ChevronDown,
  Check,
  Download,
  Clock,
} from 'lucide-react';
import { useCallback } from 'react';
import type { Block } from '@/types';
import type { FXDAField } from '@/types/fxda';
import type { DocumentAuditTrail } from '@/types/audit';
import AuditTrailViewer from './AuditTrailViewer';
import ClassificationDetail from './ClassificationDetail';

export interface DocumentMetadata {
  documentType: string;
  sensitivityLevel: string;
  summary: string;
  tags: string[];
  fieldMap: Record<string, string>;
  confidence?: number;
}

const DOCUMENT_TYPE_OPTIONS = [
  'Contract',
  'Invoice',
  'Offer Letter',
  'Policy',
  'General',
  'NDA',
  'Employment Agreement',
  'Vendor Contract',
  'Lease Agreement',
] as const;

interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;

  blocks: Block[];
  metadata?: DocumentMetadata | null;
  fields?: FXDAField[] | null;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
  onOverrideDocumentType?: (docType: string) => void;
  auditTrail?: DocumentAuditTrail | null;
  onExportTrailText?: () => void;
  onExportTrailJSON?: () => void;
}

type TabType = 'elements' | 'info' | 'classification' | 'audit';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function countWords(blocks: Block[]): number {
  return blocks.reduce((total, block) => {
    const text = stripHtml(block.content);
    if (!text) return total;
    return total + text.split(/\s+/).filter(Boolean).length;
  }, 0);
}

function countCharacters(blocks: Block[]): number {
  return blocks.reduce((total, block) => {
    return total + stripHtml(block.content).length;
  }, 0);
}

interface SectionCounts {
  headings: number;
  clauses: number;
  definitions: number;
  paragraphs: number;
  total: number;
}

function detectSections(blocks: Block[]): SectionCounts {
  const counts: SectionCounts = {
    headings: 0,
    clauses: 0,
    definitions: 0,
    paragraphs: 0,
    total: blocks.length,
  };

  for (const block of blocks) {
    const text = stripHtml(block.content);
    const lower = text.toLowerCase();
    const isShort = text.length > 0 && text.length < 60;
    const noPeriod = !text.endsWith('.');
    const isUpperOrTitle =
      text === text.toUpperCase() ||
      text.split(/\s+/).every((w) => w.length === 0 || /^[A-Z]/.test(w));
    if (
      block.content.startsWith('<h') ||
      /^#{1,6}\s/.test(lower) ||
      (text.length < 100 && text === text.toUpperCase() && text.length > 2) ||
      (isShort && noPeriod && isUpperOrTitle)
    ) {
      counts.headings++;
    } else if (/^\d+\.\d*\s/.test(lower) || /^section\s+\d/i.test(lower)) {
      counts.clauses++;
    } else if (/^"[^"]+"\s+means/i.test(lower) || /^definition/i.test(lower)) {
      counts.definitions++;
    } else {
      counts.paragraphs++;
    }
  }

  return counts;
}

function sensitivityColor(level: string): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fieldsToCSV(fields: FXDAField[]): string {
  const header = 'name,type,x,y,width,height,page,required,party';
  const rows = fields.map((f) => {
    const escape = (val: string) =>
      val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    return [
      escape(f.name),
      escape(f.type),
      String(f.x),
      String(f.y),
      String(f.width),
      String(f.height),
      String(f.page),
      String(f.required),
      String(f.party ?? ''),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

function confidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (confidence >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

export default function InspectorPanel({
  isOpen,
  onToggle,
  blocks,
  metadata,
  fields,
  isAnalyzing,
  onAnalyze,
  onOverrideDocumentType,
  auditTrail,
  onExportTrailText,
  onExportTrailJSON,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('elements');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [overriddenType, setOverriddenType] = useState<string | null>(null);

  const sections = useMemo(() => detectSections(blocks), [blocks]);
  const wordCount = useMemo(() => countWords(blocks), [blocks]);
  const charCount = useMemo(() => countCharacters(blocks), [blocks]);

  const displayDocType = overriddenType ?? metadata?.documentType ?? 'Unknown';

  const handleExportFieldsJSON = useCallback(() => {
    if (!fields || fields.length === 0) return;
    const blob = new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'fields.json');
  }, [fields]);

  const handleExportFieldsCSV = useCallback(() => {
    if (!fields || fields.length === 0) return;
    const csv = fieldsToCSV(fields);
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, 'fields.csv');
  }, [fields]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30"
        onClick={onToggle}
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-200 flex flex-col z-40 shadow-xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-semibold text-slate-900 text-sm">Document Info</h2>
          <button
            onClick={onToggle}
            className="size-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center border-b border-gray-200 px-4 gap-1 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('elements')}
            className={`flex-1 h-10 flex items-center justify-center gap-2 text-sm font-medium transition-all relative ${
              activeTab === 'elements' ? 'text-violet-600' : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            <FileText className="size-4" />
            Elements
            {activeTab === 'elements' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 h-10 flex items-center justify-center gap-2 text-sm font-medium transition-all relative ${
              activeTab === 'info' ? 'text-violet-600' : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            Info
            {activeTab === 'info' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('classification')}
            className={`flex-1 h-10 flex items-center justify-center gap-2 text-sm font-medium transition-all relative ${
              activeTab === 'classification' ? 'text-violet-600' : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            <Shield className="size-4" />
            Classify
            {activeTab === 'classification' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 h-10 flex items-center justify-center gap-2 text-sm font-medium transition-all relative ${
              activeTab === 'audit' ? 'text-violet-600' : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            <Clock className="size-4" />
            Audit
            {activeTab === 'audit' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'elements' && (
            <div className="space-y-6">
              {/* Document Summary */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Summary
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {metadata?.summary ?? 'No analysis yet'}
                </p>
              </section>

              {/* Detected Sections */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Detected Sections
                </h3>
                {blocks.length === 0 ? (
                  <p className="text-sm text-gray-400">No blocks yet</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                      <span className="text-sm text-gray-700">Headings</span>
                      <span className="text-sm font-medium text-slate-900">{sections.headings}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                      <span className="text-sm text-gray-700">Clauses</span>
                      <span className="text-sm font-medium text-slate-900">{sections.clauses}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                      <span className="text-sm text-gray-700">Definitions</span>
                      <span className="text-sm font-medium text-slate-900">{sections.definitions}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                      <span className="text-sm text-gray-700">Paragraphs</span>
                      <span className="text-sm font-medium text-slate-900">{sections.paragraphs}</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Sensitivity Level */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Sensitivity
                  </h3>
                  {metadata?.sensitivityLevel ? (
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 flex-shrink-0" />
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${sensitivityColor(metadata.sensitivityLevel)}`}
                      >
                        {metadata.sensitivityLevel.charAt(0).toUpperCase() +
                          metadata.sensitivityLevel.slice(1)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Run analysis to detect</p>
                  )}
                </section>

              {/* Tags */}
              {metadata?.tags && metadata.tags.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200"
                      >
                        <Tag className="size-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Detected Fields */}
              {fields && fields.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Detected Fields
                  </h3>
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                    <span className="text-sm font-medium text-blue-900">
                      {fields.length} field{fields.length !== 1 ? 's' : ''} detected
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={handleExportFieldsJSON}
                      className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1"
                    >
                      <Download className="size-3.5" />
                      Download JSON
                    </button>
                    <button
                      onClick={handleExportFieldsCSV}
                      className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1"
                    >
                      <Download className="size-3.5" />
                      Download CSV
                    </button>
                  </div>
                </section>
              )}

              {/* Quick Actions */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Quick Actions
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={onAnalyze}
                    disabled={isAnalyzing || blocks.length === 0}
                    className="w-full p-2.5 rounded-lg bg-violet-50 border border-violet-200 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed text-left transition-all flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="size-4 text-violet-600 animate-spin" />
                    ) : (
                      <Sparkles className="size-4 text-violet-600" />
                    )}
                    <span className="text-sm font-medium text-violet-900">
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Document'}
                    </span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-4">
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Document Info
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Hash className="size-3.5" />
                      Blocks
                    </div>
                    <span className="text-sm font-medium text-slate-900">{blocks.length}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Type className="size-3.5" />
                      Words
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {wordCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <LetterText className="size-3.5" />
                      Characters
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {charCount.toLocaleString()}
                    </span>
                  </div>

                  {/* Document Type with confidence and override */}
                  <div className="py-2 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileType className="size-3.5" />
                        Document Type
                      </div>
                      {metadata?.confidence != null && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${confidenceColor(metadata.confidence)}`}
                        >
                          {metadata.confidence}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="relative flex-1">
                        <button
                          onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-sm font-medium text-slate-900 bg-white transition-colors"
                        >
                          <span>{displayDocType}</span>
                          <ChevronDown className="size-3.5 text-gray-400" />
                        </button>
                        {showTypeDropdown && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setShowTypeDropdown(false)}
                            />
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 max-h-48 overflow-y-auto">
                              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => {
                                    setOverriddenType(opt);
                                    setShowTypeDropdown(false);
                                    onOverrideDocumentType?.(opt);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                                >
                                  {(overriddenType === opt || (!overriddenType && metadata?.documentType === opt)) && (
                                    <Check className="size-3.5 text-violet-600" />
                                  )}
                                  <span className={
                                    (overriddenType === opt || (!overriddenType && metadata?.documentType === opt))
                                      ? 'font-medium text-violet-700'
                                      : ''
                                  }>
                                    {opt}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {overriddenType && (
                      <span className="text-[10px] text-gray-400 mt-1 inline-block">(manually set)</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="size-3.5" />
                      Created
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {new Date().toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'classification' && (
            <div className="space-y-4">
              {metadata ? (
                <ClassificationDetail
                  metadata={metadata}
                  blockCount={blocks.length}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Shield className="size-8 mb-2" />
                  <p className="text-sm">No classification yet</p>
                  <p className="text-xs mt-1">Analyze the document to see details</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="flex-1 min-h-0">
              {auditTrail ? (
                <AuditTrailViewer
                  trail={auditTrail}
                  onExportText={onExportTrailText}
                  onExportJSON={onExportTrailJSON}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Clock className="size-8 mb-2" />
                  <p className="text-sm">No audit trail yet</p>
                  <p className="text-xs mt-1">Events will appear as you edit</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
