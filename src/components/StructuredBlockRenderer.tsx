'use client';

import { useMemo, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import type { StructuredGenerationOutput, GeneratedBlock } from '@/types/generation';
import { getBlockToken, LAYOUT_HINT_STYLES, VISUAL_HINT_STYLES } from '@/lib/block-tokens';
import { mapDocumentLayouts } from '@/lib/layout-mapper';
import type { LayoutHint, VisualHint } from '@/lib/block-tokens';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockEdit {
  sectionIndex: number;
  blockIndex: number;
  content: string | string[];
}

interface DocumentFormat {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
}

interface StructuredBlockRendererProps {
  output: StructuredGenerationOutput;
  className?: string;
  /** Enable block-level editing (AC9). When true, blocks are contentEditable. */
  editable?: boolean;
  /** Called when a block's content is edited. Only fires when editable=true. */
  onBlockEdit?: (edit: BlockEdit) => void;
  /** Called when the document title is edited. */
  onTitleEdit?: (title: string) => void;
  /** Document format dimensions. Defaults to A4 (794x1123, 80px horizontal / 96px vertical padding). */
  documentFormat?: DocumentFormat;
}

/**
 * Renders v2 structured generation output using deterministic layout mapping
 * and design-token-driven block styling. Supports block-level editing (AC9)
 * via contentEditable — no third-party rich text editors.
 */
export default function StructuredBlockRenderer({
  output,
  className,
  editable = false,
  onBlockEdit,
  onTitleEdit,
  documentFormat,
}: StructuredBlockRendererProps) {
  const format = documentFormat ?? { width: 794, height: 1123, paddingX: 80, paddingY: 96 };
  const mappedSections = useMemo(
    () => mapDocumentLayouts(output.sections),
    [output.sections],
  );

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLHeadingElement>) => {
      if (!editable || !onTitleEdit) return;
      const newTitle = e.currentTarget.textContent ?? '';
      if (newTitle !== output.documentTitle) {
        onTitleEdit(newTitle);
      }
    },
    [editable, onTitleEdit, output.documentTitle],
  );

  return (
    <div className={`mx-auto ${className ?? ''}`} style={{ maxWidth: format.width }}>
      {/* Document title */}
      <h1
        className="text-3xl font-semibold text-slate-900 mb-6 outline-none"
        style={{ paddingLeft: format.paddingX, paddingRight: format.paddingX, paddingTop: format.paddingY }}
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={handleTitleBlur}
      >
        {output.documentTitle}
      </h1>

      {/* Sections */}
      {mappedSections.map((sectionResult, sectionIdx) => (
        <section key={sectionIdx} className="mb-8" style={{ paddingLeft: format.paddingX, paddingRight: format.paddingX }}>
          {/* Section heading */}
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            {sectionResult.section.name}
          </h2>

          {/* Blocks */}
          {sectionResult.blocks.map((block, blockIdx) => (
            <EditableBlock
              key={`${sectionIdx}-${blockIdx}`}
              block={block}
              sectionIndex={sectionIdx}
              blockIndex={blockIdx}
              resolvedLayout={block.resolvedLayout}
              resolvedVisual={block.resolvedVisual}
              editable={editable}
              onBlockEdit={onBlockEdit}
              sectionName={sectionResult.section.name}
            />
          ))}
        </section>
      ))}

      {/* Bottom padding */}
      <div style={{ height: format.paddingY }} />
    </div>
  );
}

// ── Editable Block Component ───────────────────────────────────────────────

interface EditableBlockProps {
  block: GeneratedBlock & { resolvedLayout: LayoutHint; resolvedVisual: VisualHint };
  sectionIndex: number;
  blockIndex: number;
  resolvedLayout: string;
  resolvedVisual: string;
  editable: boolean;
  onBlockEdit?: (edit: BlockEdit) => void;
  sectionName: string;
}

function EditableBlock({
  block,
  sectionIndex,
  blockIndex,
  resolvedLayout,
  resolvedVisual,
  editable,
  onBlockEdit,
  sectionName,
}: EditableBlockProps) {
  const token = getBlockToken(block.blockType);
  const layoutClass = LAYOUT_HINT_STYLES[resolvedLayout as LayoutHint] ?? '';
  const visualClass = VISUAL_HINT_STYLES[resolvedVisual as VisualHint] ?? '';
  const blockRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    if (!editable || !onBlockEdit || !blockRef.current) return;

    const el = blockRef.current;
    let newContent: string | string[];

    // For bullet/list blocks, extract individual items
    if (block.blockType === 'bullets' || block.blockType === 'list') {
      const items = el.querySelectorAll('li');
      if (items.length > 0) {
        newContent = Array.from(items).map((li) => li.textContent ?? '');
      } else {
        newContent = el.textContent ?? '';
      }
    } else {
      newContent = el.textContent ?? '';
    }

    // Only fire if content actually changed
    const originalText = Array.isArray(block.content)
      ? block.content.join('\n')
      : block.content;
    const newText = Array.isArray(newContent)
      ? newContent.join('\n')
      : newContent;

    if (newText !== originalText) {
      onBlockEdit({ sectionIndex, blockIndex, content: newContent });
    }
  }, [editable, onBlockEdit, block.blockType, block.content, sectionIndex, blockIndex]);

  return (
    <div
      className={`mb-2 ${layoutClass} ${visualClass}`}
      data-block-type={block.blockType}
      data-section={sectionName}
    >
      <div
        ref={blockRef}
        className={`${token.bg} ${token.border} ${token.text} ${token.padding} ${token.fontWeight} ${token.fontSize} ${editable ? 'outline-none cursor-text hover:ring-1 hover:ring-violet-200 focus-within:ring-2 focus-within:ring-violet-400 rounded' : ''}`}
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={handleBlur}
      >
        {renderBlockContent(block.blockType, block.content)}
      </div>
    </div>
  );
}

