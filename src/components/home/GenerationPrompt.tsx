'use client';

/**
 * GenerationPrompt — the prompt card from the approved prototype
 * (`app/public/design-table/deck-generation-v2/a-intent.html` — "Reads Your
 * Intent"). Faithful React port plus one PM addition: the intent line is
 * hideable (persisted in localStorage).
 *
 * Below the prompt the system shows back ONE confident, pre-filled natural-
 * language INTENT LINE ("I'll write this for investors, in a confident voice,
 * detailed — building freely from your idea."). Each emphasized span is a
 * tappable affordance that opens a shared Apple-Intelligence-style popover to
 * adjust just that facet. As the user types, un-pinned facets are inferred live
 * from keywords; an explicit pick pins the facet so later typing won't override
 * it. Facets map 1:1 to the Generate payload (audience / tone / detail / voice
 * / treat).
 *
 * Visual rules are owned by the `.home-gen` scoped CSS in globals.css.
 * On Generate this stashes the payload in sessionStorage and navigates to
 * /editor/slides — it never touches the slides editor itself.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { THEMES } from '@/components/themes/themes';
import { ThemesModal } from '@/components/themes/ThemesModal';

const EXAMPLES = [
  'A Series A pitch for a fintech startup',
  'A Q3 business review for the leadership team',
  'A technical architecture overview for engineers',
  'An onboarding playbook for new hires',
  'A product launch keynote for the community',
] as const;

// ── facet option lists (mirror the slides creator's Customize popover) ──
const AUDIENCE_SUGGEST = [
  'Executives', 'Engineers', 'Designers', 'Sales team',
  'Customers', 'General public', 'Investors', 'Students',
] as const;
const TONE_SUGGEST = [
  'Professional', 'Casual', 'Friendly', 'Authoritative',
  'Inspirational', 'Educational', 'Conversational', 'Technical',
] as const;
const DETAIL_OPTS = ['Concise', 'Detailed', 'Extensive'] as const;
// visual density tiles for the Detail facet — a slide-with-N-lines glyph reads
// "this much content per slide" far better than a text chip.
const DETAIL_VIS: ReadonlyArray<{ v: Detail; lines: number }> = [
  { v: 'Concise', lines: 2 },
  { v: 'Detailed', lines: 3 },
  { v: 'Extensive', lines: 5 },
];

// Voice = the document-skill that drives prose voice. "Default" = let the engine
// choose; it surfaces inline only when it diverges from Default (calm default).
const VOICE_OPTS: ReadonlyArray<{ v: string; sub: string }> = [
  { v: 'Default', sub: 'Let Foxit Slides choose' },
  { v: 'No voice', sub: 'Plain, neutral writing' },
  { v: 'Legal', sub: 'Precise, contractual' },
  { v: 'Executive', sub: 'Decisive, top-line' },
  { v: 'Technical', sub: 'Exact, specification-grade' },
  { v: 'Persuasive', sub: 'Builds a case' },
  { v: 'Simple', sub: 'Short, plain words' },
  { v: 'HR', sub: 'Warm, people-first' },
  { v: 'Research', sub: 'Evidenced, cited' },
  { v: 'Government', sub: 'Formal, public-record' },
  { v: 'Educational', sub: 'Teaches step by step' },
  { v: 'Financial', sub: 'Numbers-led, rigorous' },
];

// How to treat uploaded/pasted text (mirrors the creator's rewriteIntensity).
// `span` is the self-contained tail clause rendered in the intent sentence.
const TREAT_OPTS: ReadonlyArray<{ id: TreatMode; label: string; sub: string; span: string }> = [
  { id: 'inspire', label: 'Inspire from this', sub: 'AI writes freely from my intent', span: 'expanding on my notes' },
  { id: 'build', label: 'Build on this', sub: 'Keep my key phrases, AI fills the rest', span: 'building on what I wrote' },
  { id: 'verbatim', label: 'Use as the text', sub: "Don't paraphrase, just structure it", span: 'keeping my exact words' },
];

type Detail = (typeof DETAIL_OPTS)[number];
type TreatMode = 'inspire' | 'build' | 'verbatim';
type FacetKey = 'type' | 'audience' | 'tone' | 'detail' | 'voice' | 'treat';

// Artifact type — the lead word ("Write a pitch deck…"). Inferred from the
// prompt when obvious, else the neutral default; always user-changeable.
const TYPE_SUGGEST = [
  'Pitch deck', 'Product launch', 'Sales deck', 'Business review',
  'Marketing strategy', 'Report', 'Proposal', 'Roadmap', 'Training deck',
  'Team update', 'Case study', 'Webinar',
] as const;
const DEFAULT_TYPE = 'slide deck';
const DEFAULT_AUDIENCE = 'a general audience';
const DEFAULT_TONE = 'clear';

const PROMPT_STORAGE_KEY = 'foxitSlides.pendingPrompt';
const FILE_STORAGE_KEY = 'foxitSlides.pendingFile';
const INTENT_HIDDEN_KEY = 'foxitSlides.intentHidden';
const ATTACH_ACCEPT = '.txt,.md,.pdf,.doc,.docx,.ppt,.pptx';

/** Read a File as a data URL for the sessionStorage handoff. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ── image category picker — subject/domain that guides image generation ──
// Each `thumb` is a real library image representative of the category (the
// `[bracket]` prefix in its metadata.json prompt). `key` (the category key)
// is the value persisted in the payload as `imageCategory`; '' = off.
interface ImageCategory {
  key: string;
  label: string;
  thumb: string;
}
const IMAGE_CATEGORIES: ReadonlyArray<ImageCategory> = [
  { key: 'business-team', label: 'Business', thumb: '/library/images/img_mq63hq66_3ho1w.jpg' },
  { key: 'modern-office', label: 'Corporate', thumb: '/library/images/img_mq63hmmz_jx5io.jpg' },
  { key: 'technology', label: 'Technology', thumb: '/library/images/img_mq63hv5p_l44u8.jpg' },
  { key: 'healthcare-medical', label: 'Medical', thumb: '/library/images/img_mq63plhk_98kl6.jpg' },
  { key: 'finance-growth', label: 'Finance', thumb: '/library/images/img_mq63i6vo_fbk5c.jpg' },
  { key: 'marketing-content', label: 'Marketing', thumb: '/library/images/img_mq63rdov_6ucbk.jpg' },
  { key: 'education-learning', label: 'Education', thumb: '/library/images/img_mq63prhr_g2q4g.jpg' },
  { key: 'data-analytics', label: 'Data', thumb: '/library/images/img_mq63qhbk_dctsm.jpg' },
  { key: 'science-lab', label: 'Science', thumb: '/library/images/img_mq63ixnt_c9jju.jpg' },
  { key: 'creative-design', label: 'Creative', thumb: '/library/images/img_mq63irfi_codws.jpg' },
  { key: 'nature', label: 'Nature', thumb: '/library/images/img_mpmygdbm_8w3hb.png' },
  { key: 'abstract-gradient', label: 'Abstract', thumb: '/library/images/img_mq63h01s_1kfys.jpg' },
];

interface PendingPrompt {
  prompt: string;
  type: string;
  audience: string;
  tone: string;
  detail: Detail;
  voice: string;
  treat: TreatMode;
  cardCount: number;
  autoImages: boolean;
  imageCategory: string;
  theme: string;
}

// ── inference rules: keyword → inferred un-pinned facets ──
interface InferRule {
  re: RegExp;
  type?: string;
  audience?: string;
  tone?: string;
  detail?: Detail;
  voice?: string;
}
const RULES: ReadonlyArray<InferRule> = [
  { re: /\b(investor|pitch|series [a-d]|seed|vc|raise|funding|valuation)\b/i, type: 'pitch deck', audience: 'Investors', tone: 'Confident' },
  { re: /\b(board|exec|leadership|c-suite|qbr|quarterly review)\b/i, type: 'business review', audience: 'Executives', tone: 'Authoritative' },
  { re: /\b(engineer|technical|architecture|api|infra|developer)\b/i, audience: 'Engineers', tone: 'Technical', voice: 'Technical' },
  { re: /\b(customer|client|prospect|sales|demo)\b/i, type: 'sales deck', audience: 'Customers', tone: 'Persuasive' },
  { re: /\b(student|class|course|lesson|teach|workshop|onboarding|new hire)\b/i, type: 'training deck', audience: 'Students', tone: 'Educational', voice: 'Educational', detail: 'Extensive' },
  { re: /\b(public|launch|announce|keynote|community)\b/i, type: 'product launch', audience: 'General public', tone: 'Inspirational' },
  { re: /\b(quick|brief|short|one-pager|tl;?dr|lightning|5[- ]?min)\b/i, detail: 'Concise' },
  { re: /\b(deep dive|comprehensive|in-?depth|detailed|thorough|full report|whitepaper)\b/i, detail: 'Extensive' },
  { re: /\b(legal|contract|compliance|nda|terms)\b/i, voice: 'Legal', tone: 'Authoritative' },
  { re: /\b(financial|revenue|earnings|p&l|budget|forecast)\b/i, voice: 'Financial', tone: 'Authoritative' },
  { re: /\b(research|study|findings|hypothesis|methodology)\b/i, type: 'report', voice: 'Research' },
  { re: /\b(report|recap|summary|results|metrics)\b/i, type: 'report' },
  { re: /\b(roadmap|strategy|vision|okrs?)\b/i, type: 'strategy deck' },
  { re: /\b(proposal|rfp|bid|statement of work|sow)\b/i, type: 'proposal' },
  { re: /\b(marketing|campaign|brand|go-to-market|gtm)\b/i, type: 'marketing strategy' },
];

interface Inferred {
  type: string;
  audience: string;
  tone: string;
  detail: Detail;
  voice: string;
}

/** Pure inference: derive un-pinned facet values from the prompt text.
 *  Pinned facets keep their current value; everything else resets to default
 *  then is overridden by any matching rule (later rules win per-facet). */
