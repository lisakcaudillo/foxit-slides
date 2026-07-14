'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Sparkles, X, Minus, MessageSquare } from 'lucide-react';
import type { Block } from '@/types';
import type {
  AgentChatMessage,
  BlockUpdate,
  BlockUpdateWithStatus,
  BlockUpdateResult,
} from '@/types/block-update';
import BlockUpdatePreview from './BlockUpdatePreview';

interface AgentChatPanelProps {
  /** Current document blocks (passed to intent interpreter for context) */
  blocks: Block[];
  /** Currently selected block ID, if any */
  selectedBlockId?: string | null;
  /** Called when user accepts a block update */
  onApplyUpdate: (update: BlockUpdate) => void;
  /** Whether the chat is open */
  isOpen: boolean;
  /** Toggle open/close */
  onToggle: () => void;
  /** Pre-filled prompt from external source (e.g. progressive AI menu) */
  prefillPrompt?: string | null;
  /** Called when prefill is consumed */
  onPrefillConsumed?: () => void;
  /** Status message from the generation pipeline — shown as a system message in chat */
  statusMessage?: { text: string; type: 'error' | 'info' | 'hint' } | null;
}

const SUGGESTION_CHIPS = [
  'Suggest a skill for this document',
  'Summarize for executives',
  'Check for compliance risks',
  'Identify key obligations',
];

