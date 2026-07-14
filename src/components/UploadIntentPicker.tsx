'use client';

import { useState } from 'react';
import {
  FileText,
  Image,
  Sparkles,
  Edit3,
  Copy,
  Eye,
  ChevronRight,
  Upload,
  X,
  CheckCircle2,
} from 'lucide-react';

// ── Upload Intent Types ──────────────────────────────────────────────────

export type UploadIntent =
  | 'edit'        // Keep and edit the document directly
  | 'reference'   // AI uses it as reference to create something new
  | 'extract-text'  // Pull text only, discard visuals
  | 'extract-all';  // Keep text + visuals + structure

export type ContentAction =
  | 'generate-outline'    // Generate from this as an outline
  | 'summarize'           // Summarize into cards/doc
  | 'expand'              // Expand into a full presentation
  | 'restructure'         // Reorganize into a better structure
  | 'custom';             // Custom prompt

export interface UploadIntentResult {
  intent: UploadIntent;
  action?: ContentAction;
  keepVisuals: boolean;
  customPrompt?: string;
  fileName: string;
  fileContent: string;
}

// ── Intent Options ───────────────────────────────────────────────────────

const INTENT_OPTIONS: {
  id: UploadIntent;
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
}[] = [
  {
    id: 'edit',
    label: 'Edit this document',
    description: 'Open it in the editor — keep the content, make changes',
    icon: Edit3,
    color: '#6B3FA0',
  },
  {
    id: 'reference',
    label: 'Use as reference',
    description: 'AI reads it and creates something new — you guide the direction',
    icon: Sparkles,
    color: '#8B5CF6',
  },
  {
    id: 'extract-text',
    label: 'Extract text only',
    description: 'Pull out the text content, discard images and formatting',
    icon: Copy,
    color: '#F59E0B',
  },
  {
    id: 'extract-all',
    label: 'Keep everything',
    description: 'Preserve text, visuals, and structure for editing',
    icon: Eye,
    color: '#0EA5E9',
  },
];

const ACTION_OPTIONS: {
  id: ContentAction;
  label: string;
  description: string;
}[] = [
  { id: 'generate-outline', label: 'Generate from this as an outline', description: 'Use the structure as a starting point' },
  { id: 'summarize', label: 'Summarize into key points', description: 'Condense into a concise presentation or document' },
  { id: 'expand', label: 'Expand into a full presentation', description: 'Turn this content into a detailed card deck' },
  { id: 'restructure', label: 'Reorganize for a new audience', description: 'Keep the content but restructure for different readers' },
  { id: 'custom', label: 'Custom instructions', description: 'Tell the AI exactly what to do with this content' },
];

// ── Component ────────────────────────────────────────────────────────────

export default function UploadIntentPicker({
  fileName,
  fileContent,
  onComplete,
  onCancel,
}: {
  fileName: string;
  fileContent: string;
  onComplete: (result: UploadIntentResult) => void;
  onCancel: () => void;
}) {
  const [intent, setIntent] = useState<UploadIntent | null>(null);
  const [action, setAction] = useState<ContentAction | null>(null);
  const [keepVisuals, setKeepVisuals] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');

  const showActions = intent === 'reference';
  const canProceed = intent && (!showActions || action);

  const handleProceed = () => {
    if (!intent) return;
    onComplete({
      intent,
      action: action || undefined,
      keepVisuals,
      customPrompt: action === 'custom' ? customPrompt : undefined,
      fileName,
      fileContent,
    });
  };

  return (
    <div style={{
      maxWidth: '560px', width: '100%', margin: '0 auto',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* File indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', borderRadius: '12px',
        background: 'rgba(107,63,160,0.04)', border: '1px solid rgba(107,63,160,0.12)',
        marginBottom: '24px',
      }}>
        <Upload style={{ width: '16px', height: '16px', color: '#6B3FA0' }} />
        <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 500, color: '#0f172a' }}>{fileName}</span>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
          color: '#94a3b8', display: 'flex',
        }}>
          <X style={{ width: '16px', height: '16px' }} />
        </button>
      </div>

      {/* Intent selection */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
        How should we use this content?
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {INTENT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = intent === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => { setIntent(opt.id); setAction(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 16px', borderRadius: '12px',
                border: isSelected ? `2px solid ${opt.color}` : '1px solid rgba(0,0,0,0.08)',
                background: isSelected ? `${opt.color}08` : 'white',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 150ms ease',
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `${opt.color}10`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon style={{ width: '20px', height: '20px', color: opt.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>{opt.label}</div>
                <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '2px' }}>{opt.description}</div>
              </div>
              {isSelected && <CheckCircle2 style={{ width: '20px', height: '20px', color: opt.color, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {/* Content action — only shown for "reference" intent */}
      {showActions && (
        <>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
            How should AI use this content?
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {ACTION_OPTIONS.map((opt) => {
              const isSelected = action === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAction(opt.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '10px',
                    border: isSelected ? '2px solid #8B5CF6' : '1px solid rgba(0,0,0,0.06)',
                    background: isSelected ? 'rgba(139,92,246,0.04)' : 'white',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 150ms ease',
                  }}
                >
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    border: isSelected ? '6px solid #8B5CF6' : '2px solid #cbd5e1',
                    flexShrink: 0, transition: 'all 150ms ease',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#0f172a' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom prompt input */}
          {action === 'custom' && (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Tell the AI what to do with this content..."
              style={{
                width: '100%', minHeight: '80px', padding: '12px 14px',
                borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)',
                fontSize: '0.9rem', color: '#0f172a', outline: 'none',
                resize: 'vertical', marginBottom: '16px',
                background: 'rgba(0,0,0,0.015)',
              }}
            />
          )}
        </>
      )}

      {/* Visuals toggle — shown for reference and extract-all */}
      {(intent === 'reference' || intent === 'extract-all') && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(0,0,0,0.02)', marginBottom: '20px',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={keepVisuals}
            onChange={(e) => setKeepVisuals(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#6B3FA0' }}
          />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#0f172a' }}>
              <Image style={{ width: '14px', height: '14px', display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Keep visuals from the document
            </div>
            <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>Include images, charts, and diagrams</div>
          </div>
        </label>
      )}

      {/* Proceed button */}
      <button
        onClick={handleProceed}
        disabled={!canProceed}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', height: '48px', borderRadius: '9999px',
          background: canProceed ? 'linear-gradient(135deg, #6B3FA0, #8B5CF6)' : 'rgba(0,0,0,0.12)',
          color: 'white', border: 'none', fontSize: '1rem', fontWeight: 600,
          cursor: canProceed ? 'pointer' : 'not-allowed',
          boxShadow: canProceed ? '0 2px 12px rgba(107,63,160,0.25)' : 'none',
          transition: 'all 200ms ease',
        }}
      >
        Continue <ChevronRight style={{ width: '18px', height: '18px' }} />
      </button>
    </div>
  );
}