function inferFacets(
  text: string,
  pinned: Record<FacetKey, boolean>,
  current: Inferred,
): Inferred {
  const next: Inferred = {
    type: pinned.type ? current.type : DEFAULT_TYPE,
    audience: pinned.audience ? current.audience : DEFAULT_AUDIENCE,
    tone: pinned.tone ? current.tone : DEFAULT_TONE,
    detail: pinned.detail ? current.detail : 'Detailed',
    voice: pinned.voice ? current.voice : 'Default',
  };
  if (!text.trim()) return next;
  for (const r of RULES) {
    if (!r.re.test(text)) continue;
    if (r.type && !pinned.type) next.type = r.type;
    if (r.audience && !pinned.audience) next.audience = r.audience;
    if (r.tone && !pinned.tone) next.tone = r.tone;
    if (r.detail && !pinned.detail) next.detail = r.detail;
    if (r.voice && !pinned.voice) next.voice = r.voice;
  }
  return next;
}

// facet icons for the popover head
const FACET_ICON: Record<FacetKey, React.ReactNode> = {
  type: (
    <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" /><line x1="8.5" y1="8" x2="15.5" y2="8" strokeLinecap="round" /><line x1="8.5" y1="12" x2="15.5" y2="12" strokeLinecap="round" /><line x1="8.5" y1="16" x2="12.5" y2="16" strokeLinecap="round" /></svg>
  ),
  audience: (
    <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" /><circle cx="17.5" cy="8.5" r="2.4" /><path d="M16 13.4a4.6 4.6 0 0 1 4.5 4.6" strokeLinecap="round" /></svg>
  ),
  tone: (
    <svg viewBox="0 0 24 24"><path d="M4 14c0-5 3.5-9 8-9s8 4 8 9" strokeLinecap="round" /><path d="M7 14a3 3 0 0 1-3 3M17 14a3 3 0 0 0 3 3" strokeLinecap="round" /></svg>
  ),
  detail: (
    <svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7" strokeLinecap="round" /><line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" /><line x1="4" y1="17" x2="14" y2="17" strokeLinecap="round" /></svg>
  ),
  voice: (
    <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" /></svg>
  ),
  treat: (
    <svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z" strokeLinejoin="round" /><path d="M11 7l6 6" /></svg>
  ),
};
const FACET_LABEL: Record<FacetKey, string> = {
  type: 'Type',
  audience: 'Audience',
  tone: 'Tone',
  detail: 'Detail level',
  voice: 'Voice',
  treat: 'How to treat my text',
};

