/**
 * Saved Comparison Reports — localStorage-backed report storage.
 *
 * Follows the same CRUD pattern as documentStorage.ts.
 * Each completed comparison is auto-saved as a report with full state.
 */

import type { ComparisonResult, ReviewStatus, MultiReviewStatuses, MultiComparisonResult } from '@/components/atlas/types';

const STORAGE_KEY = 'compose:compare-reports';
const MAX_REPORTS = 20;

export interface SavedCompareReport {
  id: string;
  docNameA: string;
  docNameB: string;
  createdAt: string;
  updatedAt: string;
  compareMode: 'local' | 'ai' | 'ai-private';
  result: ComparisonResult;
  reviewStatuses: Record<string, ReviewStatus>;
  multiReviewStatuses?: MultiReviewStatuses;
  acceptedRewrites?: Record<string, string>;
  activeSkill: string | null;
  executiveSummary: string | null;
  isMulti?: boolean;
  multiResult?: MultiComparisonResult;
  changeCount: number;
  reviewedCount: number;
}

/** Get all saved reports, sorted by updatedAt descending. */
export function getAllReports(): SavedCompareReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const reports = JSON.parse(raw) as SavedCompareReport[];
    return reports.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

/** Get a single report by ID. */
export function getReport(id: string): SavedCompareReport | null {
  const reports = getAllReports();
  return reports.find((r) => r.id === id) ?? null;
}

/** Save (upsert) a report. Creates if new, updates if exists. Trims to MAX_REPORTS. */
export function saveReport(report: SavedCompareReport): void {
  if (typeof window === 'undefined') return;
  try {
    const reports = getAllReports();
    const existingIndex = reports.findIndex((r) => r.id === report.id);

    if (existingIndex >= 0) {
      reports[existingIndex] = { ...report, updatedAt: new Date().toISOString() };
    } else {
      reports.unshift({ ...report, updatedAt: new Date().toISOString() });
    }

    // Trim to max
    const trimmed = reports.slice(0, MAX_REPORTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full or unavailable */ }
}

/** Update a report partially. */
export function updateReport(id: string, partial: Partial<SavedCompareReport>): void {
  if (typeof window === 'undefined') return;
  try {
    const reports = getAllReports();
    const index = reports.findIndex((r) => r.id === id);
    if (index < 0) return;
    reports[index] = { ...reports[index], ...partial, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch { /* ignore */ }
}

/** Delete a report by ID. */
export function deleteReport(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const reports = getAllReports().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch { /* ignore */ }
}

/** Get report count. */
export function getReportCount(): number {
  return getAllReports().length;
}
