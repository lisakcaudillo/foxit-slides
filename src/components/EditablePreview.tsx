'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FXDATemplate, FXDAField, ESignFieldType } from '@/types/fxda';
import {
  ChevronUp,
  ChevronDown,
  Sparkles,
  Trash2,
  Plus,
  Type,
  PenTool,
  Calendar,
  CheckSquare,
  ChevronDownSquare,
  GripVertical,
  X,
} from 'lucide-react';

// ---------- constants ----------

const PARTY_COLORS: Record<number, { border: string; bg: string; text: string; label: string }> = {
  1: { border: 'border-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', label: 'Party 1' },
  2: { border: 'border-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Party 2' },
  3: { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Party 3' },
  4: { border: 'border-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', label: 'Party 4' },
};

const FIELD_TYPE_OPTIONS: ESignFieldType[] = [
  'text',
  'textbox',
  'signature',
  'initial',
  'date',
  'checkbox',
  'radiobutton',
  'dropdown',
  'attachment',
  'image',
];

/** PDF points → preview pixel scale. PDF page is 612pt wide, preview is 794px. */
const PT_TO_PX = 794 / 612;

// ---------- helpers ----------

type DetectedBlockType = 'heading' | 'clause' | 'definition' | 'paragraph';

interface ParsedBlock {
  type: DetectedBlockType;
  text: string;
  clauseNumber?: string;
  term?: string;
}

function detectBlockType(text: string): ParsedBlock {
  const trimmed = text.trim();
  if (!trimmed) return { type: 'paragraph', text: trimmed };

  // ALL CAPS heading (short, no period at end, mainly uppercase letters)
  const uppercaseRatio = (trimmed.replace(/[^A-Z]/g, '').length) / Math.max(trimmed.replace(/\s/g, '').length, 1);
  if (uppercaseRatio > 0.7 && trimmed.length < 120 && !trimmed.endsWith('.')) {
    return { type: 'heading', text: trimmed };
  }

  // Numbered clause: starts with digit(s) followed by . or )
  const clauseMatch = trimmed.match(/^(\d+(?:\.\d+)*[.)]\s*)/);
  if (clauseMatch) {
    return { type: 'clause', text: trimmed, clauseNumber: clauseMatch[1].trim() };
  }

  // Definition: contains "means" or a quoted term at the start
  const defMatch = trimmed.match(/^"([^"]+)"\s+means\b/i) || trimmed.match(/^"([^"]+)"/);
  if (defMatch) {
    return { type: 'definition', text: trimmed, term: defMatch[1] };
  }

  return { type: 'paragraph', text: trimmed };
}

function splitContentToBlocks(content: string): ParsedBlock[] {
  if (!content) return [];
  return content
    .split(/\n\n+/)
    .map((chunk) => detectBlockType(chunk))
    .filter((b) => b.text.length > 0);
}

function fieldTypeIcon(type: ESignFieldType) {
  switch (type) {
    case 'signature':
    case 'initial':
      return <PenTool className="h-3 w-3" />;
    case 'date':
      return <Calendar className="h-3 w-3" />;
    case 'checkbox':
    case 'radiobutton':
      return <CheckSquare className="h-3 w-3" />;
    case 'dropdown':
      return <ChevronDownSquare className="h-3 w-3" />;
    default:
      return <Type className="h-3 w-3" />;
  }
}

function partyStyle(party?: number) {
  if (party && PARTY_COLORS[party]) return PARTY_COLORS[party];
  return { border: 'border-slate-400', bg: 'bg-slate-50', text: 'text-slate-600', label: 'Unassigned' };
}

// ---------- sub-components ----------

interface BlockRendererProps {
  block: ParsedBlock;
  index: number;
  isEditing: boolean;
  editText: string;
  onStartEdit: () => void;
  onChangeText: (text: string) => void;
  onFinishEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAiRewrite: () => void;
  isFirst: boolean;
  isLast: boolean;
  aiRewriting: boolean;
  generationDone: boolean;
}

