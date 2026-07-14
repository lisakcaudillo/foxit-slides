'use client';

/**
 * /internal/structured-deck — live harness for the structured generation engine
 * WITH the images POC (2026-06-17). Runs a real structured generation
 * (`/api/ai/generate-cards` with `structured:true, images:true`) and draws every
 * returned card through the REAL SlideStage — no editor, no chrome.
 *
 * Image selection: by default the cover matches the deck topic and the content
 * image matches that slide's focus (per-slide relevance). You can also OVERRIDE
 * either by picking a specific library image below (search by keyword → assign
 * to Cover or Content); the chosen ids are sent as coverImageId/contentImageId.
 *
 * Internal only — not linked from the product. Query:
 *   ?prompt=The future of clean energy&skin=mono-light&count=6
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SlideStage } from '@/components/card-template/SlideStage';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import type { CardTemplate } from '@/types/card-template';

const W = 960;
const H = 540;
const SCALE = 0.6;

interface LibImg {
  id: string;
  filename: string;
  prompt: string;
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #333', background: '#16161c', color: '#e5e7eb',
};

export default function StructuredDeckPage() {
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ prompt: 'The future of clean energy', skin: 'mono-light', count: 6 });

  const [library, setLibrary] = useState<LibImg[]>([]);
  const [libQuery, setLibQuery] = useState('');
  const [coverPick, setCoverPick] = useState<string | null>(null);
  const [contentPick, setContentPick] = useState<string | null>(null);

  // The library metadata is served statically by Next — fetch it directly.
  useEffect(() => {
    fetch('/library/metadata.json')
      .then((r) => r.json())
      .then((d: { images?: LibImg[] }) => setLibrary(Array.isArray(d.images) ? d.images : []))
      .catch(() => setLibrary([]));
  }, []);

  const generate = useCallback(
    async (prompt: string, skin: string, count: number, cover: string | null, content: string | null) => {
      setStatus('loading');
      setError(null);
      setTemplate(null);
      try {
        const res = await fetch('/api/ai/generate-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            structured: true,
            images: true,
            skinHint: skin || undefined,
            cardCount: count || undefined,
            coverImageId: cover || undefined,
            contentImageId: content || undefined,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data = (await res.json()) as { template?: CardTemplate; error?: string };
        if (data.error) throw new Error(data.error);
        if (!data.template) throw new Error('No template in response');
        setTemplate(data.template);
        setStatus('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    },
    [],
  );

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const prompt = q.get('prompt') ?? 'The future of clean energy';
    const skin = q.get('skin') ?? 'mono-light';
    const count = Number(q.get('count') ?? '6') || 6;
    setParams({ prompt, skin, count });
    void generate(prompt, skin, count, null, null);
  }, [generate]);

  const filtered = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    const list = q ? library.filter((i) => i.prompt.toLowerCase().includes(q)) : library;
    return list.slice(0, 60);
  }, [library, libQuery]);

  const thumbSrc = (i: LibImg) => `/library/images/${i.filename}`;
  const pickedLabel = (id: string | null) => (id ? id : 'auto (topic-matched)');

  return (
    <div data-status={status} style={{ padding: 24, background: '#0b0b0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Load every theme font so the live render uses the real typeface (a serif
          fallback both mutes the gradient titles and overflows the baked text-fit). */}
      <GoogleFonts fonts={['Inter', 'Work Sans', 'Roboto', 'Poppins', 'Montserrat', 'Manrope', 'DM Sans', 'Space Grotesk', 'Plus Jakarta Sans', 'Sora', 'Fraunces', 'Playfair Display', 'Source Serif 4', 'Source Sans 3', 'Lato', 'Open Sans']} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={params.prompt} onChange={(e) => setParams((p) => ({ ...p, prompt: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 280 }} />
        <input value={params.skin} onChange={(e) => setParams((p) => ({ ...p, skin: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
        <input type="number" value={params.count} onChange={(e) => setParams((p) => ({ ...p, count: Number(e.target.value) || 6 }))} style={{ ...inputStyle, width: 70 }} />
        <button
          onClick={() => void generate(params.prompt, params.skin, params.count, coverPick, contentPick)}
          disabled={status === 'loading'}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          {status === 'loading' ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {/* Image selection */}
      <div style={{ border: '1px solid #222', borderRadius: 10, padding: 12, marginBottom: 20, background: '#101016' }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Cover image:</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{pickedLabel(coverPick)}</span>
          {coverPick && <button onClick={() => setCoverPick(null)} style={{ ...inputStyle, padding: '2px 8px', cursor: 'pointer' }}>clear</button>}
          <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 16 }}>Content image:</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{pickedLabel(contentPick)}</span>
          {contentPick && <button onClick={() => setContentPick(null)} style={{ ...inputStyle, padding: '2px 8px', cursor: 'pointer' }}>clear</button>}
          <input
            placeholder="filter library by keyword…"
            value={libQuery}
            onChange={(e) => setLibQuery(e.target.value)}
            style={{ ...inputStyle, marginLeft: 'auto', width: 220 }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
          {filtered.map((img) => (
            <div key={img.id} style={{ border: coverPick === img.id ? '2px solid #7c3aed' : contentPick === img.id ? '2px solid #22c55e' : '1px solid #2a2a33', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc(img)} alt="" loading="lazy" style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
              <div style={{ display: 'flex' }}>
                <button onClick={() => setCoverPick(img.id)} style={{ flex: 1, padding: '4px 0', fontSize: 11, border: 'none', background: '#1c1c24', color: '#c4b5fd', cursor: 'pointer' }}>Cover</button>
                <button onClick={() => setContentPick(img.id)} style={{ flex: 1, padding: '4px 0', fontSize: 11, border: 'none', borderLeft: '1px solid #2a2a33', background: '#1c1c24', color: '#86efac', cursor: 'pointer' }}>Content</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status === 'loading' && <p style={{ opacity: 0.7 }}>Generating structured deck with images… (real AI calls, ~20–40s)</p>}
      {status === 'error' && <pre style={{ color: '#f87171', whiteSpace: 'pre-wrap' }}>{error}</pre>}

      {template && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {template.cards.map((card, i) => (
            <div key={card.id ?? i}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>slide {i + 1} · {card.id}</div>
              <div style={{ width: W * SCALE, height: H * SCALE, overflow: 'hidden', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
                <div style={{ width: W, height: H, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
                  <SlideStage card={card} theme={template.theme} width={W} height={H} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