// ── Block content renderers ────────────────────────────────────────────────

function renderBlockContent(
  blockType: string,
  content: string | string[],
): React.ReactNode {
  switch (blockType) {
    case 'hero':
      return <p>{typeof content === 'string' ? content : content[0]}</p>;

    case 'heading':
      return <span>{typeof content === 'string' ? content : content[0]}</span>;

    case 'paragraph':
    case 'clause':
    case 'definition':
    case 'summary':
      return <p>{typeof content === 'string' ? content : content.join(' ')}</p>;

    case 'bullets':
      if (Array.isArray(content)) {
        return (
          <ul className="list-disc pl-4 space-y-1">
            {content.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        );
      }
      return <p>{content}</p>;

    case 'list':
      if (Array.isArray(content)) {
        return (
          <ol className="list-decimal pl-4 space-y-1">
            {content.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        );
      }
      return <p>{content}</p>;

    case 'cta':
      return (
        <div className="text-center">
          <p>{typeof content === 'string' ? content : content[0]}</p>
        </div>
      );

    case 'signature-block':
      return (
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-slate-400 mb-1">Signature</p>
            <div className="w-48 border-b border-slate-400 mb-1" />
            <p className="text-xs text-slate-500">
              {typeof content === 'string' ? content : content[0]}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Date</p>
            <div className="w-32 border-b border-slate-400" />
          </div>
        </div>
      );

    case 'table':
      if (Array.isArray(content)) {
        // Parse rows: split each string by | or tab to get cells
        const rows = content.map((row) => {
          if (row.includes('|')) return row.split('|').map((c) => c.trim());
          if (row.includes('\t')) return row.split('\t').map((c) => c.trim());
          return [row];
        });
        const hasHeader = rows.length > 1;
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {hasHeader && (
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    {rows[0].map((cell, ci) => (
                      <th key={ci} className="px-4 py-2.5 text-left font-semibold text-slate-700">{cell}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {(hasHeader ? rows.slice(1) : rows).map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100 hover:bg-slate-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-slate-600">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return <p>{content}</p>;

    case 'divider': {
      const label = typeof content === 'string' ? content : (Array.isArray(content) ? content[0] : '');
      if (label && label.trim().length > 0) {
        return (
          <div className="relative py-4">
            <hr className="border-t border-slate-200" />
            <span className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-white px-3 text-xs text-slate-400 font-medium">
              {label}
            </span>
          </div>
        );
      }
      return (
        <div className="py-4">
          <hr className="border-t border-slate-200" />
        </div>
      );
    }

    case 'callout':
      return (
        <div className="bg-violet-50 border-l-4 border-violet-400 rounded-r-lg p-4 my-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 text-violet-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-slate-800">
              {typeof content === 'string' ? content : content.join(' ')}
            </p>
          </div>
        </div>
      );

    case 'stats': {
      const items = Array.isArray(content) ? content : [content];
      return (
        <div className="flex gap-4 my-2">
          {items.map((item, i) => {
            const text = typeof item === 'string' ? item : '';
            // Parse "number: label" or "number — label" format
            const colonMatch = text.match(/^([^:—]+)[:\u2014—]\s*(.+)$/);
            const statNumber = colonMatch ? colonMatch[1].trim() : text;
            const statLabel = colonMatch ? colonMatch[2].trim() : '';
            return (
              <div key={i} className="bg-slate-50 rounded-lg p-4 flex-1 text-center">
                <div className="text-3xl font-semibold text-slate-900">{statNumber}</div>
                {statLabel && <div className="text-sm text-slate-500 mt-1">{statLabel}</div>}
              </div>
            );
          })}
        </div>
      );
    }

    case 'cover': {
      const lines = Array.isArray(content) ? content : (typeof content === 'string' ? content.split('\n') : [content]);
      const title = lines[0] ?? '';
      const subtitle = lines.length > 1 ? lines[1] : '';
      return (
        <div className="bg-slate-50 rounded-xl p-8 mb-4 text-center">
          <div className="text-3xl font-bold text-slate-900">{title}</div>
          {subtitle && <div className="text-lg text-slate-500 mt-2">{subtitle}</div>}
          <div className="w-16 h-1 bg-violet-500 mx-auto mt-4 rounded-full" />
        </div>
      );
    }

    default:
      return <p>{typeof content === 'string' ? content : content.join(' ')}</p>;
  }
}
