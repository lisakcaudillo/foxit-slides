'use client';

/**
 * HeroVisual — Flowing wave background for the home page hero section.
 * Inspired by Apple iOS wallpaper waves and Aurora fluid shapes.
 * Pure CSS + inline SVG, violet/slate palette on light background.
 * Respects prefers-reduced-motion via CSS.
 */
export default function HeroVisual() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%)',
        borderRadius: 'inherit',
      }}
    >
      {/* Organic blob — top-right radial gradient for depth */}
      <div
        className="absolute"
        style={{
          top: '-40px',
          right: '-60px',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196, 181, 253, 0.10) 0%, transparent 70%)',
        }}
      />

      {/* Wave SVG layers — CSS-animated for prefers-reduced-motion support */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1200 300"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Layer 1: Large slow curve — violet-500 at 6% */}
        <path
          className="hero-wave-1"
          d="M0,180 C150,120 350,220 600,160 C850,100 1050,200 1200,140 L1200,300 L0,300 Z"
          fill="rgba(139, 92, 246, 0.06)"
        />

        {/* Layer 2: Medium curve, offset — violet-500 at 4% */}
        <path
          className="hero-wave-2"
          d="M0,210 C200,170 400,250 650,190 C900,130 1000,230 1200,180 L1200,300 L0,300 Z"
          fill="rgba(139, 92, 246, 0.04)"
        />

        {/* Layer 3: Subtle slate accent — slate-400 at 5% */}
        <path
          className="hero-wave-3"
          d="M0,230 C180,200 380,260 580,220 C780,180 980,250 1200,210 L1200,300 L0,300 Z"
          fill="rgba(148, 163, 184, 0.05)"
        />

        {/* Layer 4: Smaller accent wave — violet-500 at 8% */}
        <path
          className="hero-wave-4"
          d="M0,250 C120,230 300,270 500,240 C700,210 900,260 1200,235 L1200,300 L0,300 Z"
          fill="rgba(139, 92, 246, 0.08)"
        />
      </svg>

      {/* Second organic blob — bottom-left for balance */}
      <div
        className="absolute"
        style={{
          bottom: '-30px',
          left: '-40px',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
        }}
      />

      {/* CSS animations for wave drift — respects prefers-reduced-motion */}
      <style>{`
        @keyframes hero-drift-1 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, 8px); }
          66% { transform: translate(-20px, 4px); }
        }
        @keyframes hero-drift-2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-25px, 6px); }
          66% { transform: translate(15px, -4px); }
        }
        @keyframes hero-drift-3 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(20px, -5px); }
          66% { transform: translate(-15px, 7px); }
        }
        @keyframes hero-drift-4 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-18px, 4px); }
          66% { transform: translate(22px, -3px); }
        }
        .hero-wave-1 {
          animation: hero-drift-1 60s ease-in-out infinite;
        }
        .hero-wave-2 {
          animation: hero-drift-2 55s ease-in-out infinite;
        }
        .hero-wave-3 {
          animation: hero-drift-3 50s ease-in-out infinite;
        }
        .hero-wave-4 {
          animation: hero-drift-4 45s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-wave-1,
          .hero-wave-2,
          .hero-wave-3,
          .hero-wave-4 {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