export default function GenerationPrompt() {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  // Attached source document (Phase E source ingestion). Carried to the editor
  // via sessionStorage (base64) alongside the prompt; the editor reconstructs
  // it and runs the source-grounded build.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [focused, setFocused] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── facet state (source of truth for the Generate payload) ──
  const [type, setType] = useState(DEFAULT_TYPE);
  const [audience, setAudience] = useState(DEFAULT_AUDIENCE);
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [detail, setDetail] = useState<Detail>('Detailed');
  const [voice, setVoice] = useState('Default');
  const [treat, setTreat] = useState<TreatMode>('inspire');
  // generation settings (mirror the creator). Images default OFF (opt-in) per PM.
  // Slide count: 0 = AUTO (the AI/plan agent picks an adaptive count from the
  // content). Auto is the DEFAULT (Lisa 2026-06-30) — mirrors the Themes
  // "Auto" state next to it. Stepping below 1 lands on Auto; the route maps
  // 0 → undefined → adaptive.
  const [cardCount, setCardCount] = useState(0);
  // image category guides image generation; '' = off. autoImages is DERIVED.
  const [imageCategory, setImageCategory] = useState('');
  const autoImages = imageCategory !== '';
  // explicit picks pin a facet so live inference won't override it.
  const [pinned, setPinned] = useState<Record<FacetKey, boolean>>({
    type: false, audience: false, tone: false, detail: false, voice: false, treat: false,
  });

  // a facet whose inferred value just changed flashes once.
  const [flashed, setFlashed] = useState<Set<FacetKey>>(new Set());
  const [inferring, setInferring] = useState(false);
  const inferTimer = useRef<number | null>(null);

  // hide/show the intent line — persisted in localStorage. Default = shown.
  const [intentHidden, setIntentHidden] = useState(false);

  // open popover anchored to a facet span.
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const spanRefs = useRef<Partial<Record<FacetKey, HTMLButtonElement | null>>>({});
  // mounted gate so the body-portaled popover only renders client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  // ── image-category popover (separate from the facet popover) ──
  const [imgOpen, setImgOpen] = useState(false);
  const imgBtnRef = useRef<HTMLButtonElement>(null);
  const imgPopRef = useRef<HTMLDivElement>(null);
  const [imgPopPos, setImgPopPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  // ── theme picker — opens the shared ThemesModal (same as the editor's
  //    re-skin), so the home card shows the 3-slide preview. '' = Auto default. ──
  const [themeId, setThemeId] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  // cycling ghost example.
  const [exIdx, setExIdx] = useState(0);
  const [ghostFading, setGhostFading] = useState(false);

  const hasText = text.trim().length > 0;
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // restore the hide preference once on mount.
  useEffect(() => {
    try {
      setIntentHidden(localStorage.getItem(INTENT_HIDDEN_KEY) === '1');
    } catch {
      /* localStorage may be unavailable; default shown */
    }
  }, []);

  const setHidden = useCallback((hidden: boolean) => {
    setIntentHidden(hidden);
    if (hidden) setOpenFacet(null);
    try {
      localStorage.setItem(INTENT_HIDDEN_KEY, hidden ? '1' : '0');
    } catch {
      /* ignore persistence failure */
    }
  }, []);

  // ── live inference as the user types ──
  useEffect(() => {
    const current: Inferred = { type, audience, tone, detail, voice };
    const next = inferFacets(text, pinned, current);
    const changes = new Set<FacetKey>();
    if (next.type !== type) { setType(next.type); changes.add('type'); }
    if (next.audience !== audience) { setAudience(next.audience); changes.add('audience'); }
    if (next.tone !== tone) { setTone(next.tone); changes.add('tone'); }
    if (next.detail !== detail) { setDetail(next.detail); changes.add('detail'); }
    if (next.voice !== voice) { setVoice(next.voice); changes.add('voice'); }
    if (changes.size > 0) {
      setFlashed(changes);
      setInferring(true);
      if (inferTimer.current) window.clearTimeout(inferTimer.current);
      inferTimer.current = window.setTimeout(() => {
        setInferring(false);
        setFlashed(new Set());
      }, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inference reacts to `text` + `pinned` only; facet values are read, not deps.
  }, [text, pinned]);

  useEffect(() => () => {
    if (inferTimer.current) window.clearTimeout(inferTimer.current);
  }, []);

  // cycle the ghost example every 3.2s while empty + idle.
  useEffect(() => {
    if (hasText || generating) return;
    const iv = window.setInterval(() => {
      if (reducedMotion.current) {
        setExIdx((i) => (i + 1) % EXAMPLES.length);
        return;
      }
      setGhostFading(true);
      window.setTimeout(() => {
        setExIdx((i) => (i + 1) % EXAMPLES.length);
        setGhostFading(false);
      }, 420);
    }, 3200);
    return () => window.clearInterval(iv);
  }, [hasText, generating]);

  const autosize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    // Grow to fit content, but CAP it — a large paste used to expand the box to
    // its full content height and swallow the screen. Beyond the cap it scrolls.
    const cap = Math.max(200, Math.round(window.innerHeight * 0.4));
    const next = Math.min(cap, Math.max(84, ta.scrollHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > cap ? 'auto' : 'hidden';
  }, []);
  useEffect(() => { autosize(); }, [text, autosize]);

  // ── popover positioning (anchored under the tapped span) ──
  const positionPop = useCallback((facet: FacetKey) => {
    const span = spanRefs.current[facet];
    const pop = popRef.current;
    if (!span || !pop) return;
    const r = span.getBoundingClientRect();
    const popW = pop.offsetWidth || 296;
    let left = window.scrollX + r.left;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - popW - 16;
    left = Math.min(left, maxLeft);
    left = Math.max(left, window.scrollX + 12);
    const top = window.scrollY + r.bottom + 10;
    setPopPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (openFacet) positionPop(openFacet);
  }, [openFacet, positionPop]);

  useEffect(() => {
    if (!openFacet) return;
    const reflow = () => positionPop(openFacet);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, { passive: true });
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow);
    };
  }, [openFacet, positionPop]);

  // dismiss on outside click / Escape.
  useEffect(() => {
    if (!openFacet) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if ((t as Element).closest?.('.hg-intent-span')) return;
      setOpenFacet(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenFacet(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openFacet]);

  const toggleFacet = useCallback((facet: FacetKey) => {
    setOpenFacet((cur) => (cur === facet ? null : facet));
  }, []);

  // ── image-category popover positioning (anchored under the Images button) ──
  const positionImgPop = useCallback(() => {
    const btn = imgBtnRef.current;
    const pop = imgPopRef.current;
    if (!btn || !pop) return;
    const r = btn.getBoundingClientRect();
    const popW = pop.offsetWidth || 296;
    let left = window.scrollX + r.left;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - popW - 16;
    left = Math.min(left, maxLeft);
    left = Math.max(left, window.scrollX + 12);
    const top = window.scrollY + r.bottom + 10;
    setImgPopPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (imgOpen) positionImgPop();
  }, [imgOpen, positionImgPop]);

  useEffect(() => {
    if (!imgOpen) return;
    const reflow = () => positionImgPop();
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, { passive: true });
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow);
    };
  }, [imgOpen, positionImgPop]);

  useEffect(() => {
    if (!imgOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (imgPopRef.current?.contains(t)) return;
      if (imgBtnRef.current?.contains(t)) return;
      setImgOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImgOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [imgOpen]);

  const pickImageCategory = useCallback((key: string) => {
    setImageCategory(key);
    setImgOpen(false);
  }, []);

  // Toggle switch: on → a sensible default style (first category); off → ''.
  const toggleImages = useCallback(() => {
    setImageCategory((c) => (c ? '' : IMAGE_CATEGORIES[0].key));
  }, []);

  const activeImgCat = IMAGE_CATEGORIES.find((c) => c.key === imageCategory);

  const activeTheme = THEMES.find((t) => t.id === themeId);

  // pinning helpers — an explicit pick sets the value AND pins the facet.
  const pinType = (v: string) => { setType(v); setPinned((p) => ({ ...p, type: true })); setOpenFacet(null); };
  const pinAudience = (v: string) => { setAudience(v); setPinned((p) => ({ ...p, audience: true })); setOpenFacet(null); };
  const pinTone = (v: string) => { setTone(v); setPinned((p) => ({ ...p, tone: true })); setOpenFacet(null); };
  const pinDetail = (v: Detail) => { setDetail(v); setPinned((p) => ({ ...p, detail: true })); setOpenFacet(null); };
  const pinVoice = (v: string) => { setVoice(v); setPinned((p) => ({ ...p, voice: true })); setOpenFacet(null); };
  const pinTreat = (v: TreatMode) => { setTreat(v); setPinned((p) => ({ ...p, treat: true })); setOpenFacet(null); };

  const doGenerate = useCallback(async () => {
    const prompt = text.trim();
    if (!prompt || generating) return;

    const payload: PendingPrompt = { prompt, type, audience, tone, detail, voice, treat, cardCount, autoImages, imageCategory, theme: themeId };
    try {
      sessionStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage can throw in private mode; navigation still proceeds.
    }

    // Carry an attached source doc to the editor (base64 in sessionStorage).
    // The editor reconstructs it and runs the source-grounded build. On any
    // failure (read error / storage quota for a large file) we fall back to a
    // prompt-only generation rather than blocking.
    try {
      if (attachedFile) {
        const data = await fileToDataUrl(attachedFile);
        sessionStorage.setItem(FILE_STORAGE_KEY, JSON.stringify({ name: attachedFile.name, type: attachedFile.type, data }));
      } else {
        sessionStorage.removeItem(FILE_STORAGE_KEY);
      }
    } catch {
      try { sessionStorage.removeItem(FILE_STORAGE_KEY); } catch { /* ignore */ }
    }

    setOpenFacet(null);
    setImgOpen(false);
    setGenerating(true);
    // Navigate STRAIGHT to the editor — it shows the approved "Creating a
    // presentation" loader (DraftingOverlay) while it generates. No in-prompt
    // animation: the orb + cycling-steps card was a duplicate of that loader.
    // Full navigation (not router.push) so /editor/slides remounts and its
    // mount effect consumes the sessionStorage handoff + auto-generates.
    //
    // The prompt rides in sessionStorage (PROMPT_STORAGE_KEY) — the editor reads
    // it there, NOT from the URL. Do NOT put the prompt in the query string: a
    // long pasted prompt makes a multi-KB URL the dev server rejects (431
    // Request Header Too Large), which surfaced as "can't paste a long prompt".
    window.location.assign('/editor/slides');
  }, [text, type, audience, tone, detail, voice, treat, cardCount, autoImages, imageCategory, themeId, generating, attachedFile]);

  const onTaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && text.trim().length === 0) {
      e.preventDefault();
      setText(EXAMPLES[exIdx]);
      requestAnimationFrame(() => taRef.current?.focus());
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasText) {
      e.preventDefault();
      doGenerate();
    }
  };

  const promptClass = [
    'hg-prompt',
    hasText ? 'has-text' : '',
  ].filter(Boolean).join(' ');

  // ── derived display strings for the intent sentence ──
  const typeText = type.toLowerCase();
  const audienceText = audience === DEFAULT_AUDIENCE ? DEFAULT_AUDIENCE : audience.toLowerCase();
  const toneText = tone.toLowerCase();
  const toneArticle = /^[aeiou]/i.test(toneText) ? ' in an ' : ' in a ';
  const detailText = detail.toLowerCase();
  // user-imperative lead-in keyed off the TYPE word ("Write a pitch deck…" /
  // "Write an internal report…").
  const leadIn = /^[aeiou]/i.test(typeText) ? 'Write an ' : 'Write a ';
  const treatText = TREAT_OPTS.find((o) => o.id === treat)?.span ?? '';

  const spanCls = (f: FacetKey) =>
    [
      'hg-intent-span',
      openFacet === f ? 'is-open' : '',
      flashed.has(f) ? 'just-changed' : '',
    ].filter(Boolean).join(' ');

  const registerSpan = (f: FacetKey) => (el: HTMLButtonElement | null) => {
    spanRefs.current[f] = el;
  };

  return (
    <div className={`hg-card${focused ? ' is-focused' : ''}`}>
      <div className={promptClass}>
        {/* Field + cycling ghost example */}
        <div className="hg-field">
          <div className={`hg-ghost${hasText ? ' is-hidden' : ''}`} aria-hidden="true">
            <span className="lead">Try &ldquo;</span>
            <span className="hg-ghost-cycle" style={{ opacity: ghostFading ? 0 : 1 }}>
              {EXAMPLES[exIdx]}
            </span>
            <span className="lead">&rdquo;</span>
            <span className="hg-tabhint">
              <span className="hg-tkbd">Tab</span>
              <span className="hg-ttxt">to use</span>
            </span>
          </div>
          <textarea
            ref={taRef}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onTaKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Describe the deck you want to create"
          />
        </div>

        {/* Action row */}
        <div className="hg-actionrow">
          <div className="hg-actions-left">
            <input
              ref={fileRef}
              type="file"
              accept={ATTACH_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => { setAttachedFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
            />
            {attachedFile ? (
              <span className="hg-tool" aria-label={`Attached: ${attachedFile.name}`} title={attachedFile.name} style={{ maxWidth: '220px' }}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => setAttachedFile(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px', color: 'inherit' }}
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
                </button>
              </span>
            ) : (
              <button className="hg-tool" type="button" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Attach
              </button>
            )}

            {/* Slide-count stepper (16:9 is the only format, so it's implied).
                0 = Auto (AI picks the count). Stepping below 1 lands on Auto. */}
            <div className="hg-tool hg-stepper" role="group" aria-label={cardCount === 0 ? 'Auto slide count' : `${cardCount} slides`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 20h18" strokeLinecap="round" />
              </svg>
              <button
                type="button"
                className="hg-step"
                aria-label="Fewer slides"
                onClick={() => setCardCount((c) => Math.max(0, c - 1))}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" /></svg>
              </button>
              <span className="hg-step-n">{cardCount === 0 ? 'Auto' : cardCount}</span>
              <button
                type="button"
                className="hg-step"
                aria-label="More slides"
                onClick={() => setCardCount((c) => Math.min(30, c + 1))}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" /><line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Images — a toggle switch (on/off); the label opens the style picker. */}
            <div className={`hg-tool hg-img-tool${autoImages ? ' is-on' : ''}`}>
              <button
                ref={imgBtnRef}
                type="button"
                className="hg-img-open"
                aria-haspopup="dialog"
                aria-expanded={imgOpen}
                aria-label="Image style"
                onClick={() => setImgOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M5 18l5-5 4 4 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Images
                {autoImages && <span className="hg-val">· {activeImgCat?.label ?? imageCategory}</span>}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={autoImages}
                aria-label="Turn images on or off"
                className="hg-switch"
                onClick={toggleImages}
              >
                <span className="hg-switch-knob" aria-hidden="true" />
              </button>
            </div>

            {/* Themes — opens a swatch picker. '' = Auto (engine default). */}
            <button
              ref={themeBtnRef}
              type="button"
              className={`hg-tool hg-toggle${themeId ? ' is-on' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={themeOpen}
              aria-label="Theme"
              onClick={() => setThemeOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <circle cx="8.4" cy="9.6" r="1.25" fill="currentColor" stroke="none" />
                <circle cx="15.6" cy="9.6" r="1.25" fill="currentColor" stroke="none" />
                <circle cx="9.2" cy="15.2" r="1.25" fill="currentColor" stroke="none" />
              </svg>
              Themes <span className="hg-val">· {activeTheme ? activeTheme.name : 'Auto'}</span>
            </button>

            {/* Restore affordance — only when the intent line is hidden. */}
            {intentHidden && (
              <button
                className="hg-intent-restore"
                type="button"
                onClick={() => setHidden(false)}
                aria-label="Show intent"
                title="Show intent"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>

          <div className="hg-actions-right">
            <button className="hg-generate" type="button" disabled={!hasText} onClick={doGenerate}>
              <svg className="hg-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.5l1.7 5.1a3 3 0 0 0 1.9 1.9L20.7 11l-5.1 1.7a3 3 0 0 0-1.9 1.9L12 19.5l-1.7-5.1a3 3 0 0 0-1.9-1.9L3.3 11l5.1-1.7a3 3 0 0 0 1.9-1.9z" />
              </svg>
              Generate
            </button>
          </div>
        </div>

        {/* ★ THE INTENT LINE — confirm, don't configure. Hideable. */}
        {!intentHidden && (
          <div className={`hg-intent${inferring ? ' is-inferring' : ''}`}>
            <button
              className="hg-intent-collapse"
              type="button"
              onClick={() => setHidden(true)}
              aria-label="Collapse"
              title="Collapse"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <p className="hg-intent-line">
              <span className="glue">{leadIn}</span>
              <button
                ref={registerSpan('type')}
                className={spanCls('type')}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openFacet === 'type'}
                onClick={() => toggleFacet('type')}
              >
                {typeText}
              </button>
              <span className="glue"> for </span>
              <button
                ref={registerSpan('audience')}
                className={spanCls('audience')}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openFacet === 'audience'}
                onClick={() => toggleFacet('audience')}
              >
                {audienceText}
              </button>
              <span className="glue">, </span>
              <button
                ref={registerSpan('detail')}
                className={spanCls('detail')}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openFacet === 'detail'}
                onClick={() => toggleFacet('detail')}
              >
                {detailText}
              </button>
              <span className="glue">,{toneArticle}</span>
              <button
                ref={registerSpan('tone')}
                className={spanCls('tone')}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openFacet === 'tone'}
                onClick={() => toggleFacet('tone')}
              >
                {toneText}
              </button>
              <span className="glue"> tone, </span>
              <button
                ref={registerSpan('treat')}
                className={spanCls('treat')}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openFacet === 'treat'}
                onClick={() => toggleFacet('treat')}
              >
                {treatText}
              </button>
              <span className="glue">.</span>
            </p>
          </div>
        )}
      </div>

      {/* ── the shared popover — portaled to <body> so the prompt card's
          overflow:hidden can't clip it and the document-coords positioning
          lines up (offset parent becomes <body>). ── */}
      {mounted &&
        createPortal(
          /* `home-gen` re-applies the --hg-* token scope: the popover is
             portaled to <body>, outside the .home-gen wrapper, so without it
             every var() (icon stroke, borders, accent, radii) falls back to
             its initial value (e.g. stroke:none → invisible glyphs). */
          <div
            ref={popRef}
            className={`home-gen hg-pop${openFacet ? ' is-open' : ''}`}
            role="dialog"
            aria-modal={false}
            aria-label={openFacet ? `Adjust ${FACET_LABEL[openFacet]}` : 'Adjust facet'}
            style={{ left: popPos.left, top: popPos.top }}
          >
        {openFacet && (
          <>
            <div className="hg-pop-head">
              <span className="hg-ph-ic" aria-hidden="true">{FACET_ICON[openFacet]}</span>
              <span className="hg-ph-label">{FACET_LABEL[openFacet]}</span>
            </div>

            {openFacet === 'type' && (
              <FreetextBody
                value={type}
                isDefault={type === DEFAULT_TYPE}
                placeholder="Type your own…"
                suggestions={TYPE_SUGGEST}
                onPick={pinType}
              />
            )}
            {openFacet === 'audience' && (
              <FreetextBody
                value={audience}
                isDefault={audience === DEFAULT_AUDIENCE}
                placeholder="Type your own…"
                suggestions={AUDIENCE_SUGGEST}
                onPick={pinAudience}
              />
            )}
            {openFacet === 'tone' && (
              <FreetextBody
                value={tone}
                isDefault={tone === DEFAULT_TONE}
                placeholder="Type your own…"
                suggestions={TONE_SUGGEST}
                onPick={pinTone}
              />
            )}
            {openFacet === 'detail' && (
              <div className="hg-pop-density" role="radiogroup" aria-label="Detail level">
                {DETAIL_VIS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={detail === o.v}
                    className={`hg-density-tile${detail === o.v ? ' is-sel' : ''}`}
                    onClick={() => pinDetail(o.v)}
                  >
                    <span className="hg-density-ic">
                      <DensityIcon lines={o.lines} />
                    </span>
                    <span className="hg-density-lbl">{o.v}</span>
                  </button>
                ))}
              </div>
            )}
            {openFacet === 'voice' && (
              <div className="hg-pop-list" role="listbox" aria-label="Voice">
                {VOICE_OPTS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="option"
                    aria-selected={voice === o.v}
                    className={`hg-pop-opt${voice === o.v ? ' is-sel' : ''}`}
                    onClick={() => pinVoice(o.v)}
                  >
                    <span className="opt-body">
                      {o.v}
                      <span className="opt-sub">{o.sub}</span>
                    </span>
                    <span className="opt-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {openFacet === 'treat' && (
              <div className="hg-pop-list" role="listbox" aria-label="How to treat my text">
                {TREAT_OPTS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={treat === o.id}
                    className={`hg-pop-opt${treat === o.id ? ' is-sel' : ''}`}
                    onClick={() => pinTreat(o.id)}
                  >
                    <span className="opt-body">
                      {o.label}
                      <span className="opt-sub">{o.sub}</span>
                    </span>
                    <span className="opt-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
          </div>,
          document.body,
        )}

      {/* ── image-category popover — portaled to <body>; the `home-gen`
          class re-applies the --hg-* token scope (same reason as the facet
          popover above — without it every var() falls back to its initial
          value). ── */}
      {mounted &&
        createPortal(
          <div
            ref={imgPopRef}
            className={`home-gen hg-imgpop${imgOpen ? ' is-open' : ''}`}
            role="dialog"
            aria-modal={false}
            aria-label="Choose an image style"
            style={{ left: imgPopPos.left, top: imgPopPos.top }}
          >
            {imgOpen && (
              <>
                <div className="hg-pop-head">
                  <span className="hg-ph-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M5 18l5-5 4 4 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span className="hg-ph-label">Image style</span>
                </div>

                {/* Library styles — brick / masonry, a mix across categories. */}
                <div className="hg-imgpop-grid" role="listbox" aria-label="Image style">
                  {IMAGE_CATEGORIES.map((c) => {
                    const sel = imageCategory === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="option"
                        aria-selected={sel}
                        className={`hg-imgtile${sel ? ' is-sel' : ''}`}
                        onClick={() => pickImageCategory(c.key)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail, lazy-loaded */}
                        <img className="hg-imgtile-img" src={c.thumb} alt="" loading="lazy" />
                        <span className="hg-imgtile-cap">{c.label}</span>
                        {sel && (
                          <span className="hg-imgtile-check" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}

      {/* ── theme picker — reuse the editor's ThemesModal (3-slide preview +
          the full selectable-theme set), opened from the Themes button. ── */}
      <ThemesModal
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        activeThemeId={themeId}
        onApply={(t) => setThemeId(t.id)}
      />
    </div>
  );
}

/** Free-text picker body (Audience / Tone): a "type your own" input that commits
 *  on Enter, plus one-tap suggestion chips. Selecting either pins the facet. */
/** A slide-shaped glyph with N evenly-spaced lines — visual density for the
 *  Detail facet (first line shorter, reads as a title). */
function DensityIcon({ lines }: { lines: number }) {
  const top = 6.5;
  const bottom = 15.5;
  const ys = Array.from({ length: lines }, (_, i) =>
    lines === 1 ? (top + bottom) / 2 : top + (i * (bottom - top)) / (lines - 1),
  );
  return (
    <svg viewBox="0 0 28 22" aria-hidden="true">
      <rect x="2.5" y="2.5" width="23" height="17" rx="2.5" />
      {ys.map((y, i) => (
        <line key={i} x1="6" y1={y} x2={i === 0 ? 17 : 22} y2={y} strokeLinecap="round" />
      ))}
    </svg>
  );
}

function FreetextBody({
  value,
  isDefault,
  placeholder,
  suggestions,
  onPick,
}: {
  value: string;
  isDefault: boolean;
  placeholder: string;
  suggestions: readonly string[];
  onPick: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(isDefault ? '' : value);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const commit = () => {
    const v = draft.trim();
    if (v) onPick(v);
  };

  return (
    <>
      <div className="hg-pop-input-wrap">
        <input
          ref={inputRef}
          className="hg-pop-input"
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
          }}
        />
      </div>
      <div className="hg-pop-suggest-label">Suggestions</div>
      <div className="hg-pop-grid">
        {suggestions.map((s) => {
          const sel = !isDefault && value.toLowerCase() === s.toLowerCase();
          return (
            <button
              key={s}
              type="button"
              className={`hg-pop-opt chip${sel ? ' is-sel' : ''}`}
              onClick={() => onPick(s)}
            >
              <span className="opt-body">{s}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
