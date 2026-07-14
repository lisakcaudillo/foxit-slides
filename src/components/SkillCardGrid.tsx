'use client';

import { useState } from 'react';

interface SkillDef {
  name: string;
  desc: string;
  accent: string;
  isNew: boolean;
  img: string;
}

const SKILLS: SkillDef[] = [
  { name: 'Legal Counsel', desc: 'Contracts, NDAs, terms, compliance docs', accent: '#401842', isNew: false, img: '/images/skills/legal-counsel.svg' },
  { name: 'Business Strategist', desc: 'Board memos, proposals, strategy plans, pitches', accent: '#6B3FA0', isNew: false, img: '/images/skills/executive-writer.svg' },
  { name: 'Technical Author', desc: 'API docs, specs, requirements, architecture', accent: '#FF5F00', isNew: false, img: '/images/skills/technical-author.svg' },
  { name: 'HR Professional', desc: 'Offer letters, policies, handbooks, job descriptions', accent: '#401842', isNew: false, img: '/images/skills/hr-professional.svg' },
  { name: 'Research Analyst', desc: 'Market analysis, competitive intel, literature reviews', accent: '#6B3FA0', isNew: false, img: '/images/skills/research-analyst.svg' },
  { name: 'Academic Writer', desc: 'Essays, thesis papers, research papers, study guides', accent: '#FF5F00', isNew: true, img: '/images/skills/compliance-officer.svg' },
];

interface SkillCardGridProps {
  selectedSkill: string | null;
  onSkillClick: (skillName: string) => void;
}

export default function SkillCardGrid({ selectedSkill, onSkillClick }: SkillCardGridProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {SKILLS.map((skill) => {
          const isSelected = selectedSkill === skill.name;
          return (
            <button
              key={skill.name}
              onClick={() => onSkillClick(skill.name)}
              className={`group relative flex items-center gap-3 px-4 py-3 glass-tile cursor-pointer ${
                isSelected ? '' : 'hover:-translate-y-0.5'
              }`}
              style={{
                ...(isSelected
                  ? {
                      background: `linear-gradient(135deg, rgba(255,255,255,0.55) 0%, ${skill.accent}12 100%)`,
                      border: `1px solid ${skill.accent}30`,
                      boxShadow: `0 0 0 1px ${skill.accent}20, 0 8px 24px ${skill.accent}18, inset 0 1px 0 rgba(255,255,255,0.5)`,
                      transform: 'translateY(-2px)',
                    }
                  : {}),
              }}
            >
              {/* Shine sweep overlay for "New" cards */}
              {skill.isNew && !isSelected && (
                <div className="skill-shine-overlay absolute inset-0 rounded-xl overflow-hidden pointer-events-none" />
              )}

              {/* Glassmorphism icon on colored pad */}
              <div
                className="flex-shrink-0 rounded-xl flex items-center justify-center"
                style={{
                  width: '44px',
                  height: '44px',
                  background: 'rgba(107, 63, 160, 0.08)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <img
                  src={skill.img}
                  alt={skill.name}
                  style={{
                    position: 'absolute',
                    width: '180%',
                    height: '180%',
                    maxWidth: 'none',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -55%)',
                  }}
                />
              </div>

              <div className="min-w-0">
                <span className="text-sm font-semibold text-foreground whitespace-nowrap flex items-center gap-1.5">
                  {skill.name}
                  {skill.isNew && !isSelected && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-full"
                      style={{ background: '#FF5F00', color: '#fff' }}
                    >
                      New
                    </span>
                  )}
                  {isSelected && (
                    <svg className="size-4" viewBox="0 0 20 20" fill={skill.accent}>
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {skill.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes card-shine {
          0%, 95%, 100% { left: -100%; opacity: 0; }
          97% { opacity: 0.4; }
          99% { left: 100%; opacity: 0; }
        }
        .skill-shine-overlay::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transform: skewX(-20deg);
          animation: card-shine 25s ease-in-out infinite;
        }
        .grid > :nth-child(2n) .skill-shine-overlay::after {
          animation-delay: 8s;
        }
        .grid > :nth-child(3n) .skill-shine-overlay::after {
          animation-delay: 16s;
        }
        @media (prefers-reduced-motion: reduce) {
          .skill-shine-overlay::after { animation: none; }
        }
      `}</style>
    </>
  );
}
