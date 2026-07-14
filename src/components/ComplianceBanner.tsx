'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Block } from '@/types';
import {
  aggregateBlockContent,
  runComplianceScan,
  type ComplianceState,
  type ComplianceScanResult,
  type PiiFlag,
} from '@/lib/compliance';

// --- Constants ---

const SENSITIVITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Low' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium' },
  high: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'High' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Critical' },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};

// --- Props ---

interface ComplianceBannerProps {
  blocks: Block[];
  scanRequested?: boolean;
  onScanComplete?: () => void;
  onComplianceResult?: (result: ComplianceScanResult | null) => void;
}

// --- PII Flag Badge ---

function PiiFlagBadge({ flag }: { flag: PiiFlag }) {
  const style = SEVERITY_BADGE[flag.severity] ?? SEVERITY_BADGE['medium'];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
      title={`${flag.type} found at ${flag.location} (${flag.severity})`}
    >
      <ShieldIcon />
      {flag.type}
      <span className="text-[10px] opacity-70">{flag.location}</span>
    </span>
  );
}

// --- Icons ---

function ShieldIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );
}

// --- Main Component ---

export default function ComplianceBanner({
  blocks,
  scanRequested = false,
  onScanComplete,
  onComplianceResult,
}: ComplianceBannerProps) {
  const [state, setState] = useState<ComplianceState>({
    status: 'idle',
    result: null,
    errorMessage: null,
  });
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevScanRequestedRef = useRef(false);

  const SCAN_TIMEOUT_MS = 15_000;

  const cancelScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState({
      status: 'error',
      result: null,
      errorMessage: 'Scan cancelled — you can proceed without compliance check',
    });
  }, []);

  const scan = useCallback(async (content: string) => {
    const scanId = ++abortRef.current;

    // Create AbortController with timeout
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, SCAN_TIMEOUT_MS);

    setState((prev) => ({ ...prev, status: 'scanning' }));

    const result = await runComplianceScan(content, controller.signal);

    clearTimeout(timeoutId);
    abortControllerRef.current = null;

    // Only apply if this is still the latest scan
    if (scanId === abortRef.current) {
      // Customize timeout message
      if (result.status === 'error' && result.errorMessage === 'Scan timed out or was cancelled') {
        setState({
          status: 'error',
          result: null,
          errorMessage: 'Scan timed out — you can proceed without compliance check',
        });
      } else {
        setState(result);
      }
    }
  }, []);

  // Only run scan when scanRequested transitions from false to true
  useEffect(() => {
    if (scanRequested && !prevScanRequestedRef.current) {
      const content = aggregateBlockContent(blocks);

      if (content.trim().length === 0) {
        setState({ status: 'idle', result: null, errorMessage: null });
        onScanComplete?.();
        return;
      }

      void scan(content).then(() => {
        onScanComplete?.();
      });
    }
    prevScanRequestedRef.current = scanRequested;
  }, [scanRequested, blocks, scan, onScanComplete]);

  // Forward compliance result to parent
  useEffect(() => {
    if (onComplianceResult) {
      onComplianceResult(state.result);
    }
  }, [state.result, onComplianceResult]);

  // Don't render until a scan has been explicitly run
  if (state.status === 'idle' && !state.result) {
    return null;
  }

  const result = state.result;
  const piiCount = result?.piiFlags.length ?? 0;
  const sensitivity = result?.sensitivityLevel ?? 'low';
  const sensitivityStyle = SENSITIVITY_STYLES[sensitivity] ?? SENSITIVITY_STYLES['low'];

  return (
    <div data-compliance-banner className="mx-auto w-[794px] mt-3">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Summary bar */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((prev) => !prev)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((prev) => !prev); } }}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <ShieldIcon />
            <span className="text-sm font-medium text-slate-900">
              Compliance
            </span>

            {state.status === 'scanning' && (
              <span className="flex items-center gap-1.5 text-xs text-violet-600">
                <SpinnerIcon />
                Scanning...
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelScan();
                  }}
                  className="ml-1 px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Cancel compliance scan"
                >
                  Cancel
                </button>
              </span>
            )}

            {state.status === 'error' && (
              <span className="text-xs text-red-600">
                Scan error
              </span>
            )}

            {state.status === 'complete' && result && (
              <>
                {/* Sensitivity indicator */}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sensitivityStyle.bg} ${sensitivityStyle.text}`}
                >
                  {sensitivityStyle.label} sensitivity
                </span>

                {/* PII count */}
                {piiCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {piiCount} PII {piiCount === 1 ? 'flag' : 'flags'}
                  </span>
                )}

                {piiCount === 0 && (
                  <span className="text-xs text-slate-400">
                    No PII detected
                  </span>
                )}
              </>
            )}
          </div>

          {/* Expand/collapse chevron */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Expanded detail */}
        {expanded && state.status === 'complete' && result && (
          <div className="border-t border-slate-100 px-4 py-3">
            {piiCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                {result.piiFlags.map((flag, i) => (
                  <PiiFlagBadge key={`${flag.type}-${flag.location}-${i}`} flag={flag} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                No personally identifiable information detected in the current document.
              </p>
            )}
          </div>
        )}

        {/* Error detail */}
        {expanded && state.status === 'error' && state.errorMessage && (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-red-600">{state.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export type { ComplianceBannerProps };
