'use client';

import { useState } from 'react';
import { FileText, Shield, X, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import type { DocumentMetadata } from './InspectorPanel';

interface ClassificationBannerProps {
  metadata: DocumentMetadata;
  blockCount: number;
  onOpenInspector: () => void;
  onOverrideDocumentType?: (docType: string) => void;
}

function sensitivityLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1) + ' sensitivity';
}

function sensitivityBadgeClass(level: string): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'low':
      return 'bg-green-100 text-green-700 border-green-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

const OVERRIDE_OPTIONS = [
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

export default function ClassificationBanner({
  metadata,
  blockCount,
  onOpenInspector,
  onOverrideDocumentType,
}: ClassificationBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showOverride, setShowOverride] = useState(false);

  if (dismissed) return null;

  const confidence = metadata.confidence ?? 0;
  const isLowConfidence = confidence < 70;

  return (
    <div className="mx-auto max-w-[794px] mb-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center flex-wrap gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm">
        <FileText className="size-4 text-violet-600 flex-shrink-0" />

        {/* Document type badge */}
        <button
          onClick={onOpenInspector}
          title="AI identified this from document structure"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors min-w-0"
        >
          <span className="truncate">{metadata.documentType}</span>
          <Info className="size-3 text-slate-400 flex-shrink-0" />
        </button>

        <span className="text-slate-300">|</span>

        {/* Sensitivity badge */}
        <button
          onClick={onOpenInspector}
          title="Contains confidential terms and party data"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border hover:opacity-80 transition-opacity ${sensitivityBadgeClass(metadata.sensitivityLevel)}`}
        >
          <Shield className="size-3" />
          {sensitivityLabel(metadata.sensitivityLevel)}
          <Info className="size-3 opacity-50 flex-shrink-0" />
        </button>

        <span className="text-slate-300">|</span>

        {/* Clause count badge */}
        <button
          onClick={onOpenInspector}
          title="Clauses identified by legal pattern matching"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <span>{blockCount} clauses detected</span>
          <Info className="size-3 text-slate-400 flex-shrink-0" />
        </button>

        {/* Confidence badge */}
        {confidence > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <button
              onClick={onOpenInspector}
              title="Based on structure, keywords, and content"
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 hover:opacity-80 transition-opacity ${
                confidence >= 90
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : confidence >= 70
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              Classification confidence: {confidence}%
              <Info className="size-3 opacity-50 flex-shrink-0" />
            </button>
          </>
        )}

        <ChevronRight className="size-3.5 text-slate-400 flex-shrink-0" />

        {/* Override button for low confidence */}
        {isLowConfidence && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowOverride(!showOverride)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="size-3" />
              Override
            </button>
            {showOverride && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowOverride(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20">
                  {OVERRIDE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        onOverrideDocumentType?.(opt);
                        setShowOverride(false);
                      }}
                      className="w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="size-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
