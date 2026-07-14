'use client';

import { useState, useMemo } from 'react';
import {
  Clock,
  Sparkles,
  PenLine,
  Shield,
  FileSignature,
  Eye,
  CheckCircle,
  XCircle,
  Download,
  ChevronDown,
  ChevronRight,
  Bot,
  User,
} from 'lucide-react';
import type { DocumentAuditTrail, LifecycleEvent, SigningEvent } from '@/types/audit';

interface AuditTrailViewerProps {
  trail: DocumentAuditTrail;
  onExportText?: () => void;
  onExportJSON?: () => void;
}

// ── Event Icons ────────────────────────────────────────────────────────────

function getEventIcon(type: string) {
  if (type.startsWith('block-generated') || type.startsWith('document-created')) return Sparkles;
  if (type.startsWith('block-edited') || type.startsWith('block-added') || type.startsWith('block-deleted')) return PenLine;
  if (type.startsWith('block-rewritten') || type.startsWith('field-inferred') || type.startsWith('metadata-generated')) return Bot;
  if (type.startsWith('compliance') || type.startsWith('factual')) return Shield;
  if (type.startsWith('content-redacted') || type.startsWith('watermark') || type.startsWith('digital-signature') || type.startsWith('document-protected')) return Shield;
  if (type.startsWith('exported')) return Download;
  if (type.startsWith('pipeline')) return Sparkles;
  if (type.startsWith('envelope') || type.startsWith('party-signed')) return FileSignature;
  if (type.startsWith('party-viewed')) return Eye;
  if (type.startsWith('party-declined') || type.startsWith('envelope-voided')) return XCircle;
  return Clock;
}

function getAgentColor(agent: string): string {
  if (agent === 'user') return 'text-slate-600';
  if (agent.startsWith('atlas')) return 'text-emerald-600';
  if (agent.startsWith('pipeline') || agent.startsWith('claude')) return 'text-violet-600';
  if (agent === 'foxit-sdk') return 'text-slate-500';
  return 'text-slate-400';
}

