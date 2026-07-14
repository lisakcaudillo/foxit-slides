'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Settings2,
  ChevronDown,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';

type LengthOption = 'short' | 'medium' | 'long';
type AudienceOption = 'general' | 'executives' | 'legal' | 'technical';
type DetailOption = 'concise' | 'moderate' | 'detailed';

interface PromptCardProps {
  selectedSkill: string | null;
  suggestions: Array<{ label: string; prompt: string }>;
}

export default function PromptCard({ selectedSkill, suggestions }: PromptCardProps) {
  const router = useRouter();
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [length, setLength] = useState<LengthOption>('medium');
  const [audience, setAudience] = useState<AudienceOption>('general');
  const [detail, setDetail] = useState<DetailOption>('moderate');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasCustomization = length !== 'medium' || audience !== 'general' || detail !== 'moderate';

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Store file as blob URL for the editor to pick up
    const blobUrl = URL.createObjectURL(file);
    sessionStorage.setItem('compose:upload-file-url', blobUrl);
    sessionStorage.setItem('compose:upload-file-name', file.name);
    sessionStorage.setItem('compose:upload-file-type', file.type);
    router.push('/editor/documents?source=upload');
  };

  const handleGenerate = () => {
    if (!generatePrompt.trim()) return;
    const promptLower = generatePrompt.trim().toLowerCase();

    // Detect presentation-like prompts and route to card creation flow
    const presentationKeywords = ['pitch', 'deck', 'presentation', 'slides', 'slide', 'keynote', 'pitch deck'];
    const isPresentationPrompt = presentationKeywords.some((kw) => promptLower.includes(kw));

    if (isPresentationPrompt) {
      const params = new URLSearchParams({ prompt: generatePrompt.trim() });
      if (selectedSkill) params.set('skill', selectedSkill);
      router.push(`/editor/slides?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({
      new: 'true',
      prompt: generatePrompt.trim(),
    });
    if (length !== 'medium') params.set('length', length);
    if (audience !== 'general') params.set('audience', audience);
    if (detail !== 'moderate') params.set('detail', detail);
    if (selectedSkill) params.set('skill', selectedSkill);
    router.push(`/editor/documents?${params.toString()}`);
  };

  const handlePillClick = (prompt: string) => {
    setGeneratePrompt(prompt);
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* Content area — white background */}
      <div className="p-5 bg-white">

      {/* Header row: headline + Customize & Generate */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <h2 className="text-xl font-semibold text-foreground">Your documents, powered by AI</h2>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className={`h-9 inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium transition-all border flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer ${
                hasCustomization
                  ? 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'
                  : 'border-slate-200 text-muted-foreground hover:text-foreground hover:border-primary/30 bg-white'
              }`}
            >
              <Settings2 className="size-3.5" />
              Customize
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Length</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={length} onValueChange={(v) => setLength(v as LengthOption)}>
                  <DropdownMenuRadioItem value="short">Short</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="long">Long</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Audience</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={audience} onValueChange={(v) => setAudience(v as AudienceOption)}>
                  <DropdownMenuRadioItem value="general">General</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="executives">Executives</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="legal">Legal</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="technical">Technical</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Level of Detail</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={detail} onValueChange={(v) => setDetail(v as DetailOption)}>
                  <DropdownMenuRadioItem value="concise">Concise</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="moderate">Moderate</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="detailed">Detailed</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={handleGenerate}
            disabled={!generatePrompt.trim()}
            className="h-9 px-5 gap-2 text-sm font-semibold text-white rounded-lg flex items-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #5B7FFF 0%, #9333EA 100%)',
              boxShadow: '0 4px 16px rgba(147, 51, 234, 0.3)',
            }}
          >
            <Sparkles className="size-4" />
            Generate
          </button>
        </div>
      </div>

      {/* Create content */}
        <>
          {/* Working with label */}
          {selectedSkill && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Working with:</span>
              <span className="text-sm font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255, 95, 0, 0.2)', color: '#FF5F00' }}>
                {selectedSkill}
              </span>
            </div>
          )}

          {/* Side by side: Upload + Describe */}
          <div className="flex gap-4" style={{ height: '120px' }}>
            {/* Left: Upload zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragEnter={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#FF5F00'; }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(255, 95, 0, 0.3)'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.style.borderColor = 'rgba(255, 95, 0, 0.3)';
                const file = e.dataTransfer.files[0];
                if (file) {
                  const input = fileInputRef.current;
                  if (input) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }}
              aria-label="Upload a document to edit with AI"
              className="w-1/3 rounded-xl border border-slate-200 cursor-pointer transition-all hover:shadow-lg flex flex-col items-center justify-center focus:outline-none focus:ring-2 focus:ring-orange-300/60"
              style={{ background: '#ffffff' }}
            >
              <Upload className="size-6 mb-1.5" style={{ color: '#FF5F00' }} />
              <span className="text-base font-semibold text-foreground">Upload Document</span>
              <span className="text-sm text-muted-foreground mt-0.5">PDF or Word</span>
              {/* Cloud storage logos */}
              <div className="flex items-center gap-3 mt-2">
                {/* Google Drive */}
                <span title="Google Drive — coming soon" className="opacity-40 hover:opacity-70 transition-opacity cursor-default">
                  <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.6 66.85L3.3 61.35 29.2 17.55H57.7L31.85 61.35z" fill="#0066DA"/>
                    <path d="M27.5 78L1.6 34.2 14.8 11.2 40.7 55z" fill="#00AC47"/>
                    <path d="M45.5 78L27.5 78 53.4 34.2 71.4 34.2z" fill="#EA4335"/>
                    <path d="M73.55 78L45.5 78 71.4 34.2 85.65 56.2z" fill="#00832D"/>
                    <path d="M85.65 56.2L71.4 34.2 57.7 17.55H29.2L14.8 11.2 28.95 0 87.3 0z" fill="#2684FC"/>
                    <path d="M29.2 17.55L14.8 11.2 28.95 0H58.5L87.3 0 85.65 56.2 71.4 34.2 57.7 17.55z" fill="#FFBA00"/>
                  </svg>
                </span>
                {/* Dropbox */}
                <span title="Dropbox — coming soon" className="opacity-40 hover:opacity-70 transition-opacity cursor-default">
                  <svg width="16" height="16" viewBox="0 0 43 40" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.6 0L0 8.3l8.8 7 12.5-8zM0 22.2l12.6 8.2 8.8-7.3-12.5-8zm12.6 8.2L21.4 23l8.8 7.4L21.4 40zm21.2-8.2l-8.8-7.3-12.5 8 8.8 7.3zm.1-14L21.4 0l-8.8 7.3 12.5 8z" fill="#0061FF"/>
                  </svg>
                </span>
                {/* OneDrive */}
                <span title="OneDrive — coming soon" className="opacity-40 hover:opacity-70 transition-opacity cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 15h5a3.5 3.5 0 00.5-6.97A5.5 5.5 0 009.73 7 4.5 4.5 0 006 15h8.5z" fill="#0078D4"/>
                    <path d="M9.73 7a5.5 5.5 0 0110.27 1.03A3.5 3.5 0 0119.5 15H14.5" fill="#0364B8" opacity="0.8"/>
                  </svg>
                </span>
                {/* SharePoint */}
                <span title="SharePoint — coming soon" className="opacity-40 hover:opacity-70 transition-opacity cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="10" r="7" fill="#038387" opacity="0.9"/>
                    <circle cx="17" cy="16" r="5" fill="#03787C"/>
                    <rect x="3" y="5" width="10" height="14" rx="1" fill="#036C70"/>
                    <text x="5.5" y="15" fill="white" fontSize="9" fontWeight="bold">S</text>
                  </svg>
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                onChange={handleUploadFile}
                className="hidden"
              />
            </div>

            {/* Right: Describe textarea — fills remaining width and height */}
            <form
              className="flex-1 flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                handleGenerate();
              }}
            >
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={selectedSkill ? `Describe what you need from ${selectedSkill}...` : 'Describe a document...'}
                className="w-full flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-base text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-colors resize-none leading-relaxed"
              />
            </form>
          </div>

        </>
    </div>
    </div>
  );
}
