// Foxit SDK Integration Layer
// Server-side operations delegate to /api/foxit/* API routes which use
// @foxitsoftware/foxit-pdf-sdk-node. Client code calls these thin wrappers.

import { z } from 'zod';

// ── SDK State ──────────────────────────────────────────────────────────────

interface FoxitSDKState {
  loaded: boolean;
  platform: 'windows' | 'linux' | 'none';
  version: string | null;
}

let sdkState: FoxitSDKState = {
  loaded: false,
  platform: 'none',
  version: null,
};

/** Check if the Foxit SDK is loaded and available */
export function isFoxitReady(): boolean {
  return sdkState.loaded;
}

/** Get current SDK state */
export function getFoxitState(): FoxitSDKState {
  return { ...sdkState };
}

/**
 * Initialize the Foxit SDK by checking the server-side SDK availability.
 * Call this once at app startup.
 */
export async function initFoxitSDK(): Promise<FoxitSDKState> {
  try {
    const res = await fetch('/api/foxit/init', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      sdkState = {
        loaded: data.loaded ?? false,
        platform: data.platform ?? 'none',
        version: data.version ?? null,
      };
    }
  } catch {
    sdkState = { loaded: false, platform: 'none', version: null };
  }
  return sdkState;
}

// ── SDK-Ready Result Type ──────────────────────────────────────────────────

interface FoxitResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  sdkRequired?: boolean;
}

function notReady(operation: string): FoxitResult<never> {
  return {
    success: false,
    error: `Foxit SDK not loaded. ${operation} requires the Foxit PDF SDK.`,
    sdkRequired: true,
  };
}

// ── Redaction ──────────────────────────────────────────────────────────────

export interface RedactOptions {
  /** Text or area to redact */
  target: { type: 'text'; text: string } | { type: 'area'; page: number; x: number; y: number; width: number; height: number };
  /** Fill color for redacted area (hex) */
  fillColor?: string;
  /** Overlay text after redaction */
  overlayText?: string;
}

const RedactResultSchema = z.object({
  redactedCount: z.number(),
  pages: z.array(z.number()),
});

export type RedactResult = z.infer<typeof RedactResultSchema>;

export async function redactContent(
  documentId: string,
  options: RedactOptions,
): Promise<FoxitResult<RedactResult>> {
  if (!sdkState.loaded) return notReady('Redaction');

  try {
    const res = await fetch('/api/foxit/redact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, ...options }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? 'Redaction failed' };
    return { success: true, data: RedactResultSchema.parse(data) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Redaction failed' };
  }
}

// ── Watermark ──────────────────────────────────────────────────────────────

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  rotation?: number;
  color?: string;
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  pages?: number[] | 'all';
}

const WatermarkResultSchema = z.object({
  appliedPages: z.array(z.number()),
});

export type WatermarkResult = z.infer<typeof WatermarkResultSchema>;

export async function applyWatermark(
  documentId: string,
  options: WatermarkOptions,
): Promise<FoxitResult<WatermarkResult>> {
  if (!sdkState.loaded) return notReady('Watermark');

  try {
    const res = await fetch('/api/foxit/watermark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, ...options }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? 'Watermark failed' };
    return { success: true, data: WatermarkResultSchema.parse(data) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Watermark failed' };
  }
}

// ── Digital Signature ──────────────────────────────────────────────────────

export interface DigitalSignOptions {
  certificatePath?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
}

const DigitalSignResultSchema = z.object({
  signed: z.boolean(),
  signatureId: z.string(),
  timestamp: z.string(),
});

export type DigitalSignResult = z.infer<typeof DigitalSignResultSchema>;

export async function applyDigitalSignature(
  documentId: string,
  options: DigitalSignOptions,
): Promise<FoxitResult<DigitalSignResult>> {
  if (!sdkState.loaded) return notReady('Digital Signature');

  try {
    const res = await fetch('/api/foxit/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, ...options }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? 'Digital signature failed' };
    return { success: true, data: DigitalSignResultSchema.parse(data) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Digital signature failed' };
  }
}

// ── Document Protection ────────────────────────────────────────────────────

export interface ProtectOptions {
  password?: string;
  permissions?: {
    print?: boolean;
    copy?: boolean;
    edit?: boolean;
    annotate?: boolean;
  };
  encryption?: '128-bit-aes' | '256-bit-aes';
}

const ProtectResultSchema = z.object({
  protected: z.boolean(),
  encryptionLevel: z.string(),
});

export type ProtectResult = z.infer<typeof ProtectResultSchema>;

export async function protectDocument(
  documentId: string,
  options: ProtectOptions,
): Promise<FoxitResult<ProtectResult>> {
  if (!sdkState.loaded) return notReady('Document Protection');

  try {
    const res = await fetch('/api/foxit/protect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, ...options }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? 'Protection failed' };
    return { success: true, data: ProtectResultSchema.parse(data) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Protection failed' };
  }
}

// ── PDF Export ──────────────────────────────────────────────────────────────

export interface ExportPDFOptions {
  quality?: 'standard' | 'high' | 'print';
  includeAnnotations?: boolean;
  includeFields?: boolean;
  flatten?: boolean;
}

export interface ExportPDFResult {
  blob: Blob;
  pageCount: number;
  fileSize: number;
}

export async function exportToPDF(
  documentId: string,
  content: string,
  options?: ExportPDFOptions,
): Promise<FoxitResult<ExportPDFResult>> {
  if (!sdkState.loaded) return notReady('PDF Export');

  try {
    const res = await fetch('/api/foxit/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, content, ...options }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.error ?? 'PDF export failed' };
    }
    const pageCount = parseInt(res.headers.get('X-Page-Count') ?? '0', 10);
    const blob = await res.blob();
    return {
      success: true,
      data: { blob, pageCount, fileSize: blob.size },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'PDF export failed' };
  }
}

// ── PDF Embed / Viewer ─────────────────────────────────────────────────────
// Note: Embedding requires the Foxit PDF SDK for Web (separate from the
// Node.js server SDK). This remains a placeholder until that SDK is added.

export interface EmbedOptions {
  container: HTMLElement;
  documentUrl: string;
  enableAnnotations?: boolean;
  enableFormFilling?: boolean;
  toolbarConfig?: {
    showPrint?: boolean;
    showDownload?: boolean;
    showSearch?: boolean;
  };
}

export async function embedPDFViewer(
  options: EmbedOptions,
): Promise<FoxitResult<{ viewerId: string }>> {
  if (!sdkState.loaded) return notReady('PDF Embed');

  // Viewer embedding requires the Foxit PDF SDK for Web (client-side).
  // The Node.js SDK handles server-side operations only.
  return {
    success: false,
    error: 'PDF viewer embedding requires the Foxit PDF SDK for Web. Server-side SDK does not support browser embedding.',
    sdkRequired: true,
  };
}

// ── Capability Check ───────────────────────────────────────────────────────

export type FoxitCapability =
  | 'redact'
  | 'watermark'
  | 'digital-signature'
  | 'protect'
  | 'export-pdf'
  | 'embed-viewer';

/** Check which capabilities are available based on SDK state */
export function getAvailableCapabilities(): Record<FoxitCapability, boolean> {
  const available = sdkState.loaded;
  return {
    'redact': available,
    'watermark': available,
    'digital-signature': available,
    'protect': available,
    'export-pdf': available,
    'embed-viewer': false, // Requires Foxit PDF SDK for Web (separate package)
  };
}
