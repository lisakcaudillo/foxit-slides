'use client';

import { useEffect, useRef, useState } from 'react';
import type { CardTemplate, Card, CardBlock } from '@/types/card-template';
import { getIcon } from './blocks/iconMap';

// ── Inline Block Renderers (slide-optimized, viewport-scaled) ──────────────

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function SlideBlock({ block, theme }: { block: CardBlock; theme: CardTemplate['theme'] }) {
  switch (block.type) {
    case 'heading': {
      const sizes = { 1: 'var(--title-size)', 2: 'var(--h2-size)', 3: 'var(--h3-size)' };
      const weights = { 1: 800, 2: 700, 3: 800 };
      const isSubLabel = block.level === 2;
      return (
        <div
          className="reveal"
          style={{
            fontSize: sizes[block.level],
            fontWeight: weights[block.level],
            color: theme.headingColor,
            lineHeight: 1.15,
            letterSpacing: isSubLabel ? '0.04em' : '-0.02em',
            textTransform: isSubLabel ? 'uppercase' : undefined,
            marginBottom: '0.25em',
          }}
        >
          {block.content}
        </div>
      );
    }
    case 'paragraph':
      return (
        <p className="reveal" style={{ fontSize: 'var(--body-size)', color: theme.bodyColor, lineHeight: 1.6, margin: '0.5em 0' }}>
          {renderMarkdown(block.content)}
        </p>
      );
    case 'smart-layout': {
      if (block.variant === 'timeline') {
        return (
          <div className="reveal" style={{ marginTop: '1em' }}>
            {block.cells.map((cell, i) => (
              <div key={i} style={{ display: 'flex', gap: 'clamp(0.5rem, 1.5vw, 1rem)', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '2rem' }}>
                  <div style={{
                    width: '2rem', height: '2rem', borderRadius: '50%',
                    background: cell.accentColor || theme.accentColors[i % theme.accentColors.length],
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 'var(--small-size)', flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  {i < block.cells.length - 1 && (
                    <div style={{ width: '2px', flex: 1, background: 'rgba(0,0,0,0.08)', minHeight: '1.5rem' }} />
                  )}
                </div>
                <div style={{ paddingBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, color: theme.headingColor, fontSize: 'var(--body-size)' }}>{cell.heading}</div>
                  <div style={{ color: theme.bodyColor, fontSize: 'var(--small-size)', lineHeight: 1.5, marginTop: '0.125rem' }}>{cell.body}</div>
                </div>
              </div>
            ))}
          </div>
        );
      }
      if (block.variant === 'list') {
        return (
          <div className="reveal" style={{ marginTop: '0.5em' }}>
            {block.cells.map((cell, i) => {
              const Icon = getIcon(cell.icon);
              return (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.5rem 0' }}>
                  {Icon && <Icon size={18} style={{ color: cell.accentColor || theme.accentColors[0], marginTop: '0.125rem', flexShrink: 0 }} />}
                  <div>
                    <div style={{ fontWeight: 700, color: theme.headingColor, fontSize: 'var(--body-size)' }}>{cell.heading}</div>
                    <div style={{ color: theme.bodyColor, fontSize: 'var(--small-size)', lineHeight: 1.5 }}>{cell.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      // Grid variants
      const cols = block.variant === 'grid-1x3' ? 3 : block.variant === 'grid-1x4' ? 4 : 2;
      return (
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'clamp(0.5rem, 1.5vw, 1.25rem)', marginTop: '1em' }}>
          {block.cells.map((cell, i) => {
            const Icon = getIcon(cell.icon);
            return (
              <div key={i} style={{ borderLeft: `3px solid ${cell.accentColor || theme.accentColors[i % theme.accentColors.length]}`, paddingLeft: '1rem' }}>
                {Icon && <Icon size={20} style={{ color: cell.accentColor || theme.accentColors[0], marginBottom: '0.375rem' }} />}
                <div style={{ fontWeight: 700, color: theme.headingColor, fontSize: 'var(--body-size)', marginBottom: '0.125rem' }}>{cell.heading}</div>
                <div style={{ color: theme.bodyColor, fontSize: 'var(--small-size)', lineHeight: 1.5 }}>{cell.body}</div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'label-group':
      return (
        <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75em' }}>
          {block.labels.map((label, i) => {
            const isFilled = label.style === 'filled';
            return (
              <span key={i} style={{
                padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: 'var(--small-size)', fontWeight: 600,
                background: isFilled ? theme.accentColors[0] : 'transparent',
                color: isFilled ? '#fff' : theme.accentColors[0],
                border: isFilled ? 'none' : `1.5px solid ${theme.accentColors[0]}`,
              }}>
                {label.text}
              </span>
            );
          })}
        </div>
      );
    case 'toggle':
      return (
        <div className="reveal" style={{ padding: '0.375rem 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <div style={{ fontWeight: 600, color: theme.headingColor, fontSize: 'var(--body-size)' }}>
            <span style={{ color: theme.accentColors[0], marginRight: '0.5rem' }}>▸</span>
            {block.heading}
          </div>
        </div>
      );
    case 'callout':
      return (
        <div className="reveal" style={{
          borderLeft: `3px solid ${theme.accentColors[0]}`, padding: '0.75rem 1rem', marginTop: '0.75em',
          background: 'rgba(0,0,0,0.02)', borderRadius: '0 8px 8px 0',
        }}>
          <div style={{ color: theme.bodyColor, fontSize: 'var(--body-size)', lineHeight: 1.6 }}>{renderMarkdown(block.content)}</div>
        </div>
      );
    case 'bullet-list':
      return (
        <ul className="reveal" style={{ margin: '0.5em 0', paddingLeft: '1.25rem' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ color: theme.bodyColor, fontSize: 'var(--body-size)', lineHeight: 1.7, marginBottom: '0.25rem' }}>
              {renderMarkdown(item)}
            </li>
          ))}
        </ul>
      );
    case 'divider':
      return <hr className="reveal" style={{ border: 'none', height: '1px', background: 'rgba(0,0,0,0.08)', margin: '0.75em 0' }} />;
    default:
      return null;
  }
}

// ── Slide Renderer ─────────────────────────────────────────────────────────

function Slide({ card, template, index }: { card: Card; template: CardTemplate; index: number }) {
  const theme = template.theme;
  const blocks = card.columns[0]?.blocks || [];
  const hasAccent = card.layout === 'split-left' || card.layout === 'split-right';
  const accentLeft = card.layout === 'split-left';

  const accentZone = hasAccent && card.accent ? (
    <div style={{
      flex: '0 0 40%',
      background: card.accent.type === 'gradient' ? card.accent.value : `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '50%', height: '50%', borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)',
        filter: 'blur(40px)',
      }} />
    </div>
  ) : null;

  const contentZone = (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: 'var(--slide-padding)',
      maxHeight: '100%',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: hasAccent ? '100%' : 'min(90vw, 900px)', margin: hasAccent ? 0 : '0 auto', width: '100%' }}>
        {blocks.map((block, i) => (
          <SlideBlock key={i} block={block} theme={theme} />
        ))}
      </div>
    </div>
  );

  // Slide background — subtle gradient variation per slide for visual rhythm
  let bg = theme.pageBg;
  if (index === 0) {
    bg = `linear-gradient(160deg, ${theme.pageBg} 0%, rgba(107,63,160,0.05) 60%, rgba(255,95,0,0.02) 100%)`;
  } else if (index % 2 === 1) {
    bg = `linear-gradient(170deg, ${theme.pageBg} 0%, rgba(107,63,160,0.02) 100%)`;
  }

  return (
    <section
      className="slide"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        scrollSnapAlign: 'start',
        display: 'flex',
        position: 'relative',
        background: bg,
        flexDirection: accentLeft ? 'row' : 'row-reverse',
      }}
    >
      {hasAccent && (accentLeft ? <>{accentZone}{contentZone}</> : <>{contentZone}{accentZone}</>)}
      {!hasAccent && contentZone}
    </section>
  );
}

// ── Main Presentation Component ────────────────────────────────────────────

export default function SlidePresentation({ template }: { template: CardTemplate }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const goTo = (idx: number) => {
      if (idx < 0 || idx >= template.cards.length) return;
      const slides = containerRef.current?.querySelectorAll('.slide');
      if (slides?.[idx]) {
        slides[idx].scrollIntoView({ behavior: 'smooth' });
        setCurrentSlide(idx);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goTo(currentSlide + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(currentSlide - 1);
      }
    };

    let lastWheel = 0;
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheel < 800) return;
      lastWheel = now;
      if (e.deltaY > 0) goTo(currentSlide + 1);
      else if (e.deltaY < 0) goTo(currentSlide - 1);
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY; };
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(diff) > 50) { diff > 0 ? goTo(currentSlide + 1) : goTo(currentSlide - 1); }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: true });
    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentSlide, template.cards.length]);

  // Reveal animation on intersect
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = Array.from(containerRef.current?.querySelectorAll('.slide') || []).indexOf(entry.target as Element);
          setCurrentSlide(idx);
          entry.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
        }
      });
    }, { threshold: 0.5 });

    containerRef.current?.querySelectorAll('.slide').forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        html { scroll-snap-type: y mandatory; scroll-behavior: smooth; }
        .slide { scroll-snap-align: start; }
        :root {
          --title-size: clamp(2rem, 5.5vw, 4rem);
          --h2-size: clamp(1rem, 2vw, 1.4rem);
          --h3-size: clamp(1.25rem, 3vw, 2rem);
          --body-size: clamp(0.875rem, 1.6vw, 1.2rem);
          --small-size: clamp(0.7rem, 1.1vw, 0.95rem);
          --slide-padding: clamp(2rem, 6vw, 6rem);
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .reveal { opacity: 0; }
        .reveal.visible { animation: fadeUp 0.4s ease-out forwards; }
        .reveal.visible:nth-child(2) { animation-delay: 0.08s; }
        .reveal.visible:nth-child(3) { animation-delay: 0.16s; }
        .reveal.visible:nth-child(4) { animation-delay: 0.24s; }
        .reveal.visible:nth-child(5) { animation-delay: 0.32s; }
        .reveal.visible:nth-child(6) { animation-delay: 0.4s; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .reveal { opacity: 1; }
          .reveal.visible { animation: none; }
        }
      `}</style>

      {/* Nav dots */}
      <nav style={{
        position: 'fixed', right: 'clamp(0.5rem, 2vw, 1.5rem)',
        top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px',
        zIndex: 100,
      }}>
        {template.cards.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              containerRef.current?.querySelectorAll('.slide')[i]?.scrollIntoView({ behavior: 'smooth' });
              setCurrentSlide(i);
            }}
            style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: i === currentSlide ? '#6B3FA0' : 'rgba(107,63,160,0.2)',
              transform: i === currentSlide ? 'scale(1.3)' : 'scale(1)',
              transition: 'all 300ms',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </nav>

      {/* Keyboard hint */}
      <div style={{
        position: 'fixed', bottom: 'clamp(0.5rem, 1.5vw, 1rem)',
        left: '50%', transform: 'translateX(-50%)',
        fontSize: 'var(--small-size)', color: '#697386',
        zIndex: 100, opacity: 0.6,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Use arrow keys or scroll to navigate
      </div>

      {/* Slides */}
      <div ref={containerRef} style={{ height: '100vh', overflowY: 'auto', scrollSnapType: 'y mandatory' }}>
        {template.cards.map((card, i) => (
          <Slide key={card.id} card={card} template={template} index={i} />
        ))}
      </div>
    </>
  );
}
