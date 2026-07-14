'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Check,
  Loader2,
  AlertCircle,
  Circle,
  ChevronDown,
} from 'lucide-react';

// ── Slide AI panel (left-side built-in dock) ───────────────────────────────
//
// Lives inside the editor body's flex row, NOT as a floating overlay. Sits
// to the left of the ThumbnailSidebar and pushes the canvas accordingly.
// When closed it just doesn't render — the layout snaps back.
//
// Three regions stacked vertically:
//   1. Header     — "AI" title + close X
//   2. Train of   — collapsible checklist of the AI's reasoning steps for the
//      thought      current request, with per-step status (pending / running
//                   / done / error). Mirrors the way Cursor / Claude Code
//                   surface tool-use to the user.
//   3. Chat       — user messages on the right (light slate bubble), AI
//                   messages on the left (violet-tinted bubble). Differing
//                   colors so the conversation is scannable at a glance.
//   4. Composer   — textarea + send button at the bottom.

export type ThoughtStatus = 'pending' | 'running' | 'done' | 'error';

export interface ThoughtStep {
  id: string;
  label: string;
  status: ThoughtStatus;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  author: 'user' | 'ai';
  text: string;
}

export interface DeckContext {
  activeCardTitle?: string;
  activeCardText?: string;
  cardTitles?: string[];
}

interface SlideAIPanelProps {
  onClose: () => void;
  /** Live deck context — refreshed by the parent when active card / cards
   *  change. Sent to /api/ai/slide-chat on each send so the AI grounds its
   *  reply in the user's current work. */
  deckContext?: DeckContext;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  author: 'ai',
  text: 'Hi — I can rewrite, restructure, expand, or summarize any slide. Highlight a card and tell me what to change, or ask me to look across the whole deck.',
};

export default function SlideAIPanel({
  onClose,
  deckContext,
}: SlideAIPanelProps) {
  const [draft, setDraft] = useState('');
  const [thoughtsOpen, setThoughtsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [thoughts, setThoughts] = useState<ThoughtStep[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or thought updates.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, thoughts.length, isThinking]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      author: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');

    // Simple two-step train of thought. With tool-use we'd derive these from
    // the model's actual tool calls; for now they're static signposts so the
    // user knows the request is being processed.
    const baseThoughts: ThoughtStep[] = [
      {
        id: `t-read-${Date.now()}`,
        label: 'Read the deck context',
        status: 'done',
      },
      {
        id: `t-draft-${Date.now()}`,
        label: 'Draft response',
        status: 'running',
      },
    ];
    setThoughts(baseThoughts);
    setIsThinking(true);

    try {
      // Build a slim history from prior turns (skip the welcome message so
      // it doesn't bias the model into chatty intros).
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ author: m.author, text: m.text }));

      const res = await fetch('/api/ai/slide-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, deckContext, history }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { text: string };
      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        author: 'ai',
        text: data.text,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setThoughts((prev) =>
        prev.map((t) => (t.status === 'running' ? { ...t, status: 'done' } : t)),
      );
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        author: 'ai',
        text: `Sorry — that request failed. ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      };
      setMessages((prev) => [...prev, errorMsg]);
      setThoughts((prev) =>
        prev.map((t) => (t.status === 'running' ? { ...t, status: 'error' } : t)),
      );
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside
      style={{
        width: '340px',
        flexShrink: 0,
        height: '100%',
        background: '#ffffff',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      role="complementary"
      aria-label="AI assistant"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: '#1a1f36',
          }}
        >
          <span
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #6B3FA0, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Sparkles size={14} />
          </span>
          AI assistant
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#697386',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'transparent')
          }
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Body — train-of-thought + chat thread ──────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Train of thought */}
        {thoughts.length > 0 && (
          <div
            style={{
              border: '1px solid rgba(107,63,160,0.18)',
              borderRadius: '12px',
              background: 'rgba(107,63,160,0.04)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setThoughtsOpen((v) => !v)}
              aria-expanded={thoughtsOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#6B3FA0',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isThinking && (
                  <Loader2
                    size={12}
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                )}
                Train of thought
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>
                  ({thoughts.filter((t) => t.status === 'done').length}/
                  {thoughts.length})
                </span>
              </span>
              <ChevronDown
                size={14}
                style={{
                  transform: thoughtsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                }}
              />
            </button>
            {thoughtsOpen && (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: '0 12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {thoughts.map((step) => (
                  <li
                    key={step.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '4px 0',
                    }}
                  >
                    <ThoughtIcon status={step.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color:
                            step.status === 'done'
                              ? '#1a1f36'
                              : step.status === 'error'
                              ? '#dc2626'
                              : '#475569',
                          textDecoration:
                            step.status === 'done' ? 'line-through' : 'none',
                          fontWeight: step.status === 'running' ? 600 : 500,
                          lineHeight: 1.4,
                        }}
                      >
                        {step.label}
                      </div>
                      {step.detail && (
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: '#94a3b8',
                            marginTop: '2px',
                            lineHeight: 1.4,
                          }}
                        >
                          {step.detail}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '10px 12px 12px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
          background: '#fafafa',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: '12px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '6px',
            transition: 'border-color 150ms ease',
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI to rewrite, restructure, or expand…"
            rows={2}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              fontSize: '0.85rem',
              color: '#1a1f36',
              background: 'transparent',
              minHeight: '40px',
              maxHeight: '160px',
              lineHeight: 1.4,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={draft.trim().length === 0}
            aria-label="Send"
            title="Send (⌘⏎)"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background:
                draft.trim().length > 0
                  ? 'linear-gradient(135deg, #6B3FA0, #8B5CF6)'
                  : 'rgba(0,0,0,0.08)',
              color: '#fff',
              cursor: draft.trim().length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 150ms ease',
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <div
          style={{
            fontSize: '0.7rem',
            color: '#94a3b8',
            marginTop: '6px',
            textAlign: 'center',
          }}
        >
          ⌘⏎ to send · esc to close
        </div>
      </div>
    </aside>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ThoughtIcon({ status }: { status: ThoughtStatus }) {
  const size = 14;
  const wrap = (icon: React.ReactNode, color: string) => (
    <span
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
        marginTop: '1px',
      }}
    >
      {icon}
    </span>
  );
  if (status === 'done') return wrap(<Check size={size} />, '#16a34a');
  if (status === 'running')
    return wrap(
      <Loader2 size={size} style={{ animation: 'spin 1s linear infinite' }} />,
      '#6B3FA0',
    );
  if (status === 'error') return wrap(<AlertCircle size={size} />, '#dc2626');
  return wrap(<Circle size={size} />, '#cbd5e1');
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.author === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: '8px',
      }}
    >
      {!isUser && (
        <span
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #6B3FA0, #818cf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            marginTop: '2px',
          }}
        >
          <Sparkles size={12} />
        </span>
      )}
      <div
        style={{
          maxWidth: '78%',
          padding: '8px 12px',
          borderRadius: '12px',
          fontSize: '0.82rem',
          lineHeight: 1.5,
          color: '#1a1f36',
          background: isUser
            ? 'rgba(15,23,42,0.06)'
            : 'rgba(107,63,160,0.08)',
          border: isUser
            ? '1px solid rgba(15,23,42,0.06)'
            : '1px solid rgba(107,63,160,0.18)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.text}
      </div>
    </div>
  );
}
