/**
 * Server-side Foxit PDF SDK wrapper.
 * Uses @foxitsoftware/foxit-pdf-sdk-node for all PDF operations.
 *
 * This module is imported ONLY by API routes (server-side).
 * Client code uses lib/foxit.ts which delegates via fetch.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { tmpdir } from 'os';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FSDK: any = null;

let initialized = false;
let sdkVersion: string | null = null;

function getSN(): string {
  // Accept both FOXIT_SDK_SN (preferred) and legacy FOXIT_SN.
  // .env.local uses FOXIT_SDK_SN; some older .env files use FOXIT_SN.
  return process.env.FOXIT_SDK_SN || process.env.FOXIT_SN || '';
}

function getKey(): string {
  return process.env.FOXIT_SDK_KEY || process.env.FOXIT_KEY || '';
}

function detectPlatform(): 'windows' | 'linux' | 'none' {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'linux') return 'linux';
  return 'none';
}

/** Initialize the SDK. Safe to call multiple times — only runs once. */
export function ensureSDK(): { loaded: boolean; platform: string; version: string | null; error?: string } {
  if (initialized && FSDK) {
    return { loaded: true, platform: detectPlatform(), version: sdkVersion };
  }

  try {
    // Dynamic require — the native module is only available server-side
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FSDK = require('@foxitsoftware/foxit-pdf-sdk-node');
  } catch (err) {
    return {
      loaded: false,
      platform: 'none',
      version: null,
      error: `Failed to load Foxit SDK native module: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const sn = getSN();
  const key = getKey();

  if (!sn || !key) {
    return {
      loaded: false,
      platform: detectPlatform(),
      version: null,
      error: 'Foxit SDK credentials missing. Set FOXIT_SDK_SN and FOXIT_SDK_KEY (or legacy FOXIT_SN/FOXIT_KEY) in .env.local. If you just edited .env, restart `npm run dev` — Next.js only loads env on process start.',
    };
  }

  const errorCode = FSDK.Library.Initialize(sn, key);
  if (errorCode !== FSDK.e_ErrSuccess) {
    const msg = errorCode === FSDK.e_ErrInvalidLicense
      ? 'Invalid Foxit SDK license key.'
      : `SDK initialization failed with error code ${errorCode}.`;
    return { loaded: false, platform: detectPlatform(), version: null, error: msg };
  }

  initialized = true;
  sdkVersion = '11.0.0';

  return { loaded: true, platform: detectPlatform(), version: sdkVersion };
}

/** Get the SDK module. Throws if not initialized. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSDK(): any {
  if (!FSDK || !initialized) {
    throw new Error('Foxit SDK not initialized. Call ensureSDK() first.');
  }
  return FSDK;
}

/** Check if SDK is ready without initializing */
export function isSDKReady(): boolean {
  return initialized && FSDK !== null;
}

/** Release the SDK — call on process shutdown if needed */
export function releaseSDK(): void {
  if (FSDK && initialized) {
    FSDK.Library.Release();
    initialized = false;
    FSDK = null;
  }
}

// ── Document storage helpers ─────────────────────────────────────────────

const DOCUMENTS_DIR = join(tmpdir(), 'compose-documents');

/** Get the safe documents directory, creating it if needed */
export function getDocumentsDir(): string {
  if (!existsSync(DOCUMENTS_DIR)) {
    mkdirSync(DOCUMENTS_DIR, { recursive: true });
  }
  return DOCUMENTS_DIR;
}

/**
 * Resolve a documentId to a safe file path within the documents directory.
 * Prevents path traversal by stripping directory components and resolving
 * within the safe documents directory only.
 */
export function resolveDocumentPath(documentId: string): string {
  const safeName = basename(documentId);
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('Invalid document ID');
  }
  const resolved = resolve(getDocumentsDir(), safeName);
  // Verify the resolved path is still within the documents directory
  if (!resolved.startsWith(getDocumentsDir())) {
    throw new Error('Invalid document path');
  }
  return resolved;
}

/**
 * Generate a safe output path for a processed document.
 * Appends a suffix before the .pdf extension.
 */
export function outputPath(documentId: string, suffix: string): string {
  const safeName = basename(documentId);
  const outputName = safeName.replace(/\.pdf$/i, `_${suffix}.pdf`);
  return resolve(getDocumentsDir(), outputName);
}

// ── PDF text extraction ─────────────────────────────────────────────────

/**
 * A bookmark entry from the PDF outline tree.
 * Phase 1b Layer 0 — surfaced from the author's embedded outline,
 * primary heading source when present (~30-50% of business documents).
 */
export interface PDFBookmark {
  title: string;
  /** 0-based page index the bookmark navigates to. -1 if unresolvable. */
  pageIndex: number;
  /** 0 = top-level chapter, 1 = sub-section, etc. */
  depth: number;
}

/**
 * A structure element detected by Foxit Layout Recognition (Phase 1b Layer 2).
 * Foxit's LR module runs on untagged PDFs and produces a PDF/UA-aligned
 * tag tree heuristically. We map its element types to FXDA block types.
 */
export interface PDFLayoutElement {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'figure';
  /** Heading level 1-6 if type=='heading'. Undefined otherwise. */
  level?: number;
  content: string;
  /** 1-based page number. */
  page: number;
  /** Foxit's element type string (e.g. 'H1', 'P', 'Table', 'L', 'Figure'). */
  rawType: string;
}

/**
 * Phase 1b post-pass — upgrade `P` blocks that look like numbered legal
 * clauses ("1. DEFINITIONS", "2.3 Termination", "Article IV") to headings.
 * Foxit LR doesn't promote these to heading tags; this regex layer recovers
 * them. Heading level is derived from dot-depth (1 = H2, 1.1 = H3, 1.1.1 = H4).
 */
const CLAUSE_HEADING_RE = /^(\d+(?:\.\d+){0,3})[\.\)]?\s+([A-Z][A-Z\s,\-/&]+|[A-Z][a-zA-Z\s,\-/&]{2,80})$/;
const ROMAN_HEADING_RE = /^(?:Article|Section|Clause)\s+([IVXLCDM]+|\d+)[\.\:]?\s*/i;

export function upgradeNumberedClauseHeadings(elements: PDFLayoutElement[]): PDFLayoutElement[] {
  return elements.map((el) => {
    if (el.type !== 'paragraph' || el.content.length > 200) return el;

    const trimmed = el.content.trim();

    // Numeric prefix: "1. DEFINITIONS" or "2.3 Term and Termination"
    const num = CLAUSE_HEADING_RE.exec(trimmed);
    if (num) {
      const dots = (num[1].match(/\./g) || []).length;
      const level = Math.min(2 + dots, 6); // 1.→H2, 1.1→H3, 1.1.1→H4
      return { ...el, type: 'heading', level };
    }

    // Roman numeral / Article / Section: "Article IV - Payment Terms"
    if (ROMAN_HEADING_RE.test(trimmed) && trimmed.length < 120) {
      return { ...el, type: 'heading', level: 2 };
    }

    return el;
  });
}

/** Map a Foxit LR element type string to an FXDA block type. */
function mapLayoutType(rawType: string): { type: PDFLayoutElement['type']; level?: number } | null {
  // Headings — H1-H6 carry level, HeadingN/Heading/Title default to 1.
  const headingMatch = /^H([1-6])$/.exec(rawType);
  if (headingMatch) return { type: 'heading', level: parseInt(headingMatch[1], 10) };
  if (rawType === 'HeadingN' || rawType === 'Heading' || rawType === 'Title') {
    return { type: 'heading', level: 1 };
  }

  if (rawType === 'P' || rawType === 'BlockQuote' || rawType === 'Caption') return { type: 'paragraph' };
  if (rawType === 'Table') return { type: 'table' };
  if (rawType === 'L' || rawType === 'LI') return { type: 'list' };
  if (rawType === 'Figure' || rawType === 'Formula') return { type: 'figure' };

  // Containers (Sect, Div, Span, DocumentFragment, Document) and inline tags
  // (Em, Strong, Sub, Code) are recursed into rather than emitted directly.
  // Artifacts (page-number markers, dot leaders) are dropped entirely.
  return null;
}

/**
 * Run Foxit Layout Recognition on a single page and return mapped elements.
 * Walks the LR tree depth-first, collects structure elements that map to
 * FXDA types (headings, paragraphs, tables, lists, figures), and skips
 * containers/inline/artifacts. Text is extracted from TextPage by bbox.
 *
 * Phase 1b Layer 2 baseline. Tables are emitted as flat text blocks for
 * now; cell-level structure is a follow-up.
 */
function extractLayoutElementsForPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  pageNum: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textPage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FSDK_: any,
): PDFLayoutElement[] {
  const out: PDFLayoutElement[] = [];

  let lr;
  try { lr = new FSDK_.LRContext(page); } catch { return out; }
  if (lr.IsEmpty()) return out;

  let parser;
  try {
    parser = lr.StartParse(null);
    while (parser.Continue() === FSDK_.Progressive.e_ToBeContinued) { /* progressive parse */ }
  } catch { return out; }

  let root;
  try { root = lr.GetRootElement(); } catch { return out; }
  if (!root || root.IsEmpty()) return out;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(elem: any) {
    let rawType = '';
    try { rawType = FSDK_.LRElement.StringifyElementType(elem.GetElementType()); } catch { return; }
    if (!rawType) return;

    const mapped = mapLayoutType(rawType);

    if (mapped && elem.IsStructureElement()) {
      // Emit this element as a block. Get text via TextPage.GetTextInRect(bbox).
      let content = '';
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const se: any = new FSDK_.LRStructureElement(elem);
        const bbox = se.GetBBox();
        content = (textPage.GetTextInRect(bbox) ?? '').trim().replace(/\s+/g, ' ');
      } catch { /* fall back to no content */ }

      if (content) {
        out.push({
          type: mapped.type,
          level: mapped.level,
          content,
          page: pageNum,
          rawType,
        });
      }
      // Don't recurse into emitted blocks — their children are inline content
      // already captured in the bbox text extraction.
      return;
    }

    // Container or inline — recurse into children if any.
    if (elem.IsStructureElement()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const se: any = new FSDK_.LRStructureElement(elem);
        const kc = se.GetChildCount();
        for (let i = 0; i < kc; i++) {
          walk(se.GetChild(i));
        }
      } catch { /* skip subtree on error */ }
    }
  }

  walk(root);
  return out;
}

/**
 * Walk the PDF outline tree and extract bookmark titles + destinations.
 * Returns an empty array if the document has no outline (acceptable —
 * Layers 1, 2 fill in for unbookmarked PDFs).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBookmarks(doc: any, FSDK_: any): PDFBookmark[] {
  const result: PDFBookmark[] = [];
  let root;
  try {
    root = doc.GetRootBookmark();
  } catch {
    return result;
  }
  if (!root || root.IsEmpty()) return result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(bm: any, depth: number) {
    if (bm.IsEmpty()) return;
    if (depth >= 0) {
      let title = '';
      try { title = bm.GetTitle() ?? ''; } catch { /* skip */ }

      let pageIndex = -1;
      try {
        const dest = bm.GetDestination();
        if (dest && !dest.IsEmpty()) {
          pageIndex = dest.GetPageIndex(doc) ?? -1;
        }
      } catch { /* unresolvable destinations are kept but flagged */ }

      if (title) {
        result.push({ title, pageIndex, depth });
      }
    }

    if (bm.HasChild()) {
      let child;
      try { child = bm.GetFirstChild(); } catch { return; }
      while (child && !child.IsEmpty()) {
        walk(child, depth + 1);
        try { child = child.GetNextSibling(); } catch { break; }
      }
    }
  }

  // The root bookmark itself has no title — start walking children at depth 0.
  walk(root, -1);
  return result;
}

/**
 * Extract text content from a PDF file using the Foxit SDK.
 * Returns an array of { page, text } objects per page, plus the bookmark
 * outline if the document carries one.
 *
 * Phase 1b Layer 0: bookmarks are surfaced alongside text. Callers can
 * emit them as heading blocks for documents that ship an outline.
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer
): Promise<{
  pages: Array<{ page: number; text: string }>;
  bookmarks: PDFBookmark[];
  layoutElements: PDFLayoutElement[];
  error?: string;
}> {
  const sdkState = ensureSDK();
  if (!sdkState.loaded || !FSDK) {
    return { pages: [], bookmarks: [], layoutElements: [], error: sdkState.error ?? 'Foxit SDK not available' };
  }

  // Write buffer to a temp file — SDK requires a file path
  const tempPath = join(tmpdir(), `compose-extract-${Date.now()}.pdf`);
  try {
    writeFileSync(tempPath, pdfBuffer);

    const doc = new FSDK.PDFDoc(tempPath);
    const loadErr = doc.Load('');
    if (loadErr !== 0) {
      return { pages: [], bookmarks: [], layoutElements: [], error: `Failed to load PDF (error code: ${loadErr}). File may be encrypted.` };
    }

    const pageCount = doc.GetPageCount();
    const pages: Array<{ page: number; text: string }> = [];
    const layoutElements: PDFLayoutElement[] = [];

    for (let i = 0; i < pageCount; i++) {
      const page = doc.GetPage(i);
      if (!page || page.IsEmpty()) continue;

      // Parse the page content
      const parseResult = page.StartParse(0, null, false);
      if (parseResult) {
        // Progressive parse — run until done
        while (parseResult.GetRateOfProgress() < 100) {
          parseResult.Continue();
        }
      }

      // Extract text
      const textPage = new FSDK.TextPage(page, FSDK.TextPage.e_ParseTextNormal);
      if (!textPage.IsEmpty()) {
        const charCount = textPage.GetCharCount();
        if (charCount > 0) {
          const text = textPage.GetChars(0, charCount);
          if (text && text.trim()) {
            pages.push({ page: i + 1, text: text.trim() });
          }
        }
      }

      // Phase 1b Layer 2: run Layout Recognition on this page and collect
      // mapped FXDA-typed elements. Cheap (~5-11ms per typical page);
      // bails silently if LR fails or is empty.
      try {
        const pageElements = extractLayoutElementsForPage(page, i + 1, textPage, FSDK);
        layoutElements.push(...pageElements);
      } catch { /* LR failures don't block text extraction */ }
    }

    // Phase 1b Layer 0: extract bookmarks from the outline tree.
    // When present, these are the author's intended heading hierarchy.
    const bookmarks = extractBookmarks(doc, FSDK);

    return { pages, bookmarks, layoutElements };
  } catch (err) {
    return {
      pages: [],
      bookmarks: [],
      layoutElements: [],
      error: `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    // Clean up temp file
    try { unlinkSync(tempPath); } catch { /* ignore */ }
  }
}

// ── OCR (scanned PDFs → searchable text) ────────────────────────────────

let ocrEngineInitialized = false;
let ocrEngineError: string | null = null;

/**
 * Lazy init for the OCR engine. Caches success/failure so we don't retry.
 * Required env var: FOXIT_OCR_RESOURCE_PATH (path to Res_OCR_V*_win/ folder).
 * License must include "OCR" module (per Foxit license).
 */
function ensureOCREngine(): { loaded: boolean; error?: string } {
  if (ocrEngineInitialized) return { loaded: true };
  if (ocrEngineError) return { loaded: false, error: ocrEngineError };

  const sdkState = ensureSDK();
  if (!sdkState.loaded) {
    ocrEngineError = sdkState.error || 'Foxit SDK not loaded';
    return { loaded: false, error: ocrEngineError };
  }

  const resourcePath = process.env.FOXIT_OCR_RESOURCE_PATH ?? '';
  if (!resourcePath) {
    ocrEngineError = 'FOXIT_OCR_RESOURCE_PATH required in .env.local (path to Res_OCR_V*_win/ folder)';
    return { loaded: false, error: ocrEngineError };
  }
  if (!existsSync(resourcePath)) {
    ocrEngineError = `FOXIT_OCR_RESOURCE_PATH points to non-existent folder: ${resourcePath}`;
    return { loaded: false, error: ocrEngineError };
  }

  const FSDK = getSDK();
  try {
    const errorCode = FSDK.OCREngine.Initialize(resourcePath);
    if (errorCode !== FSDK.e_ErrSuccess) {
      ocrEngineError = `OCR engine initialization failed (error code: ${errorCode}). License may be missing the OCR module.`;
      return { loaded: false, error: ocrEngineError };
    }
    FSDK.OCREngine.SetLanguages(process.env.FOXIT_OCR_LANGUAGES ?? 'English');
    ocrEngineInitialized = true;
    return { loaded: true };
  } catch (err) {
    ocrEngineError = `OCR engine init threw: ${err instanceof Error ? err.message : String(err)}`;
    return { loaded: false, error: ocrEngineError };
  }
}

/** Whether OCR is wired and ready (license + resource path + init). */
export function isOCRReady(): boolean {
  return ensureOCREngine().loaded;
}

/**
 * OCR a PDF buffer in-place and return a new buffer with searchable text
 * embedded behind the scanned images. The returned buffer can be fed back
 * into extractTextFromPDF to get the recognized text.
 *
 * `isEditable: false` (default) makes the OCR layer searchable but not
 * directly editable — preserves the visual fidelity of the original.
 */
export async function ocrPDFBuffer(
  pdfBuffer: Buffer,
  options: { editable?: boolean } = {},
): Promise<{ pdfBuffer: Buffer } | { error: string }> {
  const ocrState = ensureOCREngine();
  if (!ocrState.loaded) return { error: ocrState.error || 'OCR engine not loaded' };

  const FSDK = getSDK();
  const inputPath = join(tmpdir(), `compose-ocr-in-${Date.now()}.pdf`);
  const outputPath = join(tmpdir(), `compose-ocr-out-${Date.now()}.pdf`);

  try {
    writeFileSync(inputPath, pdfBuffer);
    const doc = new FSDK.PDFDoc(inputPath);
    const loadErr = doc.Load('');
    if (loadErr !== 0) {
      return { error: `Failed to load PDF for OCR (error code: ${loadErr})` };
    }

    const ocr = new FSDK.OCR();
    ocr.OCRPDFDocument(doc, options.editable ?? false);
    doc.SaveAs(outputPath, FSDK.PDFDoc.e_SaveFlagNoOriginal);

    const outputBuffer = readFileSync(outputPath);
    return { pdfBuffer: outputBuffer };
  } catch (err) {
    return { error: `OCR failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { unlinkSync(inputPath); } catch { /* ignore */ }
    try { unlinkSync(outputPath); } catch { /* ignore */ }
  }
}

// ── Page rendering (PDF page → PNG) for Layer 3 VLM ─────────────────────

/**
 * Render a single PDF page to a PNG buffer at a target maximum dimension.
 * Used by Layer 3 (VLM) to send page images to vision-capable models.
 *
 * `pageIndex` is 0-based.
 * `maxDimension` caps the longer edge in pixels (default 1568 — Anthropic's
 *   vision sweet spot: any larger gets resized server-side anyway).
 */
export async function renderPDFPageToPNG(
  pdfBuffer: Buffer,
  pageIndex: number,
  options: { maxDimension?: number } = {},
): Promise<{ pngBuffer: Buffer; width: number; height: number } | { error: string }> {
  const sdkState = ensureSDK();
  if (!sdkState.loaded) {
    return { error: sdkState.error || 'Foxit SDK not loaded' };
  }
  const FSDK = getSDK();

  const maxDim = options.maxDimension ?? 1568;
  const tempPdfPath = join(tmpdir(), `compose-vlm-page-${Date.now()}.pdf`);
  const tempPngPath = join(tmpdir(), `compose-vlm-page-${Date.now()}.png`);

  try {
    writeFileSync(tempPdfPath, pdfBuffer);
    const doc = new FSDK.PDFDoc(tempPdfPath);
    const loadErr = doc.Load('');
    if (loadErr !== 0) {
      return { error: `Failed to load PDF (error code: ${loadErr})` };
    }

    const pageCount = doc.GetPageCount();
    if (pageIndex < 0 || pageIndex >= pageCount) {
      return { error: `Page index ${pageIndex} out of range (doc has ${pageCount} pages)` };
    }

    const page = doc.GetPage(pageIndex);
    if (!page || page.IsEmpty()) {
      return { error: `Page ${pageIndex} is empty or unavailable` };
    }

    const parseResult = page.StartParse(0, null, false);
    if (parseResult) {
      while (parseResult.GetRateOfProgress() < 100) {
        parseResult.Continue();
      }
    }

    const pageWidth = page.GetWidth();
    const pageHeight = page.GetHeight();
    const scale = Math.min(maxDim / Math.max(pageWidth, pageHeight), 4);
    const renderWidth = Math.max(1, Math.round(pageWidth * scale));
    const renderHeight = Math.max(1, Math.round(pageHeight * scale));

    const matrix = page.GetDisplayMatrix(0, 0, renderWidth, renderHeight, page.GetRotation());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bitmap = new FSDK.Bitmap(renderWidth, renderHeight, FSDK.Bitmap.e_DIBArgb, null as any, 0);
    bitmap.FillRect(0xFFFFFFFF, null);

    const renderer = new FSDK.Renderer(bitmap, false);
    const renderProgress = renderer.StartRender(page, matrix, null);
    if (renderProgress) {
      while (renderProgress.GetRateOfProgress() < 100) {
        renderProgress.Continue();
      }
    }

    const img = new FSDK.Image();
    img.AddFrame(bitmap);
    const saved = img.SaveAs(tempPngPath);
    if (!saved) {
      return { error: 'Failed to save rendered page as PNG' };
    }

    const pngBuffer = readFileSync(tempPngPath);
    return { pngBuffer, width: renderWidth, height: renderHeight };
  } catch (err) {
    return { error: `Page render failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { unlinkSync(tempPdfPath); } catch { /* ignore */ }
    try { unlinkSync(tempPngPath); } catch { /* ignore */ }
  }
}

// ── Foxit text-search (find text on a PDF page) ──────────────────────────

export interface NormalizedRect {
  /** All four values are normalized to [0, 1] relative to page width/height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FindTextResult {
  pageWidth: number;
  pageHeight: number;
  /** Match rectangles in normalized (0..1) coords, image-space (top-left origin). */
  rects: NormalizedRect[];
}

/**
 * Find an arbitrary text string on a specific PDF page and return its
 * bounding rectangles as normalized 0..1 coords (top-left origin) so the
 * client can overlay highlight divs that scale with any image display size.
 *
 * Uses Foxit's TextSearch class scoped to a single page. Tries the full
 * trimmed query first; if no match, falls back to a 60-char prefix to
 * tolerate slight paraphrasing or line-wrap artifacts.
 */
export async function findTextOnPage(
  pdfBuffer: Buffer,
  pageIndex: number,
  query: string,
): Promise<FindTextResult | { error: string }> {
  const sdkState = ensureSDK();
  if (!sdkState.loaded) return { error: sdkState.error || 'Foxit SDK not loaded' };
  const FSDK = getSDK();

  const trimmed = query.replace(/\s+/g, ' ').trim();
  if (!trimmed) return { error: 'Empty query' };

  const tempPath = join(tmpdir(), `compose-find-${Date.now()}.pdf`);
  try {
    writeFileSync(tempPath, pdfBuffer);
    const doc = new FSDK.PDFDoc(tempPath);
    const loadErr = doc.Load('');
    if (loadErr !== 0) {
      return { error: `Failed to load PDF (error code: ${loadErr})` };
    }
    const pageCount = doc.GetPageCount();
    if (pageIndex < 0 || pageIndex >= pageCount) {
      return { error: `Page index ${pageIndex} out of range (doc has ${pageCount} pages)` };
    }
    const page = doc.GetPage(pageIndex);
    if (!page || page.IsEmpty()) {
      return { error: `Page ${pageIndex} is empty` };
    }
    const parseResult = page.StartParse(0, null, false);
    if (parseResult) {
      while (parseResult.GetRateOfProgress() < 100) parseResult.Continue();
    }

    const pageWidth = page.GetWidth();
    const pageHeight = page.GetHeight();

    function searchWith(pattern: string): NormalizedRect[] {
      const search = new FSDK.TextSearch(doc, null, FSDK.TextPage.e_ParseTextNormal);
      search.SetStartPage(pageIndex);
      search.SetEndPage(pageIndex);
      search.SetPattern(pattern, false);
      const rects: NormalizedRect[] = [];
      // Cap matches so a single word like "the" doesn't return hundreds.
      const MAX_MATCHES = 12;
      let safety = 0;
      while (search.FindNext() && rects.length < MAX_MATCHES && safety < 500) {
        safety++;
        const matchPage = search.GetMatchPageIndex();
        if (matchPage !== pageIndex) continue;
        const arr = search.GetMatchRects();
        const n = arr.GetSize();
        for (let i = 0; i < n && rects.length < MAX_MATCHES; i++) {
          // RectFArray exposes elements via GetAt
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = (arr as any).GetAt(i);
          // PDF coords: origin bottom-left, y up. Image coords: top-left, y down.
          const left = r.left;
          const right = r.right;
          const top = r.top;
          const bottom = r.bottom;
          const x = left / pageWidth;
          const w = (right - left) / pageWidth;
          // Flip Y: in PDF, `top` is the higher y-value
          const y = (pageHeight - top) / pageHeight;
          const h = (top - bottom) / pageHeight;
          if (w > 0 && h > 0) rects.push({ x, y, w, h });
        }
      }
      return rects;
    }

    let rects = searchWith(trimmed);
    if (rects.length === 0 && trimmed.length > 60) {
      // Fallback: prefix
      rects = searchWith(trimmed.slice(0, 60).trim());
    }
    if (rects.length === 0 && trimmed.length > 30) {
      // Last fallback: the first sentence-like prefix (up to first period/newline)
      const firstSentence = trimmed.split(/[.!?]/)[0]?.trim().slice(0, 80);
      if (firstSentence && firstSentence.length > 8) {
        rects = searchWith(firstSentence);
      }
    }

    return { pageWidth, pageHeight, rects };
  } catch (err) {
    return { error: `Text search failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { unlinkSync(tempPath); } catch { /* ignore */ }
  }
}

// ── Office (DOCX/XLSX/PPTX) → PDF conversion ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CONVERSION_SDK: any = null;
let conversionSDKInitialized = false;
let conversionSDKError: string | null = null;

/**
 * Initialize the Foxit Conversion SDK (separate from the main PDF SDK).
 * Used by convertOfficeToPdf below. Lazy — only loads when needed.
 *
 * The Conversion SDK has its own license keys (FOXIT_CONVERSION_SDK_SN/KEY,
 * separate from FOXIT_SDK_SN/KEY) and requires a path to its res/office2pdf
 * resource folder for typesetting templates.
 */
function ensureConversionSDK(): { loaded: boolean; error?: string } {
  if (conversionSDKInitialized) return { loaded: true };
  if (conversionSDKError) return { loaded: false, error: conversionSDKError };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    CONVERSION_SDK = require('@foxitsoftware/foxit-pdf-conversion-sdk-node');
  } catch (err) {
    conversionSDKError = `Failed to load Foxit Conversion SDK module: ${err instanceof Error ? err.message : String(err)}`;
    return { loaded: false, error: conversionSDKError };
  }

  const sn = process.env.FOXIT_CONVERSION_SDK_SN ?? '';
  const key = process.env.FOXIT_CONVERSION_SDK_KEY ?? '';
  if (!sn || !key) {
    conversionSDKError = 'FOXIT_CONVERSION_SDK_SN and FOXIT_CONVERSION_SDK_KEY required in .env.local';
    return { loaded: false, error: conversionSDKError };
  }

  const errCode = CONVERSION_SDK.Library.Initialize(sn, key);
  if (errCode !== CONVERSION_SDK.ErrorCode.e_ErrSuccess) {
    conversionSDKError = errCode === CONVERSION_SDK.ErrorCode.e_ErrInvalidLicense
      ? 'Invalid Foxit Conversion SDK license key.'
      : `Conversion SDK init failed with error code ${errCode}.`;
    return { loaded: false, error: conversionSDKError };
  }

  conversionSDKInitialized = true;
  return { loaded: true };
}

export type OfficeFormat = 'word' | 'excel' | 'powerpoint';

/** Map a file extension to an OfficeFormat. Returns null for unsupported types. */
export function detectOfficeFormat(filename: string): OfficeFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx' || ext === 'doc') return 'word';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'pptx' || ext === 'ppt') return 'powerpoint';
  return null;
}

/**
 * Convert a Word/Excel/PowerPoint document to PDF using the Foxit Conversion
 * SDK. The PDF is written to a temp file; caller is responsible for reading
 * and cleaning up via the returned cleanup() function.
 *
 * Phase 1c — DOCX upload support. Bridges Office uploads into our existing
 * PDF extraction pipeline (extractTextFromPDF).
 */
export async function convertOfficeToPdf(
  buffer: Buffer,
  format: OfficeFormat,
): Promise<{ pdfPath: string; cleanup: () => void } | { error: string }> {
  const init = ensureConversionSDK();
  if (!init.loaded) return { error: init.error ?? 'Conversion SDK unavailable' };

  const resPath = process.env.FOXIT_CONVERSION_RES_PATH ?? '';
  if (!resPath) return { error: 'FOXIT_CONVERSION_RES_PATH not set in .env.local' };

  const office2pdfRes = join(resPath, 'office2pdf');
  if (!existsSync(office2pdfRes)) {
    return { error: `Conversion SDK res/office2pdf folder not found at ${office2pdfRes}` };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'office2pdf-'));
  const ext = format === 'word' ? '.docx' : format === 'excel' ? '.xlsx' : '.pptx';
  const inputPath = join(tempDir, `input${ext}`);
  const outputPath = join(tempDir, 'output.pdf');

  const cleanup = () => {
    try {
      for (const f of readdirSync(tempDir)) {
        try { unlinkSync(join(tempDir, f)); } catch { /* best effort */ }
      }
      rmdirSync(tempDir);
    } catch { /* best effort */ }
  };

  try {
    writeFileSync(inputPath, buffer);

    const wordSetting = new CONVERSION_SDK.Word2PDFSettingData(false);
    const excelSetting = new CONVERSION_SDK.Excel2PDFSettingData(false, false, null);
    const settings = new CONVERSION_SDK.Office2PDFSettingData(
      office2pdfRes,
      false,         // is_embed_font — false to keep PDF size smaller
      wordSetting,
      excelSetting,
    );

    if (format === 'word') {
      CONVERSION_SDK.Office2PDF.ConvertFromWordWithPath(inputPath, '', outputPath, settings);
    } else if (format === 'excel') {
      CONVERSION_SDK.Office2PDF.ConvertFromExcelWithPath(inputPath, '', outputPath, settings);
    } else {
      CONVERSION_SDK.Office2PDF.ConvertFromPowerPointWithPath(inputPath, '', outputPath, settings);
    }

    if (!existsSync(outputPath)) {
      cleanup();
      return { error: 'Conversion produced no output file' };
    }
    return { pdfPath: outputPath, cleanup };
  } catch (err) {
    cleanup();
    return { error: `Office→PDF conversion failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── HTML → PDF conversion ────────────────────────────────────────────────

/**
 * Convert HTML content to a PDF buffer using the Foxit Node SDK.
 * Used by /api/export/pdf and /api/foxit/export.
 *
 * Renders HTML to PDF in-process via the Foxit SDK.
 * which called the Foxit Cloud API. This in-process version uses the Node
 * SDK's HTML2PDF module — no Python sidecar, no Cloud roundtrip.
 */
export async function htmlToPdf(
  htmlContent: string,
  options: { documentName?: string; flatten?: boolean } = {},
): Promise<{ pdfBuffer: Uint8Array; pageCount: number } | { error: string }> {
  const sdkState = ensureSDK();
  if (!sdkState.loaded || !FSDK) {
    return { error: sdkState.error ?? 'Foxit SDK not available' };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'foxit-export-'));
  const htmlPath = join(tempDir, 'input.html');
  const pdfPath = join(tempDir, `${options.documentName ?? 'document'}.pdf`);

  try {
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    const converter = new FSDK.HTML2PDF();
    converter.SetPageSize(595, 842); // A4 at 72dpi
    converter.SetPageMargin(56, 56, 72, 72); // ~80px LR, ~96px TB at 72dpi

    const success = converter.Convert(htmlPath, pdfPath);
    if (!success) {
      return { error: 'HTML to PDF conversion failed' };
    }

    if (options.flatten) {
      const doc = new FSDK.PDFDoc(pdfPath);
      doc.Load('');
      for (let i = 0; i < doc.GetPageCount(); i++) {
        const page = doc.GetPage(i);
        page.Flatten(true);
      }
      doc.SaveAs(pdfPath, FSDK.PDFDoc.e_SaveFlagNoOriginal);
    }

    // Convert Buffer to Uint8Array so NextResponse can accept it as BodyInit.
    const pdfBuffer = new Uint8Array(readFileSync(pdfPath));
    const doc = new FSDK.PDFDoc(pdfPath);
    doc.Load('');
    const pageCount = doc.GetPageCount() as number;

    return { pdfBuffer, pageCount };
  } catch (err) {
    return { error: `PDF export failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try {
      for (const f of readdirSync(tempDir)) {
        try { unlinkSync(join(tempDir, f)); } catch { /* best effort */ }
      }
      rmdirSync(tempDir);
    } catch { /* best effort */ }
  }
}

// ── Hex color helpers ────────────────────────────────────────────────────

/** Convert CSS hex color string (#RRGGBB) to integer (0xRRGGBB) */
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** Map position string to SDK position constant */
export function mapPosition(pos: string | undefined): number {
  const map: Record<string, number> = {
    'center': 0,
    'top-left': 1,
    'top-right': 3,
    'bottom-left': 7,
    'bottom-right': 9,
  };
  return map[pos ?? 'center'] ?? 0;
}
