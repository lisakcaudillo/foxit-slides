'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { workflowPresets } from '@/data/mockData';
import { WorkflowPreset } from '@/types';
import { FXDATemplate } from '@/types/fxda';
import DocumentCanvas from '@/components/DocumentCanvas';
import EditablePreview from '@/components/EditablePreview';
import { ArrowLeft, Sparkles, Upload, FileText, Wand2, CheckCircle, List, File, Lock, ArrowRight, X, Minus, AlignLeft, AlignJustify, Files } from 'lucide-react';
import { useEditable } from '@/contexts/EditableContext';

type CreationMethod = 'ai' | 'upload' | 'paste';
type ProcessingMode = 'generate' | 'condense' | 'preserve';
type TextAmount = 'minimal' | 'concise' | 'detailed' | 'extensive';
type AudienceOption = 'general' | 'business' | 'professional' | 'legal';
type ToneOption = 'neutral' | 'formal' | 'instructional' | 'friendly';
type ContentHandling = 'reference' | 'final';
type Step = 'method' | 'input' | 'preview' | 'fields-option' | 'options' | 'workflow' | 'complete';

export default function CreateTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isEditMode } = useEditable();
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<CreationMethod>('ai');
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('generate');
  const [textAmount, setTextAmount] = useState<TextAmount>('detailed');
  const [pageCount, setPageCount] = useState(1);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // New form fields
  const [audienceOptions, setAudienceOptions] = useState<AudienceOption[]>([]);
  const [customAudience, setCustomAudience] = useState('');
  const [toneOptions, setToneOptions] = useState<ToneOption[]>(['neutral']);
  const [includeFormFields, setIncludeFormFields] = useState<boolean | null>(null);
  const [contentHandling, setContentHandling] = useState<ContentHandling>('reference');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    content: true,
    audience: true,
    advanced: true,
  });
  
  // Resizable/Draggable state (percentage-based for consistency)
  const [leftBoxSize, setLeftBoxSize] = useState({ widthPercent: 35, height: 600 });
  const [leftBoxPosition, setLeftBoxPosition] = useState({ x: 0, y: 0 });
  const [rightBoxSize, setRightBoxSize] = useState({ widthPercent: 60, height: 600 });
  const [rightBoxPosition, setRightBoxPosition] = useState({ xPercent: 38, y: 0 });
  const [hasCustomLayout, setHasCustomLayout] = useState(false);
  const [savedLayout, setSavedLayout] = useState<any>(null);
  const [isDragging, setIsDragging] = useState<'left' | 'right' | null>(null);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const leftBoxRef = useRef<HTMLDivElement>(null);
  const rightBoxRef = useRef<HTMLDivElement>(null);
  
  // FXDA Template
  const [fxdaTemplate, setFxdaTemplate] = useState<FXDATemplate | null>(null);
  const [fxdaTemplateWithoutFields, setFxdaTemplateWithoutFields] = useState<FXDATemplate | null>(null);
  const [streamBlocks, setStreamBlocks] = useState<any[]>([]);
  const [suggestedLabels, setSuggestedLabels] = useState<Record<string, string>>({});
  const [generationDone, setGenerationDone] = useState(false);
  
  // Fields option
  const [wantsFields, setWantsFields] = useState<boolean | null>(null);
  
  // Optional workflow
  const [wantsWorkflow, setWantsWorkflow] = useState<boolean | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowPreset | null>(null);

  // Drag and resize handlers (only in dev mode)
  useEffect(() => {
    if (!isEditMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const box = isDragging === 'left' ? 'left' : 'right';
        const setPosition = box === 'left' ? setLeftBoxPosition : setRightBoxPosition;
        const position = box === 'left' ? leftBoxPosition : rightBoxPosition;
        
        setPosition({
          x: position.x + e.clientX - dragStart.x,
          y: position.y + e.clientY - dragStart.y,
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }

      if (isResizing) {
        const box = isResizing === 'left' ? 'left' : 'right';
        const setSize = box === 'left' ? setLeftBoxSize : setRightBoxSize;
        const size = box === 'left' ? leftBoxSize : rightBoxSize;
        
        setSize({
          width: Math.max(300, size.width + e.clientX - dragStart.x),
          height: Math.max(400, size.height + e.clientY - dragStart.y),
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      setIsResizing(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isEditMode, isDragging, isResizing, dragStart, leftBoxPosition, rightBoxPosition, leftBoxSize, rightBoxSize]);

  const startDrag = (box: 'left' | 'right', e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    setIsDragging(box);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const startResize = (box: 'left' | 'right', e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(box);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleSaveLayout = () => {
    const layout = {
      leftBoxSize,
      leftBoxPosition,
      rightBoxSize,
      rightBoxPosition,
    };
    setSavedLayout(layout);
    setHasCustomLayout(true);
    alert('Layout saved successfully!');
  };

  const handleResetLayout = () => {
    setLeftBoxSize({ widthPercent: 35, height: 600 });
    setLeftBoxPosition({ x: 0, y: 0 });
    setRightBoxSize({ widthPercent: 60, height: 600 });
    setRightBoxPosition({ xPercent: 38, y: 0 });
    setHasCustomLayout(false);
    setSavedLayout(null);
    alert('Layout reset to default!');
  };

  const handleExitDevMode = () => {
    if (!savedLayout) {
      // Reset to default if no saved layout
      setLeftBoxSize({ width: 420, height: 600 });
      setLeftBoxPosition({ x: 0, y: 0 });
      setRightBoxSize({ width: 580, height: 600 });
      setRightBoxPosition({ x: 450, y: 0 });
    } else {
      // Restore saved layout
      setLeftBoxSize(savedLayout.leftBoxSize);
      setLeftBoxPosition(savedLayout.leftBoxPosition);
      setRightBoxSize(savedLayout.rightBoxSize);
      setRightBoxPosition(savedLayout.rightBoxPosition);
    }
  };

  // Apply saved layout or custom layout when switching modes
  useEffect(() => {
    if (!isEditMode && savedLayout) {
      setLeftBoxSize(savedLayout.leftBoxSize);
      setLeftBoxPosition(savedLayout.leftBoxPosition);
      setRightBoxSize(savedLayout.rightBoxSize);
      setRightBoxPosition(savedLayout.rightBoxPosition);
    }
  }, [isEditMode, savedLayout]);

  // Listen for exit dev mode event
  useEffect(() => {
    const handleExitEvent = () => {
      handleExitDevMode();
    };
    
    const handleSaveEvent = () => {
      handleSaveLayout();
    };
    
    window.addEventListener('exitDevMode', handleExitEvent);
    window.addEventListener('saveLayout', handleSaveEvent);
    return () => {
      window.removeEventListener('exitDevMode', handleExitEvent);
      window.removeEventListener('saveLayout', handleSaveEvent);
    };
  }, [savedLayout]);

  // Check URL params and skip method selection if method is provided
  useEffect(() => {
    const methodParam = searchParams.get('method') as CreationMethod | null;
    if (methodParam && ['ai', 'upload', 'paste'].includes(methodParam)) {
      setMethod(methodParam);
      setStep('input');
    }
  }, [searchParams]);

  const handleMethodSelect = (selectedMethod: CreationMethod) => {
    setMethod(selectedMethod);
    setStep('input');
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    setFxdaTemplate(null);
    setFxdaTemplateWithoutFields(null);
    
    try {
      // Build options to send; include UI-selected options but ensure no fields generation yet
      const options = {
        audience: audienceOptions.length ? audienceOptions : undefined,
        customAudience: customAudience || undefined,
        tone: toneOptions,
        textAmount,
        contentHandling,
        additionalInstructions,
        // Explicitly prevent fields generation during initial run
        includeFormFields: false,
      };

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, options }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      // Temporary template to build progressively
      const tempTemplate: FXDATemplate = {
        version: '1.0',
        documentId: `temp-${Date.now()}`,
        documentName: 'Generating...',
        description: '',
        category: 'General',
        pages: Array.from({ length: pageCount }, (_, i) => ({ 
          pageNumber: i + 1, 
          width: 612, 
          height: 792, 
          content: '' 
        })),
        fields: [],
        metadata: { createdAt: new Date().toISOString(), createdBy: 'AI Assistant', templateType: 'general', version: 1 },
        workflowPresetId: undefined,
        tags: [],
      };

      const suggestedLabels: any = {};

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          // Keep last partial line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.type === 'metadata') {
                if (obj.templateName) tempTemplate.documentName = obj.templateName;
                if (obj.category) tempTemplate.category = obj.category;
              } else if (obj.type === 'labels') {
                Object.assign(suggestedLabels, obj.labels || {});
                setSuggestedLabels(prev => ({ ...prev, ...(obj.labels || {}) }));
              } else if (obj.type === 'block') {
                const block = obj.block;
                // accumulate blocks and update page content
                setStreamBlocks(prev => {
                  const next = [...prev, block];
                  const content = next.map(b => (b.type === 'title' ? `\n\n${b.text.toUpperCase()}\n\n` : `${b.text}\n\n`)).join('').trim();
                  tempTemplate.pages[0].content = content;
                  setFxdaTemplate({ ...tempTemplate });
                  return next;
                });
              } else if (obj.type === 'done') {
                // final fxda
                const finalFxda: FXDATemplate = obj.fxda;
                // ensure fields are empty at this stage
                finalFxda.fields = finalFxda.fields || [];
                // attach suggested labels to metadata before setting state
                finalFxda.metadata = { ...finalFxda.metadata, suggestedLabels };
                setFxdaTemplateWithoutFields({ ...finalFxda, fields: [] });
                setFxdaTemplate(finalFxda);
                setSuggestedLabels(prev => ({ ...prev, ...suggestedLabels }));
                setGenerationDone(true);
                setStep('preview');
              }
            } catch (err) {
              console.error('Failed to parse stream line', err);
            }
          }
        }
      }

    } catch (error) {
      console.error('Failed to generate template:', error);
      alert('Failed to generate template. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!fxdaTemplate) return;
    
    try {
      // Ensure fields and workflow are included in the template
      const finalTemplate = {
        ...fxdaTemplate,
        fields: fxdaTemplate.fields || [],
        workflowPresetId: selectedWorkflow?.id,
        metadata: {
          ...fxdaTemplate.metadata,
          hasWorkflow: wantsWorkflow,
          workflowName: selectedWorkflow?.name,
        },
      };

      // Save template to backend
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fxda: finalTemplate,
          workflow: selectedWorkflow,
          hasWorkflow: wantsWorkflow,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      const savedTemplate = await response.json();
      
      // Show success message with JSON confirmation
      const pageInfo = finalTemplate.pages.length > 1 ? `${finalTemplate.pages.length} pages` : '1 page';
      const fieldInfo = finalTemplate.fields.length > 0 ? `\nFields: ${finalTemplate.fields.length}` : '';
      const workflowInfo = selectedWorkflow ? `\nWorkflow: ${selectedWorkflow.name}` : '';
      
      alert(`Template saved successfully!\n\nFormat: JSON\nTemplate ID: ${savedTemplate.template?.id || finalTemplate.documentId}\nName: ${finalTemplate.documentName}\nPages: ${pageInfo}${fieldInfo}${workflowInfo}`);
      
      setStep('complete');
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create New Template</h1>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto text-xs sm:text-sm">
            {(['method', 'input', 'preview', 'fields-option', 'options', step === 'workflow' ? 'workflow' : null, 'complete'] as (Step | null)[])
              .filter((s) => {
                if (s === 'method' && searchParams.get('method')) return false; // Skip if coming from homepage
                if (s === 'workflow' && !wantsWorkflow) return false; // Skip if no workflow
                return s !== null;
              })
              .map((s, idx, arr) => (
              <div key={s as string} className="flex items-center">
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${
                  step === s ? 'bg-primary-600 text-white' : 
                  ['method', 'input', 'preview', 'fields-option', 'options', 'workflow', 'complete'].indexOf(step) > idx ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {idx + 1}
                </div>
                <span className="ml-2 font-medium capitalize hidden sm:inline">{(s as string).replace('-', ' ')}</span>
                {idx < arr.length - 1 && <div className="w-8 sm:w-12 h-0.5 bg-gray-300 mx-2 sm:mx-4" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step: Method Selection */}
        {step === 'method' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose Your Content Source</h2>
              <p className="text-gray-600">Select where your template content will come from</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Generate with AI */}
              <button
                onClick={() => handleMethodSelect('ai')}
                className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-primary-500 hover:shadow-lg transition-all text-left group"
              >
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary-100">
                  <Sparkles className="h-6 w-6 text-gray-600 group-hover:text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Generate</h3>
                <p className="text-sm text-gray-600">
                  Describe your needs and generate content with AI
                </p>
              </button>

              {/* Paste Text */}
              <button
                onClick={() => handleMethodSelect('paste')}
                className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-primary-500 hover:shadow-lg transition-all text-left group"
              >
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary-100">
                  <FileText className="h-6 w-6 text-gray-600 group-hover:text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Paste Text</h3>
                <p className="text-sm text-gray-600">
                  Paste existing text content to use as template
                </p>
              </button>

              {/* Import File/URL */}
              <button
                onClick={() => handleMethodSelect('upload')}
                className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-primary-500 hover:shadow-lg transition-all text-left group"
              >
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary-100">
                  <Upload className="h-6 w-6 text-gray-600 group-hover:text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Import File/URL</h3>
                <p className="text-sm text-gray-600">
                  Upload a file or import from a URL
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step: Unified Input - All methods lead here */}
        {step === 'input' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Describe Your Template</h2>
              <p className="text-gray-600">Tell us what kind of template you need</p>
            </div>

            {/* Main Description */}
            <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Template Description
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="E.g., 'Create a standard NDA for vendors with 2 parties signing sequentially'"
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Audience & Tone Section */}
              <div className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, audience: !prev.audience }))}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-sm">Audience & Tone</span>
                  <span className="text-lg">{expandedSections.audience ? '−' : '+'}</span>
                </button>
                
                {expandedSections.audience && (
                  <div className="p-4 space-y-4 border-t border-gray-200">
                    {/* Audience Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Audience
                      </label>
                      
                      {/* Selected Tags */}
                      {audienceOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {audienceOptions.map((option) => (
                            <span
                              key={option}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
                            >
                              {option.charAt(0).toUpperCase() + option.slice(1)}
                              <button
                                type="button"
                                onClick={() => setAudienceOptions(prev => prev.filter(o => o !== option))}
                                className="hover:bg-primary-200 rounded-full p-0.5"
                                aria-label={`Remove ${option} audience option`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Dropdown */}
                      <select
                        value=""
                        onChange={(e) => {
                          const value = e.target.value as AudienceOption;
                          if (value && !audienceOptions.includes(value)) {
                            setAudienceOptions(prev => [...prev, value]);
                          }
                        }}
                        aria-label="Select audience type"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 mb-2"
                      >
                        <option value="">+ Add audience...</option>
                        {(['general', 'business', 'professional', 'legal'] as AudienceOption[])
                          .filter(opt => !audienceOptions.includes(opt))
                          .map((option) => (
                            <option key={option} value={option}>
                              {option.charAt(0).toUpperCase() + option.slice(1)}
                            </option>
                          ))}
                      </select>
                      
                      <input
                        type="text"
                        value={customAudience}
                        onChange={(e) => setCustomAudience(e.target.value)}
                        placeholder="Or describe custom audience..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    {/* Tone Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tone
                      </label>
                      
                      {/* Selected Tags */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {toneOptions.map((option) => (
                          <span
                            key={option}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
                          >
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                            <button
                              type="button"
                              onClick={() => setToneOptions(prev => {
                                const filtered = prev.filter(o => o !== option);
                                return filtered.length === 0 ? ['neutral'] : filtered;
                              })}
                              className="hover:bg-primary-200 rounded-full p-0.5"
                              aria-label={`Remove ${option} tone option`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      
                      {/* Dropdown */}
                      <select
                        value=""
                        onChange={(e) => {
                          const value = e.target.value as ToneOption;
                          if (value && !toneOptions.includes(value)) {
                            setToneOptions(prev => [...prev, value]);
                          }
                        }}
                        aria-label="Select tone option"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">+ Add tone...</option>
                        {(['neutral', 'formal', 'instructional', 'friendly'] as ToneOption[])
                          .filter(opt => !toneOptions.includes(opt))
                          .map((option) => (
                            <option key={option} value={option}>
                              {option.charAt(0).toUpperCase() + option.slice(1)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Amount of Text Section */}
              <div className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, content: !prev.content }))}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-sm">Amount of Text</span>
                  <span className="text-lg">{expandedSections.content ? '−' : '+'}</span>
                </button>
                
                {expandedSections.content && (
                  <div className="p-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setTextAmount('minimal')}
                        className={`p-3 border-2 rounded-lg text-left transition-all ${
                          textAmount === 'minimal'
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Minus className={`h-5 w-5 mb-1 ${textAmount === 'minimal' ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className="text-sm font-semibold">Minimal</div>
                        <div className="text-xs text-gray-600">Brief & essential</div>
                      </button>
                      
                      <button
                        onClick={() => setTextAmount('concise')}
                        className={`p-3 border-2 rounded-lg text-left transition-all ${
                          textAmount === 'concise'
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <AlignLeft className={`h-5 w-5 mb-1 ${textAmount === 'concise' ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className="text-sm font-semibold">Concise</div>
                        <div className="text-xs text-gray-600">Short & clear</div>
                      </button>
                      
                      <button
                        onClick={() => setTextAmount('detailed')}
                        className={`p-3 border-2 rounded-lg text-left transition-all ${
                          textAmount === 'detailed'
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <AlignJustify className={`h-5 w-5 mb-1 ${textAmount === 'detailed' ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className="text-sm font-semibold">Detailed</div>
                        <div className="text-xs text-gray-600">Comprehensive</div>
                      </button>
                      
                      <button
                        onClick={() => setTextAmount('extensive')}
                        className={`p-3 border-2 rounded-lg text-left transition-all ${
                          textAmount === 'extensive'
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Files className={`h-5 w-5 mb-1 ${textAmount === 'extensive' ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className="text-sm font-semibold">Extensive</div>
                        <div className="text-xs text-gray-600">Very thorough</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Fields Section */}
              <div className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, advanced: !prev.advanced }))}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-sm">Advanced Options</span>
                  <span className="text-lg">{expandedSections.advanced ? '−' : '+'}</span>
                </button>
                
                {expandedSections.advanced && (
                  <div className="p-4 space-y-4 border-t border-gray-200">
                    {/* Form fields are handled in the dedicated "Form Fields" step after preview. */}

                    {/* Content Handling - Only show for paste/upload methods */}
                    {(method === 'paste' || method === 'upload') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          How should we treat this content?
                        </label>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setContentHandling('reference')}
                            className={`flex-1 px-4 py-3 border-2 rounded-lg text-sm transition-all ${
                              contentHandling === 'reference'
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-medium mb-1">Reference Material</div>
                            <div className="text-xs text-gray-600">Use to guide generation</div>
                          </button>
                          <button
                            onClick={() => setContentHandling('final')}
                            className={`flex-1 px-4 py-3 border-2 rounded-lg text-sm transition-all ${
                              contentHandling === 'final'
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-medium mb-1">Final Content</div>
                            <div className="text-xs text-gray-600">Preserve as-is</div>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Additional Instructions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Instructions (optional)
                      </label>
                      <input
                        type="text"
                        value={additionalInstructions}
                        onChange={(e) => setAdditionalInstructions(e.target.value.slice(0, 200))}
                        placeholder="Any specific requirements..."
                        maxLength={200}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                      />
                      <div className="text-xs text-gray-500 mt-1 text-right">
                        {additionalInstructions.length}/200
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep('method')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </button>
              
              <div className="flex items-center gap-4">
                {/* Page Count */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPageCount(Math.max(1, pageCount - 1))}
                    disabled={pageCount <= 1}
                    className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    −
                  </button>
                  <div className="px-3 py-1 border border-gray-300 rounded text-sm min-w-[70px] text-center">
                    <span className="font-semibold">{pageCount}</span>
                    <span className="text-gray-500 ml-1">{pageCount === 1 ? 'pg' : 'pgs'}</span>
                  </div>
                  <button
                    onClick={() => setPageCount(pageCount + 1)}
                    className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50 text-sm"
                  >
                    +
                  </button>
                </div>
                
                <button
                  onClick={handleAIGenerate}
                  disabled={!aiPrompt.trim() || isGenerating}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isGenerating ? (
                    <>
                      <Wand2 className="h-5 w-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview Canvas */}
        {step === 'preview' && fxdaTemplate && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Edit Content Blocks</h2>
                  <p className="text-gray-600">Review and edit the generated content blocks. Each block represents one section of your document.</p>
                </div>
              </div>

              {/* Document Preview */}
              <EditablePreview
                template={fxdaTemplate as FXDATemplate}
                blocks={streamBlocks}
                suggestedLabels={suggestedLabels}
                onUpdate={(t) => setFxdaTemplate(t)}
                onUpdateLabels={(labels) => {
                  setSuggestedLabels(labels);
                  if (fxdaTemplate) setFxdaTemplate({ ...fxdaTemplate, metadata: { ...(fxdaTemplate.metadata || {}), suggestedLabels: labels } });
                }}
                generationDone={generationDone}
              />
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep('input')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </button>
              
              <button
                onClick={() => setStep('fields-option')}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
              >
                Continue to Document Preview
                <ArrowRight className="h-5 w-5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Fields Option */}
        {step === 'fields-option' && fxdaTemplate && (
          <div className="space-y-6">
            {/* Visual Document Preview */}
            <div className="bg-white rounded-lg shadow-sm border p-8">
              <h2 className="text-2xl font-bold mb-2">Document Preview</h2>
              <p className="text-gray-600 mb-6">Review your complete document with all {fxdaTemplate.pages.length} content block{fxdaTemplate.pages.length > 1 ? 's' : ''}</p>

              {/* Visual Document Canvas */}
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-8 mb-6">
                <div className="bg-white shadow-lg rounded-lg p-8 max-w-3xl mx-auto">
                  {/* Document Header */}
                  <div className="border-b-2 border-gray-200 pb-4 mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">{fxdaTemplate.documentName}</h1>
                    <p className="text-sm text-gray-500 mt-2">Category: {fxdaTemplate.category} | Blocks: {fxdaTemplate.pages.length}</p>
                  </div>

                  {/* Content Blocks */}
                  {fxdaTemplate.pages.map((page, idx) => (
                    <div key={page.pageNumber} className="mb-8">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-xs font-semibold">Block {page.pageNumber}</span>
                      </div>
                      <div className="prose max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {page.content || '(Empty block)'}
                      </div>
                      {idx < fxdaTemplate.pages.length - 1 && <div className="border-t border-gray-200 mt-8"></div>}
                    </div>
                  ))}

                  {/* Fields Preview (if any) */}
                  {fxdaTemplate.fields && fxdaTemplate.fields.length > 0 && (
                    <div className="mt-8 pt-6 border-t-2 border-gray-200">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900">Form Fields ({fxdaTemplate.fields.length})</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {fxdaTemplate.fields.map((field, idx) => (
                          <div key={idx} className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="text-sm font-medium text-blue-900">{field.label || field.id}</div>
                            <div className="text-xs text-blue-600 mt-1">
                              Type: {field.type} | Block: {field.page}
                              {field.party && ` | Party: ${field.party}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fields Question */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">Add Form Fields?</h2>
                <p className="text-gray-600">
                  Would you like AI to automatically add form fields (signatures, dates, text inputs, checkboxes) to your template?
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={async () => {
                    if (!fxdaTemplate) return;
                    // Request suggested fields from API
                    try {
                      const res = await fetch('/api/ai/suggest-fields', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: fxdaTemplate.pages[0]?.content || '' }),
                      });
                      const data = await res.json();
                      const fields = data.fields || [];
                      // attach suggested fields to template and proceed
                      const updated = { ...fxdaTemplate, fields } as FXDATemplate;
                      setFxdaTemplate(updated);
                      setWantsFields(true);
                      setStep('options');
                    } catch (err) {
                      console.error('Failed to suggest fields', err);
                      alert('Failed to suggest fields. Please try again.');
                    }
                  }}
                  className="w-full bg-white border-2 border-gray-200 rounded-lg p-6 text-left hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Yes, Add Form Fields</h3>
                      <p className="text-sm text-gray-600">
                        AI will automatically position signature fields, date fields, text inputs, and checkboxes based on your document
                      </p>
                      {fxdaTemplate.fields.length > 0 && (
                        <p className="text-sm text-primary-600 mt-2 font-medium">
                          ✓ {fxdaTemplate.fields.length} fields ready to add
                        </p>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setWantsFields(false);
                    // Use template without fields
                    if (fxdaTemplateWithoutFields) {
                      setFxdaTemplate(fxdaTemplateWithoutFields);
                    }
                    setStep('options');
                  }}
                  className="w-full bg-white border-2 border-gray-200 rounded-lg p-6 text-left hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <File className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">No, Skip Form Fields</h3>
                      <p className="text-sm text-gray-600">
                        Keep the template as text-only without interactive form fields
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Step: Options - Ask about workflow */}
        {step === 'options' && fxdaTemplate && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Customize Your Template</h2>
                <p className="text-gray-600">
                  Would you like to add a workflow configuration to this template?
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    setWantsWorkflow(true);
                    setStep('workflow');
                  }}
                  className="w-full bg-white border-2 border-gray-200 rounded-lg p-6 text-left hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Yes, Add Workflow</h3>
                      <p className="text-sm text-gray-600">
                        Apply a workflow preset to define signing order, parties, and approval requirements
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setWantsWorkflow(false);
                    handleSaveTemplate();
                  }}
                  className="w-full bg-white border-2 border-gray-200 rounded-lg p-6 text-left hover:border-gray-400 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">No, Save Template Only</h3>
                      <p className="text-sm text-gray-600">
                        Save the template now and add workflow configuration later if needed
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setStep('preview')}
                  className="text-gray-600 hover:text-gray-900 text-sm"
                >
                  ← Back to Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Workflow Selection */}
        {step === 'workflow' && fxdaTemplate && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Apply Workflow Preset</h2>
              <p className="text-gray-600">Select a workflow to apply to your template - this determines signing order, parties, and approval requirements</p>
            </div>

            {/* AI Suggestion */}
            {selectedWorkflow && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1">AI Recommended Workflow</h3>
                    <p className="text-sm text-blue-800">
                      Based on your template, we recommend: <strong>{selectedWorkflow.name}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Workflow Presets */}
            <div className="space-y-4">
              {workflowPresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedWorkflow(preset)}
                  className={`w-full bg-white border-2 rounded-lg p-6 text-left transition-colors ${
                    selectedWorkflow?.id === preset.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold">{preset.name}</h3>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {preset.parties} Parties
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full capitalize">
                        {preset.signingOrder}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{preset.description}</p>
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span>• {preset.securityLevel} security</span>
                    <span>• Reminders every {preset.reminderDays} days</span>
                    <span>• Expires in {preset.expirationDays} days</span>
                    {preset.requiresApproval && <span>• Requires approval</span>}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('options')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!selectedWorkflow}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                Save Template
                <ArrowRight className="h-5 w-5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && fxdaTemplate && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              
              <div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900">Template Created Successfully!</h2>
                <p className="text-gray-600">
                  Your template has been generated in FXDA format{wantsWorkflow ? ' with workflow preset applied' : ''}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Template Name:</span>
                  <span className="font-semibold">{fxdaTemplate.documentName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-semibold">{fxdaTemplate.category}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Form Fields:</span>
                  <span className="font-semibold">{fxdaTemplate.fields.length}</span>
                </div>
                {wantsWorkflow && selectedWorkflow && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Workflow:</span>
                    <span className="font-semibold">{selectedWorkflow.name}</span>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <Link
                  href="/"
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Back to Templates
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