function BlockRenderer({
  block,
  index,
  isEditing,
  editText,
  onStartEdit,
  onChangeText,
  onFinishEdit,
  onMoveUp,
  onMoveDown,
  onAiRewrite,
  isFirst,
  isLast,
  aiRewriting,
  generationDone,
}: BlockRendererProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="group relative">
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => {
            onChangeText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={onFinishEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onFinishEdit();
          }}
          className="w-full resize-none rounded border border-violet-300 bg-violet-50/30 px-2 py-1 text-sm leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>
    );
  }

  // Render based on detected type
  const hoverControls = (
    <div className="absolute -left-10 top-0 hidden flex-col items-center gap-0.5 group-hover:flex">
      <button
        onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
        disabled={isFirst}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
        title="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <GripVertical className="h-3 w-3 text-slate-300" />
      <button
        onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
        disabled={isLast}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
        title="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const aiButton = generationDone ? (
    <button
      onClick={(e) => { e.stopPropagation(); onAiRewrite(); }}
      disabled={aiRewriting}
      className="absolute -right-9 top-0 hidden rounded p-0.5 text-violet-400 hover:bg-violet-50 hover:text-violet-600 group-hover:block disabled:opacity-50"
      title="AI Rewrite"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </button>
  ) : null;

  const clickHandler = () => {
    if (generationDone) onStartEdit();
  };

  const wrapperClass = 'group relative cursor-pointer rounded px-2 py-0.5 hover:bg-slate-50 transition-colors';

  switch (block.type) {
    case 'heading':
      return (
        <div className={wrapperClass} onClick={clickHandler}>
          {hoverControls}
          <h3 className="mt-6 mb-2 text-lg font-semibold text-slate-900">{block.text}</h3>
          {aiButton}
        </div>
      );
    case 'clause': {
      const numberEnd = block.clauseNumber ? block.text.indexOf(block.clauseNumber) + block.clauseNumber.length : 0;
      const rest = block.text.slice(numberEnd).trim();
      return (
        <div className={wrapperClass} onClick={clickHandler}>
          {hoverControls}
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-bold">{block.clauseNumber}</span>{' '}
            {rest}
          </p>
          {aiButton}
        </div>
      );
    }
    case 'definition': {
      const termEnd = block.term ? block.text.indexOf(block.term) + block.term.length + 1 : 0;
      // Render the quoted term in italic
      return (
        <div className={wrapperClass} onClick={clickHandler}>
          {hoverControls}
          <p className="text-sm leading-relaxed text-slate-700">
            <em>&ldquo;{block.term}&rdquo;</em>
            {block.text.slice(termEnd)}
          </p>
          {aiButton}
        </div>
      );
    }
    default:
      return (
        <div className={wrapperClass} onClick={clickHandler}>
          {hoverControls}
          <p className="text-sm leading-relaxed text-slate-700">{block.text}</p>
          {aiButton}
        </div>
      );
  }
}

// ---------- Field overlay ----------

interface FieldOverlayProps {
  field: FXDAField;
  onEdit: (field: FXDAField) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<FXDAField>) => void;
  isEditing: boolean;
}

