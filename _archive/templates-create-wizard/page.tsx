'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { workflowPresets } from '@/data/workflowPresets';
import type { WorkflowPreset, SignParty } from '@/types';
import type { FXDATemplate, FXDAField, ESignFieldType } from '@/types/fxda';
import EditablePreview from '@/components/EditablePreview';
import { saveTemplate } from '@/lib/templateStorage';
import { extract } from '@/lib/atlas';
import { useToast } from '@/components/Toast';
import { runGenerationPipeline } from '@/lib/generation-pipeline';
import type { PipelineProgress } from '@/lib/generation-pipeline';
import {
  ArrowLeft,
  Sparkles,
  Upload,
  FileText,
  Wand2,
  CheckCircle,
  X,
  Trash2,
  Download,
  PenLine,
  Save,
  Loader2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Plus,
  GripVertical,
  Type,
  Minus,
  FileSignature,
  LayoutGrid,
  FileIcon,
  ChevronDown,
} from 'lucide-react';

type CreationMethod = 'ai' | 'upload' | 'scratch';
type Step = 'method' | 'generate' | 'edit' | 'configure' | 'preview';
type ConfigureTab = 'fields' | 'parties' | 'workflow';

const STEP_LIST: Step[] = ['method', 'generate', 'edit', 'configure', 'preview'];
const STEP_LABELS: Record<Step, string> = {
  method: 'Method',
  generate: 'Generate',
  edit: 'Edit',
  configure: 'Configure',
  preview: 'Preview',
};

const PARTY_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#f43f5e'];

const FIELD_TYPES: { type: ESignFieldType; label: string }[] = [
  { type: 'signature', label: 'Signature' },
  { type: 'initial', label: 'Initial' },
  { type: 'date', label: 'Date' },
  { type: 'text', label: 'Text' },
  { type: 'checkbox', label: 'Checkbox' },
];

function fieldColorForParty(partyIndex: number): string {
  const colors = ['bg-violet-100 text-violet-700 border-violet-300', 'bg-emerald-100 text-emerald-700 border-emerald-300', 'bg-amber-100 text-amber-700 border-amber-300', 'bg-rose-100 text-rose-700 border-rose-300'];
  return colors[partyIndex % colors.length];
}

