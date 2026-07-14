'use client';

import { useState, useCallback } from 'react';
import type { Block, WorkflowPreset } from '@/types';
import type { FXDATemplate, FXDAField, FXDAPage } from '@/types/fxda';

interface ExportButtonProps {
  blocks: Block[];
  workflow?: WorkflowPreset | null;
  fields?: FXDAField[];
  documentName?: string;
  onBeforeExport?: () => boolean; // return false to block export
  onSaveAsTemplate?: () => void;
}

// --- FXDA JSON builder ---

function buildFXDATemplate(
  blocks: Block[],
  workflow?: WorkflowPreset | null,
  fields?: FXDAField[],
  documentName?: string,
): FXDATemplate {
  // Group blocks by page (default to page 1 if no page info)
  const pageMap = new Map<number, string[]>();
  for (const block of blocks) {
    const pageNum = 1; // blocks don't carry page info after canvas editing
    const existing = pageMap.get(pageNum) ?? [];
    existing.push(block.content);
    pageMap.set(pageNum, existing);
  }

  const pages: FXDAPage[] = Array.from(pageMap.entries()).map(
    ([pageNumber, contents]) => ({
      pageNumber,
      width: 612, // US Letter in points
      height: 792,
      content: contents.join('\n\n'),
    }),
  );

  const bookmarks = blocks
    .filter((b) => b.bookmark)
    .map((b) => b.bookmark as string);

  const template: FXDATemplate = {
    version: '1.0',
    documentId: crypto.randomUUID(),
    documentName: documentName ?? 'Untitled Document',
    description: '',
    category: workflow?.category ?? 'General',
    pages,
    fields: fields ?? [],
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'Compose',
      templateType: workflow ? 'workflow-attached' : 'standalone',
      version: 1,
    },
    workflowPresetId: workflow?.id,
    tags: bookmarks.length > 0 ? ['has-bookmarks', ...bookmarks] : [],
  };

  return template;
}

// --- HTML builder ---

function blocksToHtml(blocks: Block[]): string {
  const blockMarkup = blocks
    .map((block) => {
      const bookmarkAttr = block.bookmark
        ? ` id="${block.bookmark}"`
        : '';
      return `<div${bookmarkAttr} class="block">${block.content}</div>`;
    })
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Compose Export</title>
  <style>
    body {
      font-family: Inter, system-ui, sans-serif;
      max-width: 794px;
      margin: 0 auto;
      padding: 96px 80px;
      color: #0f172a;
      line-height: 1.6;
    }
    .block {
      margin-bottom: 1rem;
    }
    .export-notice {
      margin-top: 3rem;
      padding: 0.75rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #64748b;
    }
  </style>
</head>
<body>
    ${blockMarkup}
    <div class="export-notice">
      Exported from Compose.
    </div>
</body>
</html>`;
}

// --- Download helper ---

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// --- Component ---

export default function ExportButton({
  blocks,
  workflow,
  fields,
  documentName,
  onBeforeExport,
  onSaveAsTemplate,
}: ExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleExportPDF = useCallback(async () => {
    if (blocks.length === 0) return;
    if (onBeforeExport && !onBeforeExport()) return;
    setShowMenu(false);

    try {
      const html = blocksToHtml(blocks);
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent: html,
          documentName: documentName ?? 'compose-document',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error('PDF export failed:', err.error);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${documentName ?? 'compose-document'}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      console.error('PDF export failed');
    }
  }, [blocks, documentName, onBeforeExport]);

  const handleExportHTML = useCallback(() => {
    if (blocks.length === 0) return;
    if (onBeforeExport && !onBeforeExport()) return;
    downloadFile(blocksToHtml(blocks), 'compose-export.html', 'text/html');
    setShowMenu(false);
  }, [blocks, onBeforeExport]);

  const handleExportJSON = useCallback(() => {
    if (blocks.length === 0) return;
    if (onBeforeExport && !onBeforeExport()) return;
    const template = buildFXDATemplate(blocks, workflow, fields, documentName);
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, 'compose-template.json', 'application/json');
    setShowMenu(false);
  }, [blocks, workflow, fields, documentName, onBeforeExport]);

  const disabled = blocks.length === 0;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowMenu((prev) => !prev)}
        disabled={disabled}
        className={`h-9 flex items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-slate-100 text-slate-300'
            : 'text-slate-700 border border-slate-200 hover:bg-slate-50'
        }`}
      >
        <ExportIcon />
        Export
        <ChevronIcon />
      </button>

      {showMenu && !disabled && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md bg-white shadow-lg ring-1 ring-slate-200">
            <button
              onClick={handleExportJSON}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-900 hover:bg-slate-50 rounded-t-md"
            >
              <JsonIcon />
              <div>
                <div className="font-medium">Compose Template (.json)</div>
                <div className="text-xs text-slate-500">
                  For eSign &amp; Editor
                </div>
              </div>
            </button>
            <button
              onClick={handleExportPDF}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-900 hover:bg-slate-50 border-t border-slate-100"
            >
              <PdfIcon />
              <div>
                <div className="font-medium">PDF Document</div>
                <div className="text-xs text-slate-500">
                  Generated as PDF document
                </div>
              </div>
            </button>
            <button
              onClick={handleExportHTML}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-900 hover:bg-slate-50 border-t border-slate-100"
            >
              <HtmlIcon />
              <div>
                <div className="font-medium">HTML Preview</div>
                <div className="text-xs text-slate-500">
                  Quick preview for sharing
                </div>
              </div>
            </button>
            {onSaveAsTemplate && (
              <button
                onClick={() => { setShowMenu(false); onSaveAsTemplate(); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-900 hover:bg-slate-50 rounded-b-md border-t border-slate-100"
              >
                <TemplateIcon />
                <div>
                  <div className="font-medium">Save as Template</div>
                  <div className="text-xs text-slate-500">
                    Reuse this document as a template
                  </div>
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Icons ---

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function JsonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
      <path d="M4 6h2a2 2 0 0 1 2 2v1a2 2 0 0 0 2 2 2 2 0 0 0-2 2v1a2 2 0 0 1-2 2H4" />
      <path d="M20 6h-2a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 2 2 0 0 1 2 2v1a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function HtmlIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function TemplateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="3" x2="21" y1="9" y2="9" />
      <line x1="9" x2="9" y1="21" y2="9" />
    </svg>
  );
}
