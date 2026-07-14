'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, ArrowRight, Loader2, Home } from 'lucide-react';
import Link from 'next/link';

// --- Types ---

interface GenerationPageProps {
  onSubmitPrompt: (prompt: string) => void;
  onUpload: () => void;
  onStartBlank: () => void;
  isGenerating?: boolean;
}

// --- Example prompts ---

const EXAMPLE_PROMPTS = [
  'Create a pitch deck to build a case to expand to a new market',
  'Onboarding steps for new employees including orientation and training',
  'Generate fundraising ideas for a non-profit, for a board meeting',
];

// --- Component ---

export default function GenerationPage({
  onSubmitPrompt,
  onUpload,
  onStartBlank,
  isGenerating = false,
}: GenerationPageProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Cap the grow so a large paste can't swallow the screen; scroll beyond it.
    const cap = Math.max(200, Math.round(window.innerHeight * 0.4));
    el.style.height = `${Math.min(cap, Math.max(48, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    autoResize();
  }, [prompt, autoResize]);

  // Handle example card click
  const handleExampleClick = (index: number, text: string) => {
    setPrompt(text);
    setSelectedCard(index);
    // Clear the selected card glow after 300ms
    setTimeout(() => setSelectedCard(null), 300);
    // Focus the textarea
    textareaRef.current?.focus();
  };

  // Handle submit
  const handleSubmit = () => {
    if (prompt.trim() && !isGenerating) {
      onSubmitPrompt(prompt.trim());
    }
  };

  // Handle keyboard submit (Cmd/Ctrl + Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="generation-bg fixed inset-0 z-50 flex flex-col items-center overflow-y-auto">
      {/* Minimal navigation — home button, top-left */}
      <div className="fixed top-4 left-5 z-10">
        <Link
          href="/"
          className="flex items-center justify-center size-11 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
          title="Home"
        >
          <Home className="size-4" />
        </Link>
      </div>

      {/* Spacer to position content at ~30% from top */}
      <div className="flex-shrink-0" style={{ height: '25vh' }} />

      {/* Staggered entrance container */}
      <div className="w-full max-w-[800px] px-6 pb-16">
        {/* Headline */}
        <h1
          className="text-center font-bold text-slate-900 animate-fade-in"
          style={{
            fontSize: '2.75rem',
            lineHeight: '1.15',
            letterSpacing: '-0.02em',
          }}
        >
          From ideas to documents
          <br />
          in minutes
        </h1>

        {/* Prompt Card — glass morphism */}
        <div
          className="glass-card mt-10 animate-fade-in-delayed"
          style={{ padding: '24px 28px' }}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to create..."
            disabled={isGenerating}
            rows={1}
            className="w-full resize-none bg-transparent text-base text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-60"
            style={{ minHeight: '48px' }}
          />

          {/* Action Bar */}
          <div className="mt-4 flex items-center justify-between">
            {/* Left: Upload + Start blank */}
            <div className="flex items-center gap-3">
              <button
                onClick={onUpload}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-base text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-md px-2 py-1.5 min-h-[44px] disabled:opacity-40"
                title="Upload a document"
              >
                <Upload className="size-4" />
                <span>Upload</span>
              </button>
              <button
                onClick={onStartBlank}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-base text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-md px-2 py-1.5 min-h-[44px] disabled:opacity-40"
                title="Start with a blank document"
              >
                <FileText className="size-4" />
                <span>Start blank</span>
              </button>
            </div>

            {/* Right: Next button */}
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className="flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Building your plan...</span>
                </>
              ) : (
                <>
                  <span>Next</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Example Prompt Cards */}
        <div className="mt-6 grid grid-cols-3 gap-3 animate-fade-in-delayed-2">
          {EXAMPLE_PROMPTS.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(index, example)}
              disabled={isGenerating}
              className={`
                text-left rounded-xl px-5 py-4 text-base text-slate-600 leading-relaxed
                border transition-all duration-200 ease-out cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-violet-400
                disabled:opacity-40 disabled:cursor-not-allowed
                ${
                  selectedCard === index
                    ? 'ring-2 ring-violet-200 border-violet-200 bg-slate-50/80'
                    : 'border-transparent bg-slate-50/80 hover:border-violet-200'
                }
              `}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