function FieldOverlay({ field, onEdit, onDelete, onUpdate, isEditing }: FieldOverlayProps) {
  const style = partyStyle(field.party);

  const left = field.x * PT_TO_PX;
  const top = field.y * PT_TO_PX;
  const width = field.width * PT_TO_PX;
  const height = field.height * PT_TO_PX;

  if (isEditing) {
    return (
      <div
        className={`absolute z-20 rounded border-2 ${style.border} bg-white shadow-lg`}
        style={{ left, top, minWidth: 220 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2 p-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-slate-600">Name</label>
            <input
              type="text"
              value={field.name}
              onChange={(e) => onUpdate(field.id, { name: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Type</label>
              <select
                value={field.type}
                onChange={(e) => onUpdate(field.id, { type: e.target.value as ESignFieldType })}
                className="w-full rounded border border-slate-300 px-1 py-1 text-xs focus:border-violet-400 focus:outline-none"
              >
                {FIELD_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Party</label>
              <select
                value={field.party ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdate(field.id, { party: v === 0 ? undefined : v });
                }}
                className="w-full rounded border border-slate-300 px-1 py-1 text-xs focus:border-violet-400 focus:outline-none"
              >
                <option value={0}>None</option>
                <option value={1}>Party 1</option>
                <option value={2}>Party 2</option>
                <option value={3}>Party 3</option>
                <option value={4}>Party 4</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onUpdate(field.id, { required: e.target.checked })}
              className="rounded"
            />
            Required
          </label>
          <div className="flex justify-between pt-1">
            <button
              onClick={() => onDelete(field.id)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
            <button
              onClick={() => onEdit(field)}
              className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute z-10 flex cursor-pointer items-center gap-1 rounded border-2 ${style.border} ${style.bg} px-1.5 py-0.5 text-xs transition-shadow hover:shadow-md`}
      style={{ left, top, width: Math.max(width, 60), height: Math.max(height, 22) }}
      onClick={(e) => {
        e.stopPropagation();
        onEdit(field);
      }}
      title={`${field.name} (${field.type})`}
    >
      <span className={style.text}>{fieldTypeIcon(field.type)}</span>
      <span className={`truncate font-medium ${style.text}`}>{field.name}</span>
      {field.required && <span className="text-rose-500">*</span>}
    </div>
  );
}

// ---------- main component ----------

interface EditablePreviewProps {
  template: FXDATemplate;
  onUpdate: (template: FXDATemplate) => void;
  blocks?: Array<{ type: string; text: string }>;
  generationDone?: boolean;
}

export default function EditablePreview({ template, onUpdate, blocks, generationDone }: EditablePreviewProps) {
  const [localTemplate, setLocalTemplate] = useState<FXDATemplate>(template);
  const [parsedBlocks, setParsedBlocks] = useState<ParsedBlock[]>([]);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingBlockText, setEditingBlockText] = useState('');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [aiRewritingIndex, setAiRewritingIndex] = useState<number | null>(null);

  // Diff modal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffOld, setDiffOld] = useState('');
  const [diffNew, setDiffNew] = useState('');
  const [diffIdx, setDiffIdx] = useState<number | null>(null);
  const [isApplyingDiff, setIsApplyingDiff] = useState(false);

  // Sync from props
  useEffect(() => {
    setLocalTemplate(template);
  }, [template]);

  // Parse blocks from props or content
  useEffect(() => {
    if (blocks && blocks.length > 0) {
      setParsedBlocks(blocks.map((b) => detectBlockType(b.text)));
    } else {
      const content = localTemplate.pages[0]?.content ?? '';
      setParsedBlocks(splitContentToBlocks(content));
    }
  }, [blocks, localTemplate.pages]);

  // ---------- content helpers ----------

  const commitBlocks = useCallback(
    (updated: ParsedBlock[]) => {
      const content = updated
        .map((b) => (b.type === 'heading' ? `\n\n${b.text}\n\n` : `${b.text}\n\n`))
        .join('')
        .trim();
      const newTemplate: FXDATemplate = {
        ...localTemplate,
        pages: localTemplate.pages.map((page, idx) =>
          idx === 0 ? { ...page, content } : page,
        ),
      };
      setLocalTemplate(newTemplate);
      setParsedBlocks(updated);
      onUpdate(newTemplate);
    },
    [localTemplate, onUpdate],
  );

  const updateMetadata = (key: 'documentName' | 'description', value: string) => {
    const updated: FXDATemplate = { ...localTemplate, [key]: value };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  // ---------- block operations ----------

  const moveBlockUp = (idx: number) => {
    if (idx <= 0) return;
    const copy = [...parsedBlocks];
    const item = copy.splice(idx, 1)[0];
    copy.splice(idx - 1, 0, item);
    commitBlocks(copy);
  };

  const moveBlockDown = (idx: number) => {
    if (idx >= parsedBlocks.length - 1) return;
    const copy = [...parsedBlocks];
    const item = copy.splice(idx, 1)[0];
    copy.splice(idx + 1, 0, item);
    commitBlocks(copy);
  };

  const startEditBlock = (idx: number) => {
    setEditingBlockIndex(idx);
    setEditingBlockText(parsedBlocks[idx].text);
  };

  const finishEditBlock = () => {
    if (editingBlockIndex === null) return;
    const copy = [...parsedBlocks];
    copy[editingBlockIndex] = detectBlockType(editingBlockText);
    commitBlocks(copy);
    setEditingBlockIndex(null);
    setEditingBlockText('');
  };

  const aiRewriteBlock = async (idx: number) => {
    if (aiRewritingIndex !== null) return;
    try {
      setAiRewritingIndex(idx);
      const blockText = parsedBlocks[idx].text;
      const res = await fetch('/api/ai/rewrite-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: blockText }),
      });
      const json: unknown = await res.json();
      const parsed = json as Record<string, unknown>;
      if (typeof parsed?.text === 'string' && parsed.text) {
        setDiffOld(blockText);
        setDiffNew(parsed.text);
        setDiffIdx(idx);
        setDiffModalOpen(true);
      }
    } catch (err) {
      console.error('AI rewrite failed', err);
    } finally {
      setAiRewritingIndex(null);
    }
  };

  // ---------- field operations ----------

  const updateField = (fieldId: string, updates: Partial<FXDAField>) => {
    const updated: FXDATemplate = {
      ...localTemplate,
      fields: localTemplate.fields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f,
      ),
    };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  const deleteField = (fieldId: string) => {
    const updated: FXDATemplate = {
      ...localTemplate,
      fields: localTemplate.fields.filter((f) => f.id !== fieldId),
    };
    setLocalTemplate(updated);
    onUpdate(updated);
    setEditingFieldId(null);
  };

  const addField = () => {
    const newField: FXDAField = {
      id: `field_${Date.now()}`,
      type: 'text',
      name: 'New Field',
      x: 72,
      y: 300,
      width: 150,
      height: 24,
      page: 1,
      required: false,
    };
    const updated: FXDATemplate = {
      ...localTemplate,
      fields: [...localTemplate.fields, newField],
    };
    setLocalTemplate(updated);
    onUpdate(updated);
    setEditingFieldId(newField.id);
  };

  const toggleFieldEdit = (field: FXDAField) => {
    setEditingFieldId((prev) => (prev === field.id ? null : field.id));
  };

  // ---------- render ----------

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header: editable name + description */}
      <div className="w-full max-w-[794px]">
        <input
          type="text"
          value={localTemplate.documentName}
          onChange={(e) => updateMetadata('documentName', e.target.value)}
          className="w-full border-0 bg-transparent text-2xl font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
          placeholder="Document name"
        />
        <input
          type="text"
          value={localTemplate.description}
          onChange={(e) => updateMetadata('description', e.target.value)}
          className="mt-1 w-full border-0 bg-transparent text-sm text-gray-500 outline-none placeholder:text-slate-300 focus:ring-0"
          placeholder="Add a description..."
        />
      </div>

      {/* A4 page card */}
      <div
        className="relative w-full max-w-[794px] overflow-y-auto rounded-lg bg-white px-20 py-24 shadow-md"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData('application/json');
          if (!data) return;
          try {
            const { field } = JSON.parse(data) as { fieldId: string; field: FXDAField };
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            // Convert pixel position to PDF points (794px canvas = 612pt PDF width)
            const ptX = Math.max(0, Math.round((x / 794) * 612));
            const ptY = Math.max(0, Math.round((y / rect.height) * 792));
            const updated: FXDATemplate = {
              ...localTemplate,
              fields: localTemplate.fields.map((f) =>
                f.id === field.id ? { ...f, x: ptX, y: ptY } : f,
              ),
            };
            setLocalTemplate(updated);
            onUpdate(updated);
          } catch { /* ignore invalid drop data */ }
        }}
      >
        {/* Content blocks */}
        <div className="relative pl-10 pr-10">
          {parsedBlocks.length > 0 ? (
            parsedBlocks.map((block, idx) => (
              <BlockRenderer
                key={idx}
                block={block}
                index={idx}
                isEditing={editingBlockIndex === idx}
                editText={editingBlockText}
                onStartEdit={() => startEditBlock(idx)}
                onChangeText={setEditingBlockText}
                onFinishEdit={finishEditBlock}
                onMoveUp={() => moveBlockUp(idx)}
                onMoveDown={() => moveBlockDown(idx)}
                onAiRewrite={() => { void aiRewriteBlock(idx); }}
                isFirst={idx === 0}
                isLast={idx === parsedBlocks.length - 1}
                aiRewriting={aiRewritingIndex === idx}
                generationDone={generationDone ?? false}
              />
            ))
          ) : (
            <p className="text-sm italic text-slate-400">No content yet.</p>
          )}
        </div>

        {/* Field overlays — positioned on the page */}
        {localTemplate.fields
          .filter((f) => f.page === 1)
          .map((field) => (
            <FieldOverlay
              key={field.id}
              field={field}
              isEditing={editingFieldId === field.id}
              onEdit={toggleFieldEdit}
              onDelete={deleteField}
              onUpdate={updateField}
            />
          ))}

        {/* Add field button — bottom-right of page */}
        <button
          onClick={addField}
          className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add Field
        </button>
      </div>

      {/* Diff Confirmation Modal */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="m-4 w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Confirm AI Rewrite</h3>
              <button
                onClick={() => {
                  setDiffModalOpen(false);
                  setDiffOld('');
                  setDiffNew('');
                  setDiffIdx(null);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">Review the change and confirm to apply.</p>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-700">Original</h4>
                <div className="h-48 overflow-auto whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm">
                  {diffOld}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-700">AI Rewrite</h4>
                <div className="h-48 overflow-auto whitespace-pre-wrap rounded border bg-white p-3 text-sm">
                  {diffNew}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDiffModalOpen(false);
                  setDiffOld('');
                  setDiffNew('');
                  setDiffIdx(null);
                }}
                className="rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (diffIdx === null) return;
                  setIsApplyingDiff(true);
                  const copy = [...parsedBlocks];
                  copy[diffIdx] = detectBlockType(diffNew);
                  commitBlocks(copy);
                  setIsApplyingDiff(false);
                  setDiffModalOpen(false);
                  setDiffOld('');
                  setDiffNew('');
                  setDiffIdx(null);
                }}
                className="rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700"
              >
                {isApplyingDiff ? 'Applying...' : 'Apply Rewrite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
