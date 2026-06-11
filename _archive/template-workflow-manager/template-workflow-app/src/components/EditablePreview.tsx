'use client';

import { useState, useEffect } from 'react';
import { FXDATemplate, FXDAField } from '@/types/fxda';
import { Edit2, Save, Trash2, Plus } from 'lucide-react';

interface EditablePreviewProps {
  template: FXDATemplate;
  onUpdate: (template: FXDATemplate) => void;
  blocks?: Array<{ type: string; text: string }>;
  generationDone?: boolean;
}

export default function EditablePreview({ template, onUpdate, blocks, generationDone }: EditablePreviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<FXDATemplate>(template);
  const [localBlocks, setLocalBlocks] = useState<Array<{ type: string; text: string }>>(() => (blocks ? blocks : []));
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [aiRewritingIndex, setAiRewritingIndex] = useState<number | null>(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffOld, setDiffOld] = useState('');
  const [diffNew, setDiffNew] = useState('');
  const [diffIdx, setDiffIdx] = useState<number | null>(null);
  const [isApplyingDiff, setIsApplyingDiff] = useState(false);

  // Keep local blocks in sync when streaming updates arrive
  useEffect(() => {
    if (blocks && blocks.length) setLocalBlocks(blocks);
  }, [blocks]);

  const updateTemplateContent = (newContent: string) => {
    const updated = {
      ...localTemplate,
      pages: localTemplate.pages.map((page, idx) => 
        idx === 0 ? { ...page, content: newContent } : page
      )
    };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  const updateBlocksContent = (blocks: Array<{ type: string; text: string }>) => {
    const content = blocks.map(b => (b.type === 'title' ? `\n\n${b.text.toUpperCase()}\n\n` : `${b.text}\n\n`)).join('').trim();
    updateTemplateContent(content);
    setLocalBlocks(blocks);
  };

  // Per-block undo/history removed — simplified editing flow

  const moveBlockUp = (idx: number) => {
    if (idx <= 0) return;
    setLocalBlocks(prev => {
      const copy = [...prev];
      const item = copy.splice(idx, 1)[0];
      copy.splice(idx - 1, 0, item);
      updateBlocksContent(copy);
      return copy;
    });
  };

  const moveBlockDown = (idx: number) => {
    setLocalBlocks(prev => {
      if (idx >= prev.length - 1) return prev;
      const copy = [...prev];
      const item = copy.splice(idx, 1)[0];
      copy.splice(idx + 1, 0, item);
      updateBlocksContent(copy);
      return copy;
    });
  };

  const mergeWithNext = (idx: number) => {
    setLocalBlocks(prev => {
      if (idx >= prev.length - 1) return prev;
      const copy = [...prev];
      const current = copy[idx];
      const next = copy[idx + 1];
      const merged: { type: string; text: string } = {
        type: current.type === 'title' ? 'title' : current.type,
        text: `${current.text}\n\n${next.text}`,
      };
      // Replace current and remove next
      copy.splice(idx, 2, merged);
      updateBlocksContent(copy);
      return copy;
    });
  };

  const updateField = (fieldId: string, updates: Partial<FXDAField>) => {
    const updated = {
      ...localTemplate,
      fields: localTemplate.fields.map(f => 
        f.id === fieldId ? { ...f, ...updates } : f
      )
    };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  const deleteField = (fieldId: string) => {
    const updated = {
      ...localTemplate,
      fields: localTemplate.fields.filter(f => f.id !== fieldId)
    };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  const updateMetadata = (key: 'documentName' | 'description', value: string) => {
    const updated = { ...localTemplate, [key]: value };
    setLocalTemplate(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-6">
      {/* Metadata Editing */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">✏️ Template Metadata (Click to Edit)</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Template Name</label>
            <input
              type="text"
              value={localTemplate.documentName}
              onChange={(e) => updateMetadata('documentName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={localTemplate.description}
              onChange={(e) => updateMetadata('description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Document Content Editing */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Document Content</h3>
          <button
            onClick={() => setEditingContent(!editingContent)}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Edit2 className="h-4 w-4" />
            {editingContent ? 'Preview' : 'Edit Content'}
          </button>
        </div>

        {editingContent ? (
          <textarea
            value={localTemplate.pages[0]?.content || ''}
            onChange={(e) => updateTemplateContent(e.target.value)}
            rows={20}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="bg-gray-50 p-6 rounded-lg">
            {/* If blocks are provided, render them as separate editable blocks */}
            {localBlocks && localBlocks.length > 0 ? (
              <div className="space-y-3">
                {localBlocks.map((b, idx) => (
                  <div key={idx} className="p-3 bg-white border rounded">
                    {editingBlock === idx ? (
                      <div>
                        <textarea
                          value={localBlocks[idx].text}
                          onChange={(e) => {
                            const copy = [...localBlocks];
                            copy[idx] = { ...copy[idx], text: e.target.value };
                            setLocalBlocks(copy);
                          }}
                          rows={4}
                          className="w-full px-2 py-2 border rounded text-sm"
                        />
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={() => {
                              const copy = [...localBlocks];
                              updateBlocksContent(copy);
                              setEditingBlock(null);
                            }}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                          >Save</button>
                          <button onClick={() => setEditingBlock(null)} className="px-3 py-1 bg-gray-200 rounded text-sm">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="prose-sm">
                          {b.type === 'title' ? <h3 className="font-semibold">{b.text}</h3> : <p>{b.text}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => {
                              if (generationDone) setEditingBlock(idx);
                              else alert('Editing is available after generation completes');
                            }}
                            className="text-xs text-blue-600"
                          >Edit</button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                if (!generationDone) return alert('AI rewrite available after generation completes');
                                if (aiRewritingIndex !== null) return; // already rewriting
                                try {
                                  setAiRewritingIndex(idx);
                                  const blockText = localBlocks[idx].text;
                                  const res = await fetch('/api/ai/rewrite-block', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: blockText }),
                                  });
                                  const json = await res.json();
                                  if (json?.text) {
                                    // Show diff modal for confirmation before applying
                                    setDiffOld(blockText);
                                    setDiffNew(json.text);
                                    setDiffIdx(idx);
                                    setDiffModalOpen(true);
                                  } else {
                                    alert('AI rewrite returned no content');
                                  }
                                } catch (err) {
                                  console.error('AI rewrite failed', err);
                                  alert('AI rewrite failed');
                                } finally {
                                  setAiRewritingIndex(null);
                                }
                              }}
                              className="text-xs text-gray-600"
                            >{aiRewritingIndex === idx ? 'Rewriting...' : 'AI Rewrite'}</button>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => moveBlockUp(idx)}
                                  className="text-xs px-2 py-1 bg-gray-100 rounded"
                                  title="Move up"
                                >↑</button>
                                <button
                                  onClick={() => moveBlockDown(idx)}
                                  className="text-xs px-2 py-1 bg-gray-100 rounded"
                                  title="Move down"
                                >↓</button>
                                <button
                                  onClick={() => mergeWithNext(idx)}
                                  className="text-xs px-2 py-1 bg-gray-100 rounded"
                                  title="Merge with next"
                                >Merge</button>
                              </div>

                              
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm">{localTemplate.pages[0]?.content}</pre>
            )}
          </div>
        )}
      </div>

      {/* Suggested labels removed to simplify UI */}

      {/* Form Fields Editing */}
      {localTemplate.fields.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Form Fields ({localTemplate.fields.length})</h3>
          
          <div className="space-y-3">
            {localTemplate.fields.map((field) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                {editingField === field.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Field Name</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateField(field.id, { name: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, { type: e.target.value as any })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="text">Text</option>
                          <option value="signature">Signature</option>
                          <option value="date">Date</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">X</label>
                        <input
                          type="number"
                          value={field.x}
                          onChange={(e) => updateField(field.id, { x: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Y</label>
                        <input
                          type="number"
                          value={field.y}
                          onChange={(e) => updateField(field.id, { y: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Width</label>
                        <input
                          type="number"
                          value={field.width}
                          onChange={(e) => updateField(field.id, { width: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Height</label>
                        <input
                          type="number"
                          value={field.height}
                          onChange={(e) => updateField(field.id, { height: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        Required
                      </label>
                      {field.party && (
                        <span className="text-xs text-gray-600 ml-2">Party {field.party}</span>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setEditingField(null)}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </button>
                      <button
                        onClick={() => {
                          deleteField(field.id);
                          setEditingField(null);
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setEditingField(field.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{field.type}</span>
                        <span className="font-medium">{field.name}</span>
                        {field.required && <span className="text-xs text-red-600">*Required</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>({field.x}, {field.y})</span>
                        <Edit2 className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff Confirmation Modal */}
      {diffModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-3xl bg-white rounded-lg shadow-lg p-6 m-4">
          <h3 className="text-lg font-semibold mb-3">Confirm AI Rewrite</h3>
          <p className="text-sm text-gray-600 mb-4">Review the change and confirm to apply.</p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2">Original</h4>
              <div className="p-3 border rounded h-48 overflow-auto whitespace-pre-wrap text-sm bg-gray-50">{diffOld}</div>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2">AI Rewrite</h4>
              <div className="p-3 border rounded h-48 overflow-auto whitespace-pre-wrap text-sm bg-white">{diffNew}</div>
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
              className="px-4 py-2 bg-gray-100 rounded"
            >Cancel</button>
            <button
              onClick={() => {
                if (diffIdx === null) return;
                setIsApplyingDiff(true);
                const copy = [...localBlocks];
                copy[diffIdx] = { ...copy[diffIdx], text: diffNew };
                updateBlocksContent(copy);
                setIsApplyingDiff(false);
                setDiffModalOpen(false);
                setDiffOld('');
                setDiffNew('');
                setDiffIdx(null);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >{isApplyingDiff ? 'Applying...' : 'Apply Rewrite'}</button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