export default function CreateTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<CreationMethod>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [showBlockReveal, setShowBlockReveal] = useState(false);
  const [revealedBlockCount, setRevealedBlockCount] = useState(0);

  // Text amount & page layout
  const [textAmount, setTextAmount] = useState<'concise' | 'balanced' | 'detailed'>('balanced');
  const [pageLayout, setPageLayout] = useState<'simple' | 'two-column' | 'title-body-signature' | 'multi-signature' | 'ai-decide' | 'blank'>('ai-decide');

  // Customization
  const [showCustomize, setShowCustomize] = useState(false);
  const [customOptions, setCustomOptions] = useState({ audience: '', tone: '', detail: '', jurisdiction: '' });

  // Clarifying questions
  const [clarifyQuestions, setClarifyQuestions] = useState<Array<{ question: string; type: string; options?: string[] }>>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});
  const [showClarify, setShowClarify] = useState(false);
  const [isClarifying, setIsClarifying] = useState(false);

  // Template
  const [fxdaTemplate, setFxdaTemplate] = useState<FXDATemplate | null>(null);

  // Configure state
  const [configureTab, setConfigureTab] = useState<ConfigureTab>('fields');
  const [parties, setParties] = useState<SignParty[]>([
    { name: 'Party A', email: '', role: 'Signer', color: PARTY_COLORS[0] },
    { name: 'Party B', email: '', role: 'Signer', color: PARTY_COLORS[1] },
  ]);
  const [selectedPartyIndex, setSelectedPartyIndex] = useState(0);
  const [pendingFieldType, setPendingFieldType] = useState<ESignFieldType | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowPreset | null>(null);

  // Add party form
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyEmail, setNewPartyEmail] = useState('');
  const [newPartyRole, setNewPartyRole] = useState<'Signer' | 'Approver' | 'Viewer'>('Signer');

  // Upload state
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { showToast } = useToast();

  // Save state
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Step 3 Edit state
  type EditViewMode = 'pages' | 'cards';
  const [editViewMode, setEditViewMode] = useState<EditViewMode>('pages');
  const [rewritingBlockIdx, setRewritingBlockIdx] = useState<number | null>(null);
  const [hoveredBlockIdx, setHoveredBlockIdx] = useState<number | null>(null);
  const [showAiDropdown, setShowAiDropdown] = useState(false);
  const [draggedBlockIdx, setDraggedBlockIdx] = useState<number | null>(null);
  const [dragOverBlockIdx, setDragOverBlockIdx] = useState<number | null>(null);
  const editCanvasRef = useRef<HTMLDivElement>(null);

  // Check URL params and skip method selection if method is provided
  useEffect(() => {
    const methodParam = searchParams.get('method') as CreationMethod | null;
    if (methodParam && ['ai', 'upload', 'scratch'].includes(methodParam)) {
      setMethod(methodParam);
      if (methodParam === 'upload') {
        // Trigger file picker on next tick so ref is mounted
        setTimeout(() => uploadInputRef.current?.click(), 0);
      } else if (methodParam === 'scratch') {
        const now = new Date().toISOString();
        setFxdaTemplate({
          version: '1.0',
          documentId: `scratch-${Date.now()}`,
          documentName: 'Untitled Template',
          description: '',
          category: 'General',
          pages: [{ pageNumber: 1, width: 794, height: 1123, content: '' }],
          fields: [],
          metadata: { createdAt: now, createdBy: 'user', templateType: 'scratch', version: 1 },
          tags: [],
        });
        setStep('edit');
      } else {
        setStep('generate');
      }
    }
  }, [searchParams]);

  const handleMethodSelect = (selectedMethod: CreationMethod) => {
    setMethod(selectedMethod);
    if (selectedMethod === 'upload') {
      uploadInputRef.current?.click();
      return;
    }
    if (selectedMethod === 'scratch') {
      const now = new Date().toISOString();
      setFxdaTemplate({
        version: '1.0',
        documentId: `scratch-${Date.now()}`,
        documentName: 'Untitled Template',
        description: '',
        category: 'General',
        pages: [{ pageNumber: 1, width: 794, height: 1123, content: '' }],
        fields: [],
        metadata: { createdAt: now, createdBy: 'user', templateType: 'scratch', version: 1 },
        tags: [],
      });
      setStep('edit');
      return;
    }
    setStep('generate');
  };

  const handleUploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const response = await extract(file);
      if (response.error || !response.data) {
        showToast(response.error ?? 'Failed to extract document', 'error');
        setIsUploading(false);
        return;
      }
      const blocks = response.data;
      const now = new Date().toISOString();
      const pageMap = new Map<number, string[]>();
      for (const block of blocks) {
        const pageNum = block.page ?? 1;
        if (!pageMap.has(pageNum)) pageMap.set(pageNum, []);
        pageMap.get(pageNum)!.push(block.content);
      }
      const pages = Array.from(pageMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([pageNumber, contents]) => ({
          pageNumber,
          width: 794,
          height: 1123,
          content: contents.join('\n\n'),
        }));
      if (pages.length === 0) {
        pages.push({ pageNumber: 1, width: 794, height: 1123, content: '' });
      }
      setFxdaTemplate({
        version: '1.0',
        documentId: `upload-${Date.now()}`,
        documentName: file.name.replace(/\.[^.]+$/, ''),
        description: '',
        category: 'General',
        pages,
        fields: [],
        metadata: { createdAt: now, createdBy: 'user', templateType: 'upload', version: 1 },
        tags: [],
      });
      setStep('edit');
      showToast('Document imported successfully', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      showToast(message, 'error');
    } finally {
      setIsUploading(false);
    }
  }, [showToast]);

  const handleGenerateClick = async () => {
    // Try to get clarifying questions first (unless already shown)
    if (!showClarify && !isClarifying) {
      setIsClarifying(true);
      try {
        const res = await fetch('/api/ai/clarify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: aiPrompt }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            setClarifyQuestions(data.questions);
            setShowClarify(true);
            setIsClarifying(false);
            return; // Wait for user to answer or skip
          }
        }
      } catch {
        // Clarify failed — proceed to generate directly
      }
      setIsClarifying(false);
    }

    // Proceed to generate via v2 pipeline
    void handleAIGenerate();
  };

  const handleAIGenerate = async (options?: { clarifiedOverride?: string; skipClarify?: boolean }) => {
    setIsGenerating(true);
    setGeneratingProgress(0);
    setGeneratingStatus('Analyzing your input...');

    // Build clarified prompt from clarify answers if available
    let clarifiedPrompt: string | undefined = options?.clarifiedOverride;
    if (!clarifiedPrompt && !options?.skipClarify && Object.keys(clarifyAnswers).length > 0) {
      const answerContext = clarifyQuestions
        .map((q, i) => clarifyAnswers[i] ? `${q.question} → ${clarifyAnswers[i]}` : '')
        .filter(Boolean)
        .join('. ');
      clarifiedPrompt = answerContext ? `${aiPrompt}. Context: ${answerContext}` : undefined;
    }

    try {
      const result = await runGenerationPipeline(
        {
          prompt: aiPrompt,
          clarifiedPrompt,
          textAmount,
          pageLayout,
          audience: customOptions.audience || undefined,
          tone: customOptions.tone || undefined,
          detail: customOptions.detail || undefined,
          jurisdiction: customOptions.jurisdiction || undefined,
        },
        (progress: PipelineProgress) => {
          setGeneratingStatus(progress.message);
          setGeneratingProgress(progress.percent);
        },
      );

      const fxdaData = result.template;
      setFxdaTemplate(fxdaData);

      // Auto-select suggested workflow
      if (fxdaData.workflowPresetId) {
        const suggested = workflowPresets.find((w) => w.id === fxdaData.workflowPresetId);
        if (suggested) setSelectedWorkflow(suggested);
      }

      // Block reveal animation
      await new Promise((resolve) => setTimeout(resolve, 400));
      setShowBlockReveal(true);
      setRevealedBlockCount(0);

      const totalBlocks = fxdaData.pages.reduce(
        (count, page) => count + page.content.split(/\n{2,}/).filter((p) => p.trim()).length,
        0,
      );
      const revealMax = Math.max(totalBlocks, 1);

      for (let i = 1; i <= revealMax; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        setRevealedBlockCount(i);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      setShowBlockReveal(false);
      setStep('edit');
    } catch (error) {
      console.error('Failed to generate template:', error);
      showToast('Failed to generate template. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
      setGeneratingStatus('');
      setGeneratingProgress(0);
    }
  };

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (!fxdaTemplate) return;
      setFxdaTemplate({
        ...fxdaTemplate,
        fields: fxdaTemplate.fields.filter((f) => f.id !== fieldId),
      });
    },
    [fxdaTemplate],
  );

  const handleAddParty = () => {
    if (!newPartyName.trim()) return;
    const nextColor = PARTY_COLORS[parties.length % PARTY_COLORS.length];
    setParties([...parties, { name: newPartyName, email: newPartyEmail, role: newPartyRole, color: nextColor }]);
    setNewPartyName('');
    setNewPartyEmail('');
    setNewPartyRole('Signer');
  };

  const handleDeleteParty = (index: number) => {
    setParties(parties.filter((_, i) => i !== index));
    if (selectedPartyIndex >= parties.length - 1) {
      setSelectedPartyIndex(Math.max(0, parties.length - 2));
    }
  };

  const handleSaveTemplate = () => {
    if (!fxdaTemplate) return;

    const templateToSave: FXDATemplate = {
      ...fxdaTemplate,
      workflowPresetId: selectedWorkflow ? selectedWorkflow.id : undefined,
    };

    saveTemplate(templateToSave);
    setSaveSuccess(true);
  };

  const handleDownloadJSON = () => {
    if (!fxdaTemplate) return;
    const dataStr = JSON.stringify(fxdaTemplate, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fxdaTemplate.documentId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Step 3 Edit helpers ---
  const getEditBlocks = useCallback((): string[] => {
    if (!fxdaTemplate) return [];
    return fxdaTemplate.pages.flatMap((page) =>
      page.content.split(/\n{2,}/).filter((p) => p.trim())
    );
  }, [fxdaTemplate]);

  const updateBlockContent = useCallback((blockIdx: number, newText: string) => {
    if (!fxdaTemplate) return;
    const updated = { ...fxdaTemplate };
    updated.pages = [...updated.pages];
    // Rebuild all blocks from all pages into a flat list, update the target, then rebuild pages
    const allBlocks: string[] = [];
    const pageBreaks: number[] = []; // index where each page starts
    for (const page of updated.pages) {
      pageBreaks.push(allBlocks.length);
      allBlocks.push(...page.content.split(/\n{2,}/).filter((p) => p.trim()));
    }
    allBlocks[blockIdx] = newText;
    // Rebuild pages
    for (let p = 0; p < updated.pages.length; p++) {
      const start = pageBreaks[p];
      const end = p + 1 < pageBreaks.length ? pageBreaks[p + 1] : allBlocks.length;
      updated.pages[p] = { ...updated.pages[p], content: allBlocks.slice(start, end).join('\n\n') };
    }
    setFxdaTemplate(updated);
  }, [fxdaTemplate]);

  const deleteBlock = useCallback((blockIdx: number) => {
    if (!fxdaTemplate) return;
    const blocks = getEditBlocks();
    blocks.splice(blockIdx, 1);
    // Put all blocks into page 0 for simplicity
    const updated = { ...fxdaTemplate };
    updated.pages = [{ ...updated.pages[0], content: blocks.join('\n\n') }];
    setFxdaTemplate(updated);
  }, [fxdaTemplate, getEditBlocks]);

  const addBlockBelow = useCallback((blockIdx: number) => {
    if (!fxdaTemplate) return;
    const blocks = getEditBlocks();
    blocks.splice(blockIdx + 1, 0, 'New paragraph — click to edit.');
    const updated = { ...fxdaTemplate };
    updated.pages = [{ ...updated.pages[0], content: blocks.join('\n\n') }];
    setFxdaTemplate(updated);
  }, [fxdaTemplate, getEditBlocks]);

  const moveBlock = useCallback((fromIdx: number, toIdx: number) => {
    if (!fxdaTemplate || fromIdx === toIdx) return;
    const blocks = getEditBlocks();
    const [moved] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, moved);
    const updated = { ...fxdaTemplate };
    updated.pages = [{ ...updated.pages[0], content: blocks.join('\n\n') }];
    setFxdaTemplate(updated);
  }, [fxdaTemplate, getEditBlocks]);

  const rewriteBlockAI = useCallback(async (blockIdx: number, instruction: string) => {
    if (!fxdaTemplate) return;
    const blocks = getEditBlocks();
    const blockContent = blocks[blockIdx];
    setRewritingBlockIdx(blockIdx);
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockContent, instructions: instruction, context: fxdaTemplate.documentName }),
      });
      if (!res.ok) throw new Error('Rewrite failed');
      const data = await res.json();
      if (data.rewritten) {
        updateBlockContent(blockIdx, data.rewritten);
        showToast('Block rewritten successfully', 'success');
      }
    } catch {
      showToast('AI rewrite failed. Please try again.', 'error');
    } finally {
      setRewritingBlockIdx(null);
    }
  }, [fxdaTemplate, getEditBlocks, updateBlockContent, showToast]);

  const execFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  const insertFieldPlaceholder = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.className = 'inline-block bg-violet-100 text-violet-700 border border-violet-300 rounded px-1 text-xs font-medium';
      span.contentEditable = 'false';
      span.textContent = '[Field Name]';
      range.deleteContents();
      range.insertNode(span);
      // Move cursor after the inserted span
      range.setStartAfter(span);
      range.setEndAfter(span);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const currentStepIndex = STEP_LIST.indexOf(step);
  const visibleSteps = searchParams.get('method')
    ? STEP_LIST.filter((s) => s !== 'method')
    : STEP_LIST;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden file input for upload path */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadFile(file);
          e.target.value = '';
        }}
      />

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Link>
          <h1 className="text-3xl font-semibold text-gray-900">Make a Template</h1>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center max-w-3xl mx-auto text-xs sm:text-sm">
            {visibleSteps.map((s, idx) => {
              const stepIdx = STEP_LIST.indexOf(s);
              const isCompleted = currentStepIndex > stepIdx;
              const isActive = step === s;
              return (
                <div key={s} className="flex items-center">
                  <div className="flex items-center">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isActive
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className="ml-2 font-medium hidden sm:inline">{STEP_LABELS[s]}</span>
                  </div>
                  {idx < visibleSteps.length - 1 && (
                    <div
                      className={`w-12 h-0.5 mx-4 ${
                        currentStepIndex > stepIdx ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 ${step === 'configure' ? 'max-w-7xl' : step === 'edit' ? 'max-w-5xl' : 'max-w-4xl'}`}>
        {/* Step 1: Method Selection */}
        {step === 'method' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">How would you like to create your template?</h2>
              <p className="text-gray-600">Choose the method that best suits your needs</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => handleMethodSelect('ai')}
                className="bg-white border-2 border-violet-200 rounded-lg p-6 hover:border-violet-500 transition-colors text-left group"
              >
                <div className="bg-violet-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-violet-200">
                  <Sparkles className="h-6 w-6 text-violet-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">AI-Assisted Generation</h3>
                <p className="text-sm text-gray-600">
                  Describe your template and let AI generate the structure and fields
                </p>
              </button>

              <button
                onClick={() => handleMethodSelect('upload')}
                disabled={isUploading}
                className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors text-left group disabled:opacity-50"
              >
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gray-200">
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-gray-600 animate-spin" />
                  ) : (
                    <Upload className="h-6 w-6 text-gray-600" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {isUploading ? 'Importing...' : 'Upload Document'}
                </h3>
                <p className="text-sm text-gray-600">
                  Upload an existing document and we&apos;ll recognize the fields
                </p>
              </button>

              <button
                onClick={() => handleMethodSelect('scratch')}
                className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors text-left group"
              >
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gray-200">
                  <FileText className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Start from Scratch</h3>
                <p className="text-sm text-gray-600">
                  Manually create your template with full control
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Generate */}
        {step === 'generate' && method === 'ai' && (
          <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Describe Your Template</h2>
              <p className="text-gray-600">Tell us what kind of template you need and we&apos;ll generate it for you</p>
            </div>

            {/* Amount of Text selector */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Amount of Text</h3>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'concise' as const, label: 'Concise', subtitle: 'Short and direct', lines: 3 },
                  { value: 'balanced' as const, label: 'Balanced', subtitle: 'Standard detail', lines: 5 },
                  { value: 'detailed' as const, label: 'Detailed', subtitle: 'Comprehensive', lines: 7 },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTextAmount(opt.value)}
                    className={`flex flex-col items-center rounded-lg p-3 transition-colors ${
                      textAmount === opt.value
                        ? 'bg-violet-50 border-2 border-violet-600'
                        : 'bg-gray-50 border-2 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <svg width="32" height="24" viewBox="0 0 32 24" className="mb-1.5">
                      {Array.from({ length: opt.lines }).map((_, i) => (
                        <rect
                          key={i}
                          x={opt.value === 'concise' ? 8 : opt.value === 'balanced' ? 4 : 2}
                          y={opt.value === 'concise' ? 3 + i * 6 : opt.value === 'balanced' ? 1 + i * 4.4 : i * 3.2 + 0.5}
                          width={opt.value === 'concise' ? 16 : opt.value === 'balanced' ? 24 : 28}
                          height="2"
                          rx="1"
                          fill={textAmount === opt.value ? '#7c3aed' : '#9ca3af'}
                        />
                      ))}
                    </svg>
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-xs text-gray-500">{opt.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Page Layout selector */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Choose a page layout</h3>
              <div className="grid grid-cols-6 gap-2">
                {([
                  { value: 'simple' as const, label: 'Simple' },
                  { value: 'two-column' as const, label: 'Two Column' },
                  { value: 'title-body-signature' as const, label: 'Title + Sig' },
                  { value: 'multi-signature' as const, label: 'Multi-Sig' },
                  { value: 'ai-decide' as const, label: 'AI Decide' },
                  { value: 'blank' as const, label: 'Blank' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPageLayout(opt.value)}
                    className={`flex flex-col items-center rounded-lg p-2 transition-colors ${
                      pageLayout === opt.value
                        ? 'bg-violet-50 border-2 border-violet-600'
                        : 'bg-gray-50 border-2 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-12 h-14 flex items-center justify-center mb-1">
                      {opt.value === 'simple' && (
                        <svg width="32" height="40" viewBox="0 0 32 40">
                          <rect x="2" y="2" width="28" height="36" rx="2" fill="none" stroke={pageLayout === 'simple' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                          <rect x="6" y="8" width="20" height="2" rx="1" fill={pageLayout === 'simple' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="14" width="20" height="2" rx="1" fill={pageLayout === 'simple' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="20" width="20" height="2" rx="1" fill={pageLayout === 'simple' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="26" width="14" height="2" rx="1" fill={pageLayout === 'simple' ? '#7c3aed' : '#9ca3af'} />
                        </svg>
                      )}
                      {opt.value === 'two-column' && (
                        <svg width="32" height="40" viewBox="0 0 32 40">
                          <rect x="2" y="2" width="13" height="36" rx="2" fill="none" stroke={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                          <rect x="17" y="2" width="13" height="36" rx="2" fill="none" stroke={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                          <rect x="4" y="8" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="4" y="12" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="4" y="16" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="19" y="8" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="19" y="12" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="19" y="16" width="9" height="1.5" rx="0.75" fill={pageLayout === 'two-column' ? '#7c3aed' : '#9ca3af'} />
                        </svg>
                      )}
                      {opt.value === 'title-body-signature' && (
                        <svg width="32" height="40" viewBox="0 0 32 40">
                          <rect x="2" y="2" width="28" height="36" rx="2" fill="none" stroke={pageLayout === 'title-body-signature' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                          <rect x="6" y="6" width="20" height="4" rx="1" fill={pageLayout === 'title-body-signature' ? '#c4b5fd' : '#d1d5db'} />
                          <rect x="6" y="14" width="20" height="1.5" rx="0.75" fill={pageLayout === 'title-body-signature' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="18" width="20" height="1.5" rx="0.75" fill={pageLayout === 'title-body-signature' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="22" width="14" height="1.5" rx="0.75" fill={pageLayout === 'title-body-signature' ? '#7c3aed' : '#9ca3af'} />
                          <line x1="6" y1="33" x2="18" y2="33" stroke={pageLayout === 'title-body-signature' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                        </svg>
                      )}
                      {opt.value === 'multi-signature' && (
                        <svg width="32" height="40" viewBox="0 0 32 40">
                          <rect x="2" y="2" width="28" height="36" rx="2" fill="none" stroke={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" />
                          <rect x="6" y="8" width="20" height="1.5" rx="0.75" fill={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="12" width="20" height="1.5" rx="0.75" fill={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="6" y="16" width="14" height="1.5" rx="0.75" fill={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} />
                          <rect x="4" y="26" width="10" height="6" rx="1" fill="none" stroke={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} strokeWidth="1" />
                          <rect x="18" y="26" width="10" height="6" rx="1" fill="none" stroke={pageLayout === 'multi-signature' ? '#7c3aed' : '#9ca3af'} strokeWidth="1" />
                        </svg>
                      )}
                      {opt.value === 'ai-decide' && (
                        <Sparkles className="h-6 w-6 text-violet-600" />
                      )}
                      {opt.value === 'blank' && (
                        <svg width="32" height="40" viewBox="0 0 32 40">
                          <rect x="2" y="2" width="28" height="36" rx="2" fill="none" stroke={pageLayout === 'blank' ? '#7c3aed' : '#9ca3af'} strokeWidth="1.5" strokeDasharray="4 2" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-medium text-center leading-tight">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Audience + Tone dropdowns */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
                <select
                  value={customOptions.audience}
                  onChange={(e) => setCustomOptions((prev) => ({ ...prev, audience: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
                >
                  <option value="">Select audience...</option>
                  <option value="General">General</option>
                  <option value="Business">Business</option>
                  <option value="Professional">Professional</option>
                  <option value="Legal">Legal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
                <select
                  value={customOptions.tone}
                  onChange={(e) => setCustomOptions((prev) => ({ ...prev, tone: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
                >
                  <option value="">Select tone...</option>
                  <option value="Neutral">Neutral</option>
                  <option value="Formal">Formal</option>
                  <option value="Instructional">Instructional</option>
                  <option value="Friendly">Friendly</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Description
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="E.g., 'Create a standard NDA for vendors with 2 parties signing sequentially, including confidentiality clauses and a 1-year term'"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <p className="mt-2 text-sm text-gray-500">
                AI will generate a complete document with form fields positioned on a canvas
              </p>

              {/* Example prompts */}
              <div className="flex flex-wrap gap-2 mt-3">
                {['Standard NDA for two parties', 'Employment offer letter', 'Vendor service agreement', 'Campaign brief for product launch', 'Brand guidelines document', 'Agency SOW with deliverables'].map((example) => (
                  <button
                    key={example}
                    onClick={() => setAiPrompt(example)}
                    className="rounded-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* Customization options */}
            <div>
              <button
                onClick={() => setShowCustomize(!showCustomize)}
                className="text-sm font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1"
              >
                {showCustomize ? '− Hide options' : '+ Customize output'}
              </button>
              {showCustomize && (
                <div className="mt-3 space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  {[
                    { label: 'Audience', key: 'audience' as const, options: ['General', 'Business', 'Professional', 'Legal'] },
                    { label: 'Tone', key: 'tone' as const, options: ['Neutral', 'Formal', 'Instructional', 'Friendly'] },
                    { label: 'Detail', key: 'detail' as const, options: ['Minimal', 'Concise', 'Detailed', 'Extensive'] },
                    { label: 'Jurisdiction', key: 'jurisdiction' as const, options: ['California', 'New York', 'Delaware', 'UK', 'EU'] },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{row.label}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {row.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setCustomOptions((prev) => ({ ...prev, [row.key]: prev[row.key] === opt ? '' : opt }))}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                              customOptions[row.key] === opt
                                ? 'bg-violet-100 border-violet-600 text-violet-700'
                                : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                        {row.key === 'jurisdiction' && (
                          <input
                            type="text"
                            placeholder="Country, State..."
                            value={customOptions.jurisdiction.match(/^(California|New York|Delaware|UK|EU)$/) ? '' : customOptions.jurisdiction}
                            onChange={(e) => setCustomOptions((prev) => ({ ...prev, jurisdiction: e.target.value }))}
                            className="rounded-full px-2.5 py-1 text-xs border border-gray-200 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 w-32"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Clarifying questions modal */}
            {showClarify && clarifyQuestions.length > 0 && (
              <div className="fixed inset-0 z-50 flex justify-center" onClick={() => { setShowClarify(false); }}>
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
                <div
                  className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-auto mt-24 p-6 h-fit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                    <h3 className="text-lg font-semibold text-gray-900">A few questions to improve your document</h3>
                  </div>
                  <div className="space-y-4">
                    {clarifyQuestions.map((q, idx) => (
                      <div key={idx}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{q.question}</label>
                        {q.type === 'select' && q.options ? (
                          <select
                            value={clarifyAnswers[idx] ?? ''}
                            onChange={(e) => setClarifyAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full text-sm rounded-md border border-gray-300 px-3 py-2 bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          >
                            <option value="">Select...</option>
                            {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={clarifyAnswers[idx] ?? ''}
                            onChange={(e) => setClarifyAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full text-sm rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            placeholder="Your answer..."
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowClarify(false);
                        void handleAIGenerate();
                      }}
                      className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
                    >
                      Generate with answers
                    </button>
                    <button
                      onClick={() => { setShowClarify(false); setClarifyAnswers({}); void handleAIGenerate({ skipClarify: true }); }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Skip — generate now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Progress bar during generation */}
            {isGenerating && (
              <div className="space-y-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-violet-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${generatingProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Wand2 className="h-4 w-4 animate-spin text-violet-600" />
                    <span>{generatingStatus || 'Generating...'}</span>
                  </div>
                  <span className="text-gray-400 tabular-nums">{Math.round(generatingProgress)}%</span>
                </div>
              </div>
            )}

            {/* Block reveal animation */}
            {showBlockReveal && fxdaTemplate && (
              <div className="space-y-2 max-h-60 overflow-hidden">
                {fxdaTemplate.pages
                  .flatMap((page) =>
                    page.content.split(/\n{2,}/).filter((p) => p.trim()),
                  )
                  .map((blockText, idx) => (
                    <div
                      key={idx}
                      className={`bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-700 border border-gray-200 transition-all duration-300 ${
                        idx < revealedBlockCount
                          ? 'opacity-100 translate-y-0'
                          : 'opacity-0 translate-y-2'
                      }`}
                    >
                      {blockText.slice(0, 80)}{blockText.length > 80 ? '...' : ''}
                    </div>
                  ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('method')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isGenerating}
              >
                Back
              </button>
              <button
                onClick={() => {
                  void handleGenerateClick();
                }}
                disabled={!aiPrompt.trim() || isGenerating || isClarifying}
                className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isGenerating ? (
                  <>
                    <Wand2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate with AI
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Edit — Real editing workspace with toolbar, block actions, view modes */}
        {step === 'edit' && fxdaTemplate && (() => {
          const editBlocks = getEditBlocks();
          const AI_ACTIONS = [
            { label: 'Rewrite', instruction: 'Rewrite this content to be clearer and more professional' },
            { label: 'Summarize', instruction: 'Summarize this content concisely' },
            { label: 'Expand', instruction: 'Expand this content with more detail' },
            { label: 'Shorten', instruction: 'Shorten this content while preserving key points' },
            { label: 'Change Tone — Formal', instruction: 'Rewrite in a formal, professional tone' },
            { label: 'Change Tone — Casual', instruction: 'Rewrite in a friendly, conversational tone' },
          ];
          return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Review & Edit</h2>
              <p className="text-slate-600">Edit your document. Add, remove, or reorder sections. Use AI to rewrite content.</p>
            </div>

            {/* Toolbar + View Switcher */}
            <div className="max-w-[794px] mx-auto">
              <div className="bg-white border border-slate-200 rounded-t-xl px-3 py-2 flex items-center gap-1 flex-wrap">
                {/* Formatting controls */}
                <button
                  onClick={() => execFormat('bold')}
                  title="Bold"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  onClick={() => execFormat('italic')}
                  title="Italic"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  onClick={() => execFormat('underline')}
                  title="Underline"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <Underline className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Font size */}
                <button
                  onClick={() => execFormat('fontSize', '2')}
                  title="Decrease font size"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500 select-none px-0.5"><Type className="h-4 w-4 inline" /></span>
                <button
                  onClick={() => execFormat('fontSize', '5')}
                  title="Increase font size"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Alignment */}
                <button
                  onClick={() => execFormat('justifyLeft')}
                  title="Align left"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => execFormat('justifyCenter')}
                  title="Align center"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
                <button
                  onClick={() => execFormat('justifyRight')}
                  title="Align right"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <AlignRight className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Lists */}
                <button
                  onClick={() => execFormat('insertUnorderedList')}
                  title="Bullet list"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => execFormat('insertOrderedList')}
                  title="Numbered list"
                  className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* AI Actions Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowAiDropdown((prev) => !prev)}
                    title="AI actions"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-violet-600 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors text-sm font-medium"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>AI</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showAiDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 w-52">
                      {AI_ACTIONS.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => {
                            setShowAiDropdown(false);
                            // Apply to the focused/last-hovered block
                            const targetIdx = hoveredBlockIdx ?? 0;
                            if (targetIdx < editBlocks.length) {
                              void rewriteBlockAI(targetIdx, action.instruction);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Insert Field */}
                <button
                  onClick={insertFieldPlaceholder}
                  title="Insert field placeholder"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors text-sm"
                >
                  <FileSignature className="h-4 w-4" />
                  <span>Insert Field</span>
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setEditViewMode('pages')}
                    title="Pages view"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      editViewMode === 'pages'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FileIcon className="h-3.5 w-3.5" />
                    Pages
                  </button>
                  <button
                    onClick={() => setEditViewMode('cards')}
                    title="Cards view"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      editViewMode === 'cards'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cards
                  </button>
                </div>
              </div>

              {/* Field insertion note */}
              <div className="bg-violet-50 border-x border-slate-200 px-3 py-1.5 text-xs text-violet-600">
                <FileSignature className="h-3 w-3 inline mr-1 relative -top-px" />
                Use <strong>Insert Field</strong> to add placeholders. Configure field types in the next step.
              </div>

              {/* Content Area */}
              <div
                ref={editCanvasRef}
                className={`bg-white border border-t-0 border-slate-200 rounded-b-xl ${
                  editViewMode === 'pages' ? 'px-20 py-24' : 'p-6'
                }`}
              >
                {editViewMode === 'pages' ? (
                  /* Pages View — A4 layout */
                  <div className="space-y-3">
                    {editBlocks.map((block, blockIdx) => {
                      const globalIdx = blockIdx;
                      const isHeading = block.length < 100 && !block.endsWith('.') && block === block.toUpperCase();
                      const isClause = /^\d+[\.\)]/.test(block);
                      const isHovered = hoveredBlockIdx === globalIdx;
                      const isRewriting = rewritingBlockIdx === globalIdx;
                      const isDragging = draggedBlockIdx === globalIdx;
                      const isDragOver = dragOverBlockIdx === globalIdx;
                      return (
                        <div
                          key={globalIdx}
                          className={`group relative ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-violet-400' : ''}`}
                          onMouseEnter={() => setHoveredBlockIdx(globalIdx)}
                          onMouseLeave={() => setHoveredBlockIdx(null)}
                          draggable
                          onDragStart={(e) => {
                            setDraggedBlockIdx(globalIdx);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverBlockIdx(globalIdx);
                          }}
                          onDragEnd={() => {
                            if (draggedBlockIdx !== null && dragOverBlockIdx !== null && draggedBlockIdx !== dragOverBlockIdx) {
                              moveBlock(draggedBlockIdx, dragOverBlockIdx);
                            }
                            setDraggedBlockIdx(null);
                            setDragOverBlockIdx(null);
                          }}
                        >
                          {/* Block-level actions — visible on hover */}
                          {isHovered && !isRewriting && (
                            <div className="absolute -left-12 top-0 flex flex-col gap-1 z-10">
                              <button
                                title="Drag to reorder"
                                className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-grab focus:outline-none focus:ring-2 focus:ring-violet-400"
                              >
                                <GripVertical className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => void rewriteBlockAI(globalIdx, 'Rewrite this content to be clearer and more professional')}
                                title="AI Rewrite"
                                className="p-1.5 rounded text-violet-400 hover:text-violet-600 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              >
                                <Sparkles className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => addBlockBelow(globalIdx)}
                                title="Add block below"
                                className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => deleteBlock(globalIdx)}
                                title="Delete block"
                                className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}

                          {/* Rewriting indicator */}
                          {isRewriting && (
                            <div className="absolute inset-0 bg-violet-50/80 rounded flex items-center justify-center z-10">
                              <div className="flex items-center gap-2 text-violet-600 text-sm font-medium">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Rewriting...
                              </div>
                            </div>
                          )}

                          <div
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateBlockContent(globalIdx, e.currentTarget.innerHTML)}
                            dangerouslySetInnerHTML={{ __html: block }}
                            className={`outline-none rounded px-2 py-1.5 hover:bg-slate-50 focus:bg-slate-50 focus:ring-1 focus:ring-violet-200 transition-colors ${
                              isHeading
                                ? 'text-lg font-semibold text-slate-900 mt-6 mb-2'
                                : isClause
                                  ? 'text-sm leading-relaxed text-slate-700'
                                  : 'text-sm leading-relaxed text-slate-600'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Cards View — blocks as reorderable cards */
                  <div className="space-y-3">
                    {editBlocks.map((block, blockIdx) => {
                      const globalIdx = blockIdx;
                      const isHeading = block.length < 100 && !block.endsWith('.') && block === block.toUpperCase();
                      const isRewriting = rewritingBlockIdx === globalIdx;
                      const isDragging = draggedBlockIdx === globalIdx;
                      const isDragOver = dragOverBlockIdx === globalIdx;
                      return (
                        <div
                          key={globalIdx}
                          className={`group relative border rounded-lg transition-all ${
                            isDragging ? 'opacity-40 border-slate-300' : isDragOver ? 'border-violet-400 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                          }`}
                          draggable
                          onDragStart={(e) => {
                            setDraggedBlockIdx(globalIdx);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverBlockIdx(globalIdx);
                          }}
                          onDragEnd={() => {
                            if (draggedBlockIdx !== null && dragOverBlockIdx !== null && draggedBlockIdx !== dragOverBlockIdx) {
                              moveBlock(draggedBlockIdx, dragOverBlockIdx);
                            }
                            setDraggedBlockIdx(null);
                            setDragOverBlockIdx(null);
                          }}
                        >
                          {/* Card header with actions */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50 rounded-t-lg">
                            <GripVertical className="h-4 w-4 text-slate-400 cursor-grab" />
                            <span className="text-xs font-medium text-slate-500 flex-1">
                              {isHeading ? 'Heading' : `Block ${globalIdx + 1}`}
                            </span>
                            <button
                              onClick={() => void rewriteBlockAI(globalIdx, 'Rewrite this content to be clearer and more professional')}
                              title="AI Rewrite"
                              className="p-1.5 rounded text-violet-400 hover:text-violet-600 hover:bg-violet-50 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-violet-400"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => addBlockBelow(globalIdx)}
                              title="Add block below"
                              className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-violet-400"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteBlock(globalIdx)}
                              title="Delete block"
                              className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-violet-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Rewriting indicator */}
                          {isRewriting && (
                            <div className="absolute inset-0 bg-violet-50/80 rounded-lg flex items-center justify-center z-10">
                              <div className="flex items-center gap-2 text-violet-600 text-sm font-medium">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Rewriting...
                              </div>
                            </div>
                          )}

                          {/* Card content */}
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateBlockContent(globalIdx, e.currentTarget.innerHTML)}
                            dangerouslySetInnerHTML={{ __html: block }}
                            className={`outline-none px-4 py-3 focus:ring-1 focus:ring-violet-200 rounded-b-lg transition-colors ${
                              isHeading
                                ? 'text-base font-semibold text-slate-900'
                                : 'text-sm leading-relaxed text-slate-600'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-end gap-3 max-w-[794px] mx-auto">
              <button
                onClick={() => setStep('generate')}
                className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('configure')}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
              >
                Continue to Configure
              </button>
            </div>
          </div>
          );
        })()}

        {/* Step 4: Configure */}
        {step === 'configure' && fxdaTemplate && (
          <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 240px)' }}>
            {/* Left: A4 document preview (60%) */}
            <div className="w-[60%] flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <EditablePreview template={fxdaTemplate} onUpdate={setFxdaTemplate} />
              </div>
            </div>

            {/* Right: Tabbed panel (40%) */}
            <div className="w-[40%] flex flex-col">
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 mb-4">
                {(['fields', 'parties', 'workflow'] as ConfigureTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setConfigureTab(tab)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${
                      configureTab === tab
                        ? 'border-violet-600 text-violet-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-4 flex-1 overflow-y-auto">
                {/* Fields Tab */}
                {configureTab === 'fields' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Select a field type, then click on the document to place it
                    </p>

                    {/* Party selector */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Assign to party</label>
                      <div className="flex gap-2 flex-wrap">
                        {parties.map((party, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedPartyIndex(idx)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                              selectedPartyIndex === idx
                                ? 'ring-2 ring-offset-1 ring-violet-400'
                                : ''
                            }`}
                            style={{
                              backgroundColor: party.color + '20',
                              borderColor: party.color,
                              color: party.color,
                            }}
                          >
                            {party.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Field type chips */}
                    <div className="grid grid-cols-2 gap-2">
                      {FIELD_TYPES.map(({ type, label }) => (
                        <button
                          key={type}
                          onClick={() =>
                            setPendingFieldType(pendingFieldType === type ? null : type)
                          }
                          className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            pendingFieldType === type
                              ? fieldColorForParty(selectedPartyIndex) + ' border'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Placed fields list */}
                    {fxdaTemplate.fields.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Placed Fields ({fxdaTemplate.fields.length})
                        </h4>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {fxdaTemplate.fields.map((field) => (
                            <div
                              key={field.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('application/json', JSON.stringify({ fieldId: field.id, field }));
                              }}
                              className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-sm cursor-grab hover:bg-gray-100 active:cursor-grabbing"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      PARTY_COLORS[(field.party ?? 0) % PARTY_COLORS.length],
                                  }}
                                />
                                <span className="font-medium text-gray-800">{field.name}</span>
                                <span className="text-gray-400 text-xs capitalize">{field.type}</span>
                              </div>
                              <button
                                onClick={() => handleDeleteField(field.id)}
                                className="text-gray-400 hover:text-red-500 p-0.5"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Parties Tab */}
                {configureTab === 'parties' && (
                  <div className="space-y-4">
                    {/* Party list */}
                    <div className="space-y-2">
                      {parties.map((party, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: party.color }}
                            />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{party.name}</div>
                              {party.email && (
                                <div className="text-xs text-gray-500">{party.email}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                              {party.role}
                            </span>
                            {parties.length > 1 && (
                              <button
                                onClick={() => handleDeleteParty(idx)}
                                className="text-gray-400 hover:text-red-500 p-0.5"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add party form */}
                    <div className="border-t pt-4 space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Add Party
                      </h4>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newPartyName}
                        onChange={(e) => setNewPartyName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newPartyEmail}
                        onChange={(e) => setNewPartyEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      />
                      <select
                        value={newPartyRole}
                        onChange={(e) =>
                          setNewPartyRole(e.target.value as 'Signer' | 'Approver' | 'Viewer')
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      >
                        <option value="Signer">Signer</option>
                        <option value="Approver">Approver</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                      <button
                        onClick={handleAddParty}
                        disabled={!newPartyName.trim()}
                        className="w-full px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add Party
                      </button>
                    </div>
                  </div>
                )}

                {/* Workflow Tab */}
                {configureTab === 'workflow' && (
                  <div className="space-y-3">
                    {/* Skip workflow option */}
                    <button
                      onClick={() => setSelectedWorkflow(null)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                        selectedWorkflow === null
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <X className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Skip Workflow</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        Save without a workflow configuration
                      </p>
                    </button>

                    {workflowPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSelectedWorkflow(preset);
                          showToast(`Workflow "${preset.name}" attached to template`, 'success');
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                          selectedWorkflow?.id === preset.id
                            ? 'border-violet-500 bg-violet-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-900">{preset.name}</h4>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{preset.description}</p>
                        <div className="flex gap-2 text-xs">
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                            {preset.parties} Parties
                          </span>
                          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 rounded capitalize">
                            {preset.signingOrder}
                          </span>
                          {preset.requiresApproval && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                              Approval
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Continue button */}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setStep('generate')}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('preview')}
                  className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  Continue to Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 'preview' && fxdaTemplate && (
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <span>
                  <strong className="text-gray-900">{fxdaTemplate.fields.length}</strong> fields
                </span>
                <span>
                  <strong className="text-gray-900">{parties.length}</strong> parties
                </span>
                <span>
                  Workflow:{' '}
                  <strong className="text-gray-900">
                    {selectedWorkflow ? selectedWorkflow.name : 'None'}
                  </strong>
                </span>
              </div>
            </div>

            {/* A4 Preview */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <EditablePreview template={fxdaTemplate} onUpdate={setFxdaTemplate} />
            </div>

            {/* Save success message */}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Template saved successfully!</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {fxdaTemplate.documentName} has been saved to your template library.
                  </p>
                </div>
                <Link
                  href="/"
                  className="ml-auto px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  View Templates
                </Link>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('configure')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <PenLine className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={handleDownloadJSON}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download JSON
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saveSuccess}
                className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Template
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