export default function AgentChatPanel({
  blocks,
  selectedBlockId,
  onApplyUpdate,
  isOpen,
  onToggle,
  prefillPrompt,
  onPrefillConsumed,
  statusMessage,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle prefill prompt from external source
  useEffect(() => {
    if (prefillPrompt && isOpen) {
      setInput(prefillPrompt);
      onPrefillConsumed?.();
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(prefillPrompt.length, prefillPrompt.length);
        }
      }, 150);
    }
  }, [prefillPrompt, isOpen, onPrefillConsumed]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Handle /clear command
    if (trimmed === '/clear') {
      setMessages([]);
      setInput('');
      return;
    }

    const userMessage: AgentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/interpret-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: trimmed,
          blocks: blocks.map((b) => ({ id: b.id, content: b.content })),
          selectedBlockId: selectedBlockId ?? undefined,
          conversationHistory: history,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const result: BlockUpdateResult = await res.json();

      const updatesWithStatus: BlockUpdateWithStatus[] = result.updates.map((u) => ({
        ...u,
        status: 'previewing' as const,
      }));

      const assistantMessage: AgentChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**${result.interpretedIntent}**\n\n${result.summary}`,
        timestamp: new Date().toISOString(),
        updates: updatesWithStatus,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Mark unread if chat is not open
      if (!isOpen) {
        setHasUnread(true);
      }
    } catch (error) {
      const errorMessage: AgentChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}. Try rephrasing your instruction.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, blocks, selectedBlockId, messages, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
      if (e.key === 'Escape') {
        onToggle();
      }
    },
    [handleSend, onToggle],
  );

  const handleAcceptUpdate = useCallback(
    (messageId: string, updateId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.updates) return m;
          const update = m.updates.find((u) => u.id === updateId);
          if (update) {
            onApplyUpdate(update);
          }
          return {
            ...m,
            updates: m.updates.map((u) =>
              u.id === updateId ? { ...u, status: 'applied' as const } : u,
            ),
          };
        }),
      );
    },
    [onApplyUpdate],
  );

  const handleRejectUpdate = useCallback((messageId: string, updateId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.updates) return m;
        return {
          ...m,
          updates: m.updates.map((u) =>
            u.id === updateId ? { ...u, status: 'rejected' as const } : u,
          ),
        };
      }),
    );
  }, []);

  const handleAcceptAll = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.updates) return m;
          for (const u of m.updates) {
            if (u.status === 'previewing' || u.status === 'pending') {
              onApplyUpdate(u);
            }
          }
          return {
            ...m,
            updates: m.updates.map((u) =>
              u.status === 'previewing' || u.status === 'pending'
                ? { ...u, status: 'applied' as const }
                : u,
            ),
          };
        }),
      );
    },
    [onApplyUpdate],
  );

  const handleRejectAll = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.updates) return m;
        return {
          ...m,
          updates: m.updates.map((u) =>
            u.status === 'previewing' || u.status === 'pending'
              ? { ...u, status: 'rejected' as const }
              : u,
          ),
        };
      }),
    );
  }, []);

  // Get selected block content for context indicator
  const selectedBlockContent = selectedBlockId
    ? blocks.find((b) => b.id === selectedBlockId)?.content?.replace(/<[^>]*>/g, '').trim().slice(0, 30)
    : null;

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  return (
    <>
      {/* Floating Button — always visible */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed z-50 flex items-center justify-center rounded-full transition-all focus:outline-none"
          style={{
            bottom: 24,
            right: 24,
            width: 52,
            height: 52,
            background: '#6B3FA0',
            boxShadow: '0 4px 12px rgba(107,63,160,0.25)',
            ...(prefersReducedMotion ? {} : { transition: 'transform 200ms ease-out, box-shadow 200ms ease-out, background 200ms ease-out' }),
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = '#541C59';
            btn.style.boxShadow = '0 6px 16px rgba(107,63,160,0.35)';
            btn.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = '#6B3FA0';
            btn.style.boxShadow = '0 4px 12px rgba(107,63,160,0.25)';
            btn.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          role="button"
          aria-label="Open AI assistant"
          aria-expanded={isOpen}
        >
          <MessageSquare className="size-5 text-white" />
          {/* Unread indicator */}
          {hasUnread && (
            <span
              className="absolute top-0 right-0 size-2 rounded-full border-2 border-white"
              style={{
                background: '#FF5F00',
                animation: prefersReducedMotion ? 'none' : 'pulse 2s infinite',
              }}
            />
          )}
        </button>
      )}

      {/* Chat Window — right-edge full-height side panel */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden"
          style={{
            top: 0,
            right: 0,
            bottom: 0,
            width: 420,
            height: '100vh',
            background: 'white',
            borderRadius: 0,
            boxShadow: '-8px 0 24px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
            transformOrigin: 'right center',
            ...(prefersReducedMotion ? {} : {
              animation: 'panelSlideIn 250ms ease-out',
            }),
          }}
          role="dialog"
          aria-label="AI assistant"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{
              height: 48,
              padding: '0 12px 0 16px',
              background: '#6B3FA0',
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-white opacity-80" />
              <span className="text-white font-semibold" style={{ fontSize: 15 }}>Foxit Slides AI</span>
            </div>
            <div className="flex items-center">
              <button
                onClick={onToggle}
                className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                aria-label="Minimize chat"
              >
                <Minus className="size-4 text-white opacity-70" />
              </button>
              <button
                onClick={onToggle}
                className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                aria-label="Close chat"
              >
                <X className="size-4 text-white opacity-70" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ padding: 16, background: '#fafbfc' }}
            role="log"
            aria-live="polite"
          >
            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles className="size-8 text-slate-300 mb-3" />
                <p className="text-base font-semibold text-slate-500 mb-1">How can I help?</p>
                <p className="text-sm text-slate-400 max-w-[260px]">
                  Ask me to rewrite, summarize, add sections, or restructure your document.
                </p>
                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setInput(chip)}
                      className="text-sm text-slate-600 rounded-full transition-colors"
                      style={{
                        background: 'rgba(107,63,160,0.06)',
                        border: '1px solid rgba(107,63,160,0.12)',
                        padding: '10px 16px',
                        minHeight: 44,
                        borderRadius: 20,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(107,63,160,0.10)';
                        e.currentTarget.style.color = '#6B3FA0';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(107,63,160,0.06)';
                        e.currentTarget.style.color = '';
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="mb-2" style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    maxWidth: '85%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    background: msg.role === 'user' ? '#6B3FA0' : '#ffffff',
                    color: msg.role === 'user' ? 'white' : '#334155',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    border: msg.role === 'assistant' ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {msg.content.split('\n').map((line, i) => {
                    const parts = line.split(/\*\*(.*?)\*\*/g);
                    return (
                      <p key={i} className={i > 0 ? 'mt-1' : ''}>
                        {parts.map((part, j) =>
                          j % 2 === 1 ? (
                            <strong key={j}>{part}</strong>
                          ) : (
                            <span key={j}>{part}</span>
                          ),
                        )}
                      </p>
                    );
                  })}
                </div>

                {/* Block updates preview */}
                {msg.updates && msg.updates.length > 0 && (
                  <div className="mt-2" style={{ maxWidth: '85%', alignSelf: 'flex-start' }}>
                    <BlockUpdatePreview
                      updates={msg.updates}
                      onAccept={(updateId) => handleAcceptUpdate(msg.id, updateId)}
                      onReject={(updateId) => handleRejectUpdate(msg.id, updateId)}
                      onAcceptAll={() => handleAcceptAll(msg.id)}
                      onRejectAll={() => handleRejectAll(msg.id)}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Pipeline status message — shown inline like Claude Code progress */}
            {statusMessage && (
              <div
                className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm"
                style={{
                  alignSelf: 'flex-start',
                  background: statusMessage.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(107,63,160,0.06)',
                  color: statusMessage.type === 'error' ? '#dc2626' : '#6B3FA0',
                  border: `1px solid ${statusMessage.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(107,63,160,0.12)'}`,
                  maxWidth: '85%',
                }}
              >
                {statusMessage.type !== 'error' && (
                  <span className="size-1.5 rounded-full motion-safe:animate-pulse" style={{ background: '#6B3FA0' }} />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center gap-1.5 py-2" style={{ alignSelf: 'flex-start' }}>
                <span className="size-1.5 rounded-full bg-slate-400" style={{ animation: prefersReducedMotion ? 'none' : 'bounce 1.2s infinite 0ms' }} />
                <span className="size-1.5 rounded-full bg-slate-400" style={{ animation: prefersReducedMotion ? 'none' : 'bounce 1.2s infinite 100ms' }} />
                <span className="size-1.5 rounded-full bg-slate-400" style={{ animation: prefersReducedMotion ? 'none' : 'bounce 1.2s infinite 200ms' }} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            className="flex-shrink-0"
            style={{
              padding: 12,
              background: 'white',
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Foxit Slides AI..."
                rows={1}
                className="flex-1 resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                style={{
                  minHeight: 40,
                  maxHeight: 120,
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#6B3FA0';
                  e.currentTarget.style.boxShadow = '0 0 0 1px #6B3FA0';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                aria-label="Message to AI assistant"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
                style={{
                  width: 40,
                  height: 40,
                  background: '#6B3FA0',
                  borderRadius: 8,
                }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#541C59'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#6B3FA0'; }}
                title="Send"
                aria-label="Send message"
              >
                <Send className="size-4 text-white" />
              </button>
            </div>
            {/* Context indicator */}
            {selectedBlockContent && (
              <p className="mt-1.5 text-xs text-slate-400">
                Editing: {selectedBlockContent}...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes chatWindowIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes panelSlideIn {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
