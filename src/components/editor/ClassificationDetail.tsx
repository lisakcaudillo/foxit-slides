'use client';

import { Shield, Tag, Cpu, FileText, BarChart3 } from 'lucide-react';

interface ClassificationDetailProps {
  metadata: {
    documentType: string;
    sensitivityLevel: string;
    summary: string;
    tags: string[];
    fieldMap: Record<string, string>;
    confidence?: number;
  };
  blockCount: number;
}

const SENSITIVITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

const SENSITIVITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const SENSITIVITY_REASONS: Record<string, string> = {
  low: 'No personal data or confidential terms detected',
  medium: 'Contains internal business information',
  high: 'Contains confidential terms, party identifiers, or financial data',
  critical: 'Contains PII (SSN, financial accounts) or restricted information',
};

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 85) {
    return { text: 'High confidence', color: 'text-emerald-700' };
  }
  if (confidence >= 70) {
    return { text: 'Medium confidence', color: 'text-amber-700' };
  }
  return { text: 'Low confidence — manual review recommended', color: 'text-red-700' };
}

export default function ClassificationDetail({
  metadata,
  blockCount,
}: ClassificationDetailProps) {
  const confidence = metadata.confidence ?? 0;
  const activeLevelIndex = SENSITIVITY_LEVELS.indexOf(
    metadata.sensitivityLevel as (typeof SENSITIVITY_LEVELS)[number]
  );
  const cLabel = confidenceLabel(confidence);

  return (
    <div className="space-y-6">
      {/* Section 1: Document Type */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
          <FileText className="size-4 text-violet-600" />
          Document Type
        </h3>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200 mb-2">
          {metadata.documentType}
        </span>
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-medium text-slate-700">Why this classification: </span>
          {metadata.summary || 'No summary available'}
        </p>
        {metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metadata.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs border border-slate-200"
              >
                <Tag className="size-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Sensitivity Level */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
          <Shield className="size-4 text-violet-600" />
          Sensitivity Level
        </h3>

        {/* Sensitivity scale */}
        <div className="flex gap-1 mb-2">
          {SENSITIVITY_LEVELS.map((level, i) => (
            <div key={level} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-2 w-full rounded-full transition-colors ${
                  i <= activeLevelIndex ? 'bg-violet-600' : 'bg-slate-100'
                }`}
              />
              <span
                className={`text-[10px] leading-tight ${
                  level === metadata.sensitivityLevel
                    ? 'font-semibold text-violet-700'
                    : 'text-slate-400'
                }`}
              >
                {SENSITIVITY_LABELS[level]}
              </span>
            </div>
          ))}
        </div>

        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-700">
            This document was classified as {metadata.sensitivityLevel} because:{' '}
          </span>
          {SENSITIVITY_REASONS[metadata.sensitivityLevel] ?? 'Unknown sensitivity level'}
        </p>
      </section>

      {/* Section 3: Confidence Score */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
          <BarChart3 className="size-4 text-violet-600" />
          Confidence Score
        </h3>

        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-slate-900">
            {confidence > 0 ? `${confidence}%` : 'N/A'}
          </span>
          {confidence > 0 && (
            <span className={`text-xs font-medium ${cLabel.color}`}>{cLabel.text}</span>
          )}
        </div>

        {confidence > 0 && (
          <div className="h-2 rounded-full bg-slate-100 mb-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${Math.min(confidence, 100)}%` }}
            />
          </div>
        )}

        <p className="text-sm text-slate-600 mb-1.5">Confidence is based on:</p>
        <ul className="space-y-1 text-sm text-slate-600">
          <li className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-violet-400 flex-shrink-0" />
            Document structure analysis
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-violet-400 flex-shrink-0" />
            Keyword pattern matching
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-violet-400 flex-shrink-0" />
            Clause type detection
          </li>
        </ul>
      </section>

      {/* Section 4: Classification Audit */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
          <Cpu className="size-4 text-violet-600" />
          Classification Audit
        </h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Classified by</span>
            <span className="font-medium text-slate-700">AI (Claude)</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Model</span>
            <span className="font-medium text-slate-700 text-xs">claude-sonnet-4-20250514</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Timestamp</span>
            <span className="font-medium text-slate-700 text-xs">{new Date().toISOString()}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-500">Blocks analyzed</span>
            <span className="font-medium text-slate-700">{blockCount}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
