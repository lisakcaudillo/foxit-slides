import { complianceScan } from '@/lib/atlas';
import type { Block } from '@/types';

// --- Compliance State Types ---

export interface PiiFlag {
  type: string;
  location: string;
  severity: string;
}

export interface ComplianceScanResult {
  piiFlags: PiiFlag[];
  sensitivityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export type ComplianceStatus = 'idle' | 'scanning' | 'complete' | 'error';

export interface ComplianceState {
  status: ComplianceStatus;
  result: ComplianceScanResult | null;
  errorMessage: string | null;
}

// --- Helpers ---

/**
 * Aggregates all block content into a single string for compliance scanning.
 * Strips HTML tags to send plain text to Atlas.
 */
export function aggregateBlockContent(blocks: Block[]): string {
  return blocks
    .map((block) => block.content.replace(/<[^>]*>/g, ''))
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
}

/**
 * Runs a compliance scan via the Atlas API client.
 * Returns the full compliance state based on the response.
 * Accepts an optional AbortSignal for cancellation/timeout support.
 */
export async function runComplianceScan(
  content: string,
  signal?: AbortSignal
): Promise<ComplianceState> {
  if (content.trim().length === 0) {
    return { status: 'idle', result: null, errorMessage: null };
  }

  try {
    const response = await complianceScan(content, signal);

    if (response.error || !response.data) {
      return {
        status: 'error',
        result: null,
        errorMessage: response.error ?? 'No data returned from compliance scan',
      };
    }

    return {
      status: 'complete',
      result: response.data,
      errorMessage: null,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        result: null,
        errorMessage: 'Scan timed out or was cancelled',
      };
    }
    // Connection failed — compliance scan unavailable.
    // Return idle so the banner stays hidden rather than showing an error.
    return { status: 'idle', result: null, errorMessage: null };
  }
}