function getAgentLabel(agent: string): string {
  const labels: Record<string, string> = {
    'user': 'User',
    'atlas-extraction': 'System',
    'atlas-comparison': 'AI Compare',
    'atlas-compliance': 'AI Compliance',
    'pipeline-classify': 'AI Classify',
    'pipeline-normalize': 'AI Normalize',
    'pipeline-blueprint': 'AI Blueprint',
    'pipeline-generate': 'AI Generate',
    'pipeline-polish': 'AI Polish',
    'claude-rewrite': 'AI Rewrite',
    'claude-infer-fields': 'AI Fields',
    'claude-metadata': 'AI Metadata',
    'foxit-sdk': 'Foxit SDK',
  };
  return labels[agent] ?? agent;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AuditTrailViewer({
  trail,
  onExportText,
  onExportJSON,
}: AuditTrailViewerProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'lifecycle' | 'signing'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const allEvents = useMemo(() => {
    const lifecycle = trail.lifecycle.map((e) => ({ ...e, trail: 'lifecycle' as const }));
    const signing = trail.signing.map((e) => ({ ...e, trail: 'signing' as const }));

    const merged = [...lifecycle, ...signing];
    merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return merged;
  }, [trail]);

  const filteredEvents = useMemo(() => {
    if (activeTab === 'all') return allEvents;
    return allEvents.filter((e) => e.trail === activeTab);
  }, [allEvents, activeTab]);

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">Audit Trail</h3>
        <div className="flex gap-1">
          {onExportText && (
            <button
              onClick={onExportText}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
              title="Export as text"
            >
              TXT
            </button>
          )}
          {onExportJSON && (
            <button
              onClick={onExportJSON}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
              title="Export as JSON"
            >
              JSON
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['all', 'lifecycle', 'signing'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-violet-600 border-b-2 border-violet-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'all' ? `All (${allEvents.length})` : tab === 'lifecycle' ? `Editing (${trail.lifecycle.length})` : `Signing (${trail.signing.length})`}
          </button>
        ))}
      </div>

      {/* Event Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Clock className="size-8 mb-2" />
            <p className="text-sm">No events yet</p>
          </div>
        ) : (
          <div className="py-2">
            {filteredEvents.map((event) => {
              const isExpanded = expandedEvents.has(event.id);
              const Icon = getEventIcon(event.type);
              const isLifecycle = event.trail === 'lifecycle';
              const lifecycleEvent = isLifecycle ? (event as LifecycleEvent & { trail: 'lifecycle' }) : null;
              const signingEvent = !isLifecycle ? (event as SigningEvent & { trail: 'signing' }) : null;

              return (
                <div
                  key={event.id}
                  className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(event.id)}
                >
                  <div className="flex items-start gap-2">
                    {/* Timeline dot */}
                    <div className={`mt-0.5 ${isLifecycle ? getAgentColor(lifecycleEvent!.agent) : 'text-slate-500'}`}>
                      <Icon className="size-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {formatEventType(event.type)}
                        </span>
                        {lifecycleEvent?.confidence != null && (
                          <span className={`text-[10px] px-1 rounded ${
                            lifecycleEvent.confidence >= 90 ? 'bg-emerald-100 text-emerald-700' :
                            lifecycleEvent.confidence >= 70 ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {lifecycleEvent.confidence}%
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        {isLifecycle ? (
                          <span className={`text-[10px] ${getAgentColor(lifecycleEvent!.agent)}`}>
                            {lifecycleEvent!.agent === 'user' ? (
                              <><User className="size-2.5 inline mr-0.5" />{lifecycleEvent!.userEmail ?? 'User'}</>
                            ) : (
                              <><Bot className="size-2.5 inline mr-0.5" />{getAgentLabel(lifecycleEvent!.agent)}</>
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            {signingEvent!.partyName ?? signingEvent!.envelopeId}
                          </span>
                        )}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-2 p-2 bg-slate-50 rounded text-[11px] text-slate-600 space-y-1">
                          {lifecycleEvent?.blockId && (
                            <div>Block: <span className="font-mono text-slate-500">{lifecycleEvent.blockId}</span></div>
                          )}
                          {lifecycleEvent?.source && (
                            <div>Source: {lifecycleEvent.source}</div>
                          )}
                          {lifecycleEvent?.modelId && (
                            <div>Model: <span className="font-mono text-slate-500">{lifecycleEvent.modelId}</span></div>
                          )}
                          {lifecycleEvent?.before && (
                            <div className="bg-red-50 px-2 py-1 rounded text-slate-500 line-through">{truncate(lifecycleEvent.before, 120)}</div>
                          )}
                          {lifecycleEvent?.after && (
                            <div className="bg-emerald-50 px-2 py-1 rounded text-slate-700">{truncate(lifecycleEvent.after, 120)}</div>
                          )}
                          {lifecycleEvent?.reason && (
                            <div className="italic">Reason: {lifecycleEvent.reason}</div>
                          )}
                          {signingEvent?.ipAddress && (
                            <div>IP: {signingEvent.ipAddress}</div>
                          )}
                          {signingEvent?.certificateHash && (
                            <div>Certificate: <span className="font-mono">{signingEvent.certificateHash}</span></div>
                          )}
                          {signingEvent?.documentHash && (
                            <div>Document hash: <span className="font-mono">{signingEvent.documentHash}</span></div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expand indicator */}
                    {isExpanded ? (
                      <ChevronDown className="size-3 text-slate-400 mt-1 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="size-3 text-slate-400 mt-1 flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
        <span>{trail.lifecycle.length} edits · {trail.signing.length} signing events</span>
        <span>Last: {formatTime(trail.lastModifiedAt)}</span>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatEventType(type: string): string {
  return type
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}
