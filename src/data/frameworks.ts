// Presentation templates — each defines a use-case-specific slide-type
// sequence that guides both AI generation and the user's editing. Each
// step carries a layout directive telling the AI exactly what visual
// shape to produce, not just what topic to cover. The step `title` is
// the visible slide-type label (Cover / Problem Framing / Solution
// Overview / Feature Breakdown / etc.) and is shown to the user during
// outline review.
//
// Each step also carries a `tier` (required / recommended / optional)
// so the wizard can scale the slide list to the user's chosen card
// count: required slides are always present, recommended fill toward
// the default count, optional slides are picked up only when the user
// dials the count higher than the default. See getStepsForCount() for
// the algorithm.

import type { SkillId } from '@/lib/document-skills';

export type CardLayoutType = 'single' | 'split-left' | 'split-right' | 'three-col';

/**
 * Layout key consumed by FrameworkThumbnail (the SVG infographic preview
 * shown in gallery tiles). Each framework picks the schematic that best
 * mirrors the kind of slide content it produces:
 *   chart    — analytics/metrics-heavy decks (reviews, pitches, financials)
 *   timeline — sequenced milestones (roadmaps, plans, post-mortems)
 *   grid     — multi-item enumerations (team intros, onboarding, frameworks)
 *   story    — image + caption + bullets (launches, narratives, recaps)
 */
export type ThumbnailLayout = 'chart' | 'timeline' | 'grid' | 'story';
export type BlockTemplate =
  | 'hero-title'           // Big heading + subtitle + labels
  | 'paragraph-content'    // Heading + paragraphs
  | 'grid-2x2'             // 4 icon+heading+body cells
  | 'grid-1x3'             // 3 icon+heading+body cells
  | 'grid-1x4'             // 4 icon+heading+body cells in a row
  | 'timeline'             // Numbered vertical timeline
  | 'icon-list'            // Vertical list with icons
  | 'bullet-list'          // Heading + bullet items
  | 'toggles'              // Expandable sections
  | 'callout-list'         // List items + callout box
  | 'cta-closing';         // Heading + bullets + button

/**
 * Slide tier determines whether a step is included for a given card count:
 *   - required:    always present (the floor — card count can't go below
 *                  the count of required steps)
 *   - recommended: included when card count >= required count + 1 etc.,
 *                  in declared order, until the count is met
 *   - optional:    only added when the user dials the count above the
 *                  required + recommended length
 */
export type SlideTier = 'required' | 'recommended' | 'optional';

export interface FrameworkStep {
  title: string;
  purpose: string;
  layout: CardLayoutType;
  blockTemplate: BlockTemplate;
  tier: SlideTier;
  contentBudget: {
    headingLevel: 1 | 2 | 3;
    maxItems?: number;         // For grids, lists, timelines — how many items
    itemMaxWords?: number;     // Max words per item body
    bodyMaxWords?: number;     // Max words for paragraph body
    includeLabels?: boolean;   // Add label-group
    includeCallout?: boolean;  // Add callout box
  };
}

export interface Framework {
  id: string;
  name: string;
  description: string;
  category: FrameworkCategory;
  steps: FrameworkStep[];
  /**
   * A concrete sample prompt used to demonstrate what the template
   * produces with real content. Surfaced as a starter when relevant.
   */
  samplePrompt: string;
  /**
   * Legacy field — was used for a curated stock photo URL. As of 2026-05-16
   * the cards gallery renders an inline SVG infographic via
   * FrameworkThumbnail instead (driven by `thumbnailLayout` + `category`).
   * Kept on the type only for the home CreateModal entry points that haven't
   * been migrated yet. New frameworks should leave this unset.
   */
  thumbnailUrl?: string;
  /**
   * Picks which infographic-style schematic the FrameworkThumbnail SVG
   * renders for this framework's tile. See ThumbnailLayout for the four
   * options. Required so every framework has a topic-appropriate preview.
   */
  thumbnailLayout: ThumbnailLayout;
  /**
   * 3 alternative topic prompts shown in the wizard as clickable chips when
   * this framework is selected. Replaces the generic 10-topic "Inspire Me"
   * button so suggestions are scoped to the chosen template.
   */
  inspireTopics: string[];
  /**
   * Default Skill applied to the Generate stage when this framework is
   * picked. Drives the prose voice (persuasive / executive / legal / etc.)
   * The user can override via the Voice picker in the Customize popover.
   * `null` means no voice bias — generic generation.
   * Skill catalogue in `app/src/lib/document-skills.ts`.
   */
  defaultSkillId?: SkillId | null;
}

export type FrameworkCategory =
  | 'go-to-market'     // Business
  | 'educational'      // Education
  | 'storytelling';    // Personal

export const CATEGORIES: { id: FrameworkCategory; label: string; icon: string }[] = [
  { id: 'go-to-market', label: 'Business', icon: '◆' },
  { id: 'educational', label: 'Education', icon: '◎' },
  { id: 'storytelling', label: 'Personal', icon: '●' },
];

export const FRAMEWORKS: Framework[] = [
  // ── Business / Go-to-Market ─────────────────────────────────────────────
  {
    id: 'product-launch',
    defaultSkillId: 'persuasive',
    name: 'Product Launch',
    description: 'Announce a new product or feature with the why, the what, and the how.',
    category: 'go-to-market',
    thumbnailLayout: 'story',
    samplePrompt: 'Launch our new AI-powered code review tool to help engineering teams ship faster',
    inspireTopics: [
      'A new product or feature announcement for existing customers',
      'A first-time reveal of something we’re shipping next quarter',
      'A relaunch of an existing product with new positioning and pricing',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Launch headline + tagline + audience labels', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 25, includeLabels: true } },
      { title: 'Problem Framing', tier: 'required', purpose: 'The customer pain this launch addresses', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60 } },
      { title: 'Solution Overview', tier: 'required', purpose: 'How this product solves it, in one screen', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50, includeCallout: true } },
      { title: 'Feature Breakdown', tier: 'recommended', purpose: 'The four flagship capabilities', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Technical Implementation', tier: 'recommended', purpose: 'Architecture and how it scales', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 20 } },
      { title: 'Go-to-Market Plan', tier: 'recommended', purpose: 'Launch channels, audiences, and milestones', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 15 } },
      { title: 'Roadmap & Next Steps', tier: 'recommended', purpose: 'What ships next + how to get involved', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Customer Use Cases', tier: 'optional', purpose: 'Three example customers and how they\'ll use this', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Demo Walkthrough', tier: 'optional', purpose: 'Step-by-step product flow', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Pricing & Plans', tier: 'optional', purpose: 'Tiers and what each includes', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
    ],
  },
  {
    id: 'sales-pitch',
    defaultSkillId: 'persuasive',
    name: 'Sales Pitch',
    thumbnailLayout: 'story',
    description: 'Win a prospect — frame their pain, present your solution, prove value, ask for the deal.',
    category: 'go-to-market',
    samplePrompt: 'Pitch our enterprise CRM to a 500-person SaaS company evaluating four vendors',
    inspireTopics: [
      'A first-meeting pitch to a prospect we’ve never met',
      'A renewal or expansion conversation with an existing customer',
      'A competitive pitch where we’re up against incumbents',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Hook the buyer with a tailored opening', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'Customer Challenges', tier: 'required', purpose: 'The specific pains the buyer faces today', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Our Solution', tier: 'required', purpose: 'How we solve those exact pains', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Differentiators', tier: 'recommended', purpose: 'Why us over the alternatives', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Case Study', tier: 'recommended', purpose: 'A peer customer’s outcomes', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 45, includeCallout: true } },
      { title: 'Pricing & Plans', tier: 'recommended', purpose: 'How they buy and what each tier includes', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Next Steps', tier: 'recommended', purpose: 'The single concrete ask for the deal', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 10 } },
      { title: 'ROI & Metrics', tier: 'optional', purpose: 'The numbers that justify the spend', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Onboarding Plan', tier: 'optional', purpose: 'How implementation will unfold', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'FAQ', tier: 'optional', purpose: 'Pre-empt the common objections', layout: 'single', blockTemplate: 'toggles', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 22 } },
    ],
  },
  {
    id: 'investor-pitch',
    defaultSkillId: 'persuasive',
    name: 'Investor Pitch',
    thumbnailLayout: 'chart',
    description: 'Raise capital — problem, solution, market, traction, business model, team, and the ask.',
    category: 'go-to-market',
    samplePrompt: 'Series A pitch for a B2B fintech startup with $1.2M ARR and 30% month-over-month growth',
    inspireTopics: [
      'A fundraising pitch for a pre-seed or seed round',
      'A growth-round pitch with real traction and a clear ask',
      'An update to existing investors plus warm intros for the next round',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Company name + one-line value prop', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 18, includeLabels: true } },
      { title: 'Problem', tier: 'required', purpose: 'The pain that exists in the market today', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Solution', tier: 'required', purpose: 'How the product solves that problem', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50 } },
      { title: 'The Ask', tier: 'required', purpose: 'How much, what it buys, and what comes next', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Market Size', tier: 'recommended', purpose: 'TAM / SAM / SOM with one number that matters', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Traction', tier: 'recommended', purpose: 'Growth, revenue, signups, retention — pick what wins', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Business Model', tier: 'recommended', purpose: 'How the company makes money', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 45 } },
      { title: 'Team', tier: 'recommended', purpose: 'Why this team wins this market', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Competition', tier: 'optional', purpose: 'Who else is in the space and where we win', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Use of Funds', tier: 'optional', purpose: 'Where the raise gets deployed', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Roadmap', tier: 'optional', purpose: 'The 12-month plan in milestones', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
    ],
  },
  {
    id: 'quarterly-review',
    defaultSkillId: 'financial',
    name: 'Quarterly Review',
    thumbnailLayout: 'chart',
    description: 'A QBR or end-of-quarter readout — what shipped, the metrics, and what comes next.',
    category: 'go-to-market',
    samplePrompt: 'Q4 review for the product team — three features shipped, NPS up 12 points, retention flat',
    inspireTopics: [
      'A quarter-end readout to leadership',
      'An end-of-year team review with metrics and wins',
      'A mid-quarter check-in covering pacing and risks',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Quarter and team identifier', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 18, includeLabels: true } },
      { title: 'Quarter at a Glance', tier: 'required', purpose: 'Two-sentence summary of the quarter', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50, includeCallout: true } },
      { title: 'Wins', tier: 'required', purpose: 'Standout outcomes worth celebrating', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'What We Shipped', tier: 'recommended', purpose: 'Major launches and deliverables', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Metrics', tier: 'recommended', purpose: 'The four numbers that mattered most', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 10 } },
      { title: 'Misses & Learnings', tier: 'recommended', purpose: 'Honest read on what didn’t work', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Next Quarter Priorities', tier: 'recommended', purpose: 'Top three goals for the next quarter', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Customer Highlights', tier: 'optional', purpose: 'Standout customer stories from the quarter', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Team Changes', tier: 'optional', purpose: 'New hires, departures, internal moves', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Strategic Pivots', tier: 'optional', purpose: 'Direction changes that shape next quarter', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50 } },
    ],
  },
  {
    id: 'marketing-strategy',
    defaultSkillId: 'persuasive',
    name: 'Marketing Strategy',
    thumbnailLayout: 'chart',
    description: 'A strategy doc — audience, positioning, channels, campaigns, and how success gets measured.',
    category: 'go-to-market',
    samplePrompt: 'Q1 2026 marketing strategy for a B2B SaaS launch into mid-market accounts',
    inspireTopics: [
      'An annual marketing plan with channels, audiences, and targets',
      'A go-to-market plan for entering a new segment or region',
      'A campaign-level strategy tied to a single launch or push',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Strategy name + period covered', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Audience', tier: 'required', purpose: 'The exact people we are marketing to', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Positioning', tier: 'required', purpose: 'How the brand shows up in their mind', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50, includeCallout: true } },
      { title: 'Channels', tier: 'recommended', purpose: 'Where we meet the audience', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Campaign Plan', tier: 'recommended', purpose: 'Sequenced moves across the period', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'KPIs', tier: 'recommended', purpose: 'How we know it worked', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 10 } },
      { title: 'Timeline', tier: 'recommended', purpose: 'Milestones and owners', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Budget Allocation', tier: 'optional', purpose: 'Spend split across channels', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 10 } },
      { title: 'Brand Voice', tier: 'optional', purpose: 'Tone, language patterns, do/don\'t', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Risks & Hedges', tier: 'optional', purpose: 'What could go sideways and the plan B', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
    ],
  },
  {
    id: 'team-update',
    defaultSkillId: 'executive',
    name: 'Team Update',
    thumbnailLayout: 'grid',
    description: 'A weekly or monthly update — highlights, progress, blockers, and what is next.',
    category: 'go-to-market',
    samplePrompt: 'Weekly engineering team update — sprint wrap, blockers, next sprint priorities',
    inspireTopics: [
      'A recurring team readout — ships, risks, next sprint',
      'A monthly all-hands or department-wide update',
      'An end-of-sprint demo and retro for the team',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Period and team name', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 18, includeLabels: true } },
      { title: 'Highlights', tier: 'required', purpose: 'The three headlines worth flagging', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Next Steps', tier: 'required', purpose: 'Top three priorities for the next period', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Progress', tier: 'recommended', purpose: 'What advanced since last update', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Numbers', tier: 'recommended', purpose: 'The four stats that matter this period', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 10 } },
      { title: 'Blockers', tier: 'recommended', purpose: 'What is in our way and what we need', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16, includeCallout: true } },
      { title: 'Customer Feedback', tier: 'optional', purpose: 'What users said this period', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Asks for Leadership', tier: 'optional', purpose: 'Decisions or unblocks needed from above', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Shoutouts', tier: 'optional', purpose: 'Recognize people who showed up', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
    ],
  },
  {
    id: 'project-brief',
    defaultSkillId: 'executive',
    name: 'Project Brief',
    thumbnailLayout: 'timeline',
    description: 'Kick off a project — background, objectives, scope, team, timeline, and risks.',
    category: 'go-to-market',
    samplePrompt: 'Migration project from a Rails monolith to Go microservices over six months',
    inspireTopics: [
      'A new project kickoff — scope, timeline, owners',
      'A multi-team initiative that needs alignment up front',
      'A short-cycle internal project with clear milestones',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Project name + sponsor + start date', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Background', tier: 'required', purpose: 'Why this project exists', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Objectives', tier: 'required', purpose: 'What success looks like — the three goals', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Scope', tier: 'recommended', purpose: 'In scope vs. explicitly out of scope', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Team & Roles', tier: 'recommended', purpose: 'Who does what', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Timeline', tier: 'recommended', purpose: 'Phase milestones across the engagement', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Risks & Mitigations', tier: 'recommended', purpose: 'What could derail us and the response', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14, includeCallout: true } },
      { title: 'Dependencies', tier: 'optional', purpose: 'External teams or systems we rely on', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Success Metrics', tier: 'optional', purpose: 'How we measure outcomes', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Stakeholder Map', tier: 'optional', purpose: 'Who needs to be informed vs. consulted', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
    ],
  },
  {
    id: 'strategy-brief',
    defaultSkillId: 'executive',
    name: 'Strategy Brief',
    thumbnailLayout: 'timeline',
    description: 'A strategic plan — context, goals, the strategy, key initiatives, metrics, and roadmap.',
    category: 'go-to-market',
    samplePrompt: '2026 strategy for expanding a developer tools company into European markets',
    inspireTopics: [
      'A multi-year company strategy or thesis',
      'A pivot or repositioning the team needs to align on',
      'A new-market or new-segment expansion plan',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Strategy name and horizon', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Context', tier: 'required', purpose: 'The market, customers, and competitive backdrop', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60 } },
      { title: 'Goals', tier: 'required', purpose: 'The three outcomes we are committing to', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Strategy', tier: 'recommended', purpose: 'The thesis — why this approach wins', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Key Initiatives', tier: 'recommended', purpose: 'The four bets we are funding', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Metrics', tier: 'recommended', purpose: 'How we will know it is working', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 10 } },
      { title: 'Roadmap', tier: 'recommended', purpose: 'Sequencing across the strategy horizon', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Assumptions', tier: 'optional', purpose: 'What we are betting must be true', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Trade-offs', tier: 'optional', purpose: 'What we are giving up to make this work', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Bets We Are Not Making', tier: 'optional', purpose: 'Adjacent options consciously deprioritized', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50 } },
    ],
  },
  {
    id: 'onboarding-deck',
    defaultSkillId: 'hr',
    name: 'Onboarding Deck',
    thumbnailLayout: 'grid',
    description: 'Welcome new hires — mission, structure, tools, first 30 days, and resources.',
    category: 'go-to-market',
    samplePrompt: 'Onboarding deck for new software engineers joining the platform team',
    inspireTopics: [
      'A first-week orientation for a new hire',
      'A 30-day plan for someone joining a specific team',
      'A welcome pack covering tools, people, and priorities',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Welcome the new hire by name', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'Welcome', tier: 'required', purpose: 'A warm note from leadership', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Mission & Values', tier: 'required', purpose: 'What the company exists to do and how it behaves', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Org Structure', tier: 'recommended', purpose: 'How the team is organized', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Tools', tier: 'recommended', purpose: 'Systems they will live in day to day', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'First 30 Days', tier: 'recommended', purpose: 'A clear week-by-week plan', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Resources', tier: 'recommended', purpose: 'Where to find help and links', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Benefits & Perks', tier: 'optional', purpose: 'Compensation, benefits, and culture extras', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Office & Hours', tier: 'optional', purpose: 'Where and when work happens', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 45 } },
      { title: 'FAQ', tier: 'optional', purpose: 'Answers to questions every new hire asks', layout: 'single', blockTemplate: 'toggles', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 22 } },
    ],
  },

  // ── Education ───────────────────────────────────────────────────────────
  {
    id: 'lesson-plan',
    defaultSkillId: 'educational',
    name: 'Lesson Plan',
    thumbnailLayout: 'timeline',
    description: 'Teach a topic — objectives, concepts, an activity, discussion, and takeaways.',
    category: 'educational',
    samplePrompt: 'Introduction to React hooks for junior front-end developers',
    inspireTopics: [
      'A multi-session class on a topic I teach',
      'A standalone lecture or unit for a course I’m running',
      'An intro workshop for students new to a subject',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Lesson title and grade or audience level', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'Learning Objectives', tier: 'required', purpose: 'What the learner can do at the end', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Concepts', tier: 'required', purpose: 'The core ideas being introduced', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 20 } },
      { title: 'Pre-Reading', tier: 'recommended', purpose: 'What to know before this lesson', layout: 'single', blockTemplate: 'bullet-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Activity', tier: 'recommended', purpose: 'A hands-on exercise to apply the concepts', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Discussion', tier: 'recommended', purpose: 'Questions to surface understanding', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Takeaways', tier: 'recommended', purpose: 'What every learner should leave with', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Homework', tier: 'optional', purpose: 'Practice tasks before next class', layout: 'single', blockTemplate: 'bullet-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Further Reading', tier: 'optional', purpose: 'Books, articles, videos to go deeper', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Assessment', tier: 'optional', purpose: 'How understanding will be measured', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 45 } },
    ],
  },
  {
    id: 'research-brief',
    defaultSkillId: 'research',
    name: 'Research Brief',
    thumbnailLayout: 'chart',
    description: 'Present research findings — question, methodology, findings, implications, next steps.',
    category: 'educational',
    samplePrompt: 'User research findings on our analytics dashboard’s information density',
    inspireTopics: [
      'A readout of customer interviews or user research',
      'A market or competitor scan with recommendations',
      'A usability or evaluation study summary',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Research title and authors', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'Research Question', tier: 'required', purpose: 'The exact question being answered', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 40, includeCallout: true } },
      { title: 'Findings', tier: 'required', purpose: 'What was discovered', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Background', tier: 'recommended', purpose: 'Why this question was worth investigating', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60 } },
      { title: 'Methodology', tier: 'recommended', purpose: 'How the research was conducted', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Implications', tier: 'recommended', purpose: 'What the findings mean in practice', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50, includeCallout: true } },
      { title: 'Next Steps', tier: 'recommended', purpose: 'Open questions and follow-on research', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Limitations', tier: 'optional', purpose: 'What this research can\'t tell us', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Related Work', tier: 'optional', purpose: 'How this fits with prior findings', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Appendix', tier: 'optional', purpose: 'Raw data, transcripts, and supplemental notes', layout: 'single', blockTemplate: 'bullet-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
    ],
  },
  {
    id: 'workshop',
    defaultSkillId: 'educational',
    name: 'Workshop',
    thumbnailLayout: 'timeline',
    description: 'Run a session — agenda, warm-up, concept, exercise, discussion, and wrap-up.',
    category: 'educational',
    samplePrompt: 'Half-day design thinking workshop for product managers',
    inspireTopics: [
      'A half-day or full-day team workshop',
      'A facilitated session for an offsite or leadership group',
      'A skill-building workshop for a specific function',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Workshop title and duration', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Agenda', tier: 'required', purpose: 'Time-boxed flow of the session', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Wrap-Up', tier: 'required', purpose: 'Takeaways and follow-up actions', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 12 } },
      { title: 'Warm-Up', tier: 'recommended', purpose: 'A quick exercise to get the room engaged', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 40, includeCallout: true } },
      { title: 'Concept', tier: 'recommended', purpose: 'The core idea being taught today', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Exercise', tier: 'recommended', purpose: 'Hands-on activity to apply the concept', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Discussion', tier: 'recommended', purpose: 'Surface what people learned', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Pre-Reading', tier: 'optional', purpose: 'What participants should review before joining', layout: 'single', blockTemplate: 'bullet-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Materials Needed', tier: 'optional', purpose: 'Supplies, tools, links to bring', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Follow-up Resources', tier: 'optional', purpose: 'Where to keep learning after the session', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
    ],
  },

  // ── Personal / Storytelling ─────────────────────────────────────────────
  {
    id: 'personal-story',
    defaultSkillId: null,
    name: 'Personal Story',
    thumbnailLayout: 'story',
    description: 'Share a personal narrative — setup, journey, turning point, lessons, and closing.',
    category: 'storytelling',
    samplePrompt: 'How I went from teaching middle school math to working as a software engineer',
    inspireTopics: [
      'A career-pivot story I want to share',
      'A long personal journey condensed into key turning points',
      'A reflection on a chapter of my life and what I learned',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Title and one-line hook', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22 } },
      { title: 'Setup', tier: 'required', purpose: 'Where the story starts and who is in it', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Closing', tier: 'required', purpose: 'Where things stand now', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Journey', tier: 'recommended', purpose: 'The path that unfolded', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Turning Point', tier: 'recommended', purpose: 'The moment that changed everything', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50, includeCallout: true } },
      { title: 'Lessons', tier: 'recommended', purpose: 'What this experience taught', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Context I Didn\'t See Then', tier: 'optional', purpose: 'What was happening around me that mattered', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50 } },
      { title: 'What\'s Next', tier: 'optional', purpose: 'Where the story goes from here', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Acknowledgements', tier: 'optional', purpose: 'The people who made this possible', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
    ],
  },
  {
    id: 'trip-recap',
    defaultSkillId: null,
    name: 'Trip Recap',
    thumbnailLayout: 'story',
    description: 'Recap a trip — destination, highlights, hidden gems, lessons, and itinerary.',
    category: 'storytelling',
    samplePrompt: '10-day trip through Japan — Tokyo, Kyoto, Osaka — with food and culture highlights',
    inspireTopics: [
      'A recent trip I want to recap with photos and highlights',
      'A multi-stop itinerary that’s worth sharing',
      'An adventure or expedition with logistics and lessons',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Destination, dates, who went', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'Where I Went', tier: 'required', purpose: 'The destination at a glance', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 50 } },
      { title: 'Highlights', tier: 'required', purpose: 'The top moments worth sharing', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Hidden Gems', tier: 'recommended', purpose: 'Off-the-beaten-path discoveries', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Lessons', tier: 'recommended', purpose: 'What I would do differently', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Itinerary', tier: 'recommended', purpose: 'Day-by-day flow for anyone going next', layout: 'split-right', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Costs', tier: 'optional', purpose: 'What it actually cost, broken down', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Where I\'d Go Next', tier: 'optional', purpose: 'Trip ideas this one inspired', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Photo Reel', tier: 'optional', purpose: 'A handful of favorite shots', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
    ],
  },

  // ── Finance ─────────────────────────────────────────────────────────────
  // Live under go-to-market category alongside other business decks. Two
  // entries cover the most common knowledge-worker finance scenarios: an
  // internal financial review and an outbound budget ask.
  {
    id: 'financial-review',
    defaultSkillId: 'financial',
    name: 'Financial Review',
    description: 'Quarterly readout — P&L, cash flow, variance to plan, and outlook.',
    category: 'go-to-market',
    thumbnailLayout: 'chart',
    samplePrompt: 'Q3 financial review for the leadership team — revenue, margins, cash, variance to plan',
    inspireTopics: [
      'A quarter or year-end financial readout to the board',
      'A mid-period financial check-in for the leadership team',
      'A planning-cycle financial summary tied to next year',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Period covered and audience', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Headline Numbers', tier: 'required', purpose: 'Revenue, margin, cash — at a glance', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'P&L Snapshot', tier: 'required', purpose: 'Income statement vs plan and prior period', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60, includeCallout: true } },
      { title: 'Cash Flow', tier: 'required', purpose: 'Cash in, cash out, runway', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Variance to Plan', tier: 'recommended', purpose: 'Where we beat or missed and why', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Top Drivers', tier: 'recommended', purpose: 'What moved the numbers most', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Outlook', tier: 'recommended', purpose: 'Forecast for the next period', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Risks', tier: 'optional', purpose: 'Things to watch — financial, operational, market', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Appendix', tier: 'optional', purpose: 'Supporting detail — segment breakdowns', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
    ],
  },
  {
    id: 'budget-proposal',
    defaultSkillId: 'financial',
    name: 'Budget Proposal',
    description: 'Make a budget ask — context, plan, allocation, risks, what you need.',
    category: 'go-to-market',
    thumbnailLayout: 'chart',
    samplePrompt: '2026 marketing budget proposal — $4.2M ask, channel mix, expected pipeline, headcount plan',
    inspireTopics: [
      'A department budget proposal for the next fiscal year',
      'An incremental ask for a new initiative or hire',
      'A reallocation proposal across an existing budget',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'What is being requested and from whom', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'TL;DR', tier: 'required', purpose: 'The ask in 3 lines', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Context', tier: 'required', purpose: 'Where things stand today', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Proposed Plan', tier: 'required', purpose: 'What we will do with the money', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Allocation', tier: 'required', purpose: 'How the budget breaks down', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Expected Impact', tier: 'recommended', purpose: 'What success looks like — metrics and timing', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Alternatives Considered', tier: 'recommended', purpose: 'Other paths and why this one wins', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Risks', tier: 'optional', purpose: 'What could go wrong and our mitigations', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'The Ask', tier: 'required', purpose: 'Specific approval requested', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
    ],
  },

  // ── Legal ────────────────────────────────────────────────────────────────
  // Knowledge-worker frameworks for in-house counsel, paralegals, and
  // anyone communicating legal analysis to a non-legal audience.
  {
    id: 'legal-memo',
    defaultSkillId: 'legal',
    name: 'Legal Memo',
    description: 'A focused legal opinion — question, brief answer, facts, analysis, conclusion.',
    category: 'go-to-market',
    thumbnailLayout: 'story',
    samplePrompt: 'Legal memo on whether our new feature triggers GDPR Article 22 automated-decision restrictions',
    inspireTopics: [
      'An advisory memo on a specific legal question',
      'A risk assessment tied to a product or policy decision',
      'A contract or regulatory analysis for the team',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Matter, requesting party, date, author', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Question Presented', tier: 'required', purpose: 'The specific legal question', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 45 } },
      { title: 'Brief Answer', tier: 'required', purpose: 'The bottom line in 1-2 sentences', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 2, itemMaxWords: 22, includeCallout: true } },
      { title: 'Facts', tier: 'required', purpose: 'Material facts the analysis turns on', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Analysis', tier: 'required', purpose: 'Applicable law applied to the facts', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 70, includeCallout: true } },
      { title: 'Authorities', tier: 'recommended', purpose: 'Key cases, statutes, regulations', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Counterarguments', tier: 'recommended', purpose: 'Where the other side would push back', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Conclusion', tier: 'required', purpose: 'Final position and confidence level', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'Open Risks', tier: 'optional', purpose: 'Unresolved issues to revisit', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
    ],
  },
  {
    id: 'compliance-update',
    defaultSkillId: 'government',
    name: 'Compliance Update',
    description: 'Communicate a regulatory or policy change — what, who, when, what to do.',
    category: 'go-to-market',
    thumbnailLayout: 'grid',
    samplePrompt: 'EU AI Act readiness update — what changed, who is affected, the rollout plan, the owner',
    inspireTopics: [
      'A regulatory change and our plan to comply',
      'A control or framework update with owners and timeline',
      'A privacy or security policy rollout to the org',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'What changed and effective date', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'TL;DR', tier: 'required', purpose: 'The change in 2-3 lines', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 2, itemMaxWords: 20, includeCallout: true } },
      { title: 'What Changed', tier: 'required', purpose: 'The new rule in plain language', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Who Is Affected', tier: 'required', purpose: 'Teams, products, vendors, customers', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'What We Are Doing', tier: 'required', purpose: 'The mitigation plan', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Timeline', tier: 'recommended', purpose: 'Key dates between now and effective date', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Owners', tier: 'recommended', purpose: 'Who is on point for each workstream', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'What You Need To Do', tier: 'required', purpose: 'Ask of the audience', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
      { title: 'Resources', tier: 'optional', purpose: 'Where to read the policy, who to ask', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
    ],
  },

  // ── Student / Academic (extends Education) ───────────────────────────────
  {
    id: 'study-notes',
    defaultSkillId: 'educational',
    name: 'Study Notes',
    description: 'Distill a course or chapter — big ideas, key concepts, examples, review prompts.',
    category: 'educational',
    thumbnailLayout: 'grid',
    samplePrompt: 'Study notes for Microeconomics 101 chapter on supply, demand, and price elasticity',
    inspireTopics: [
      'A subject overview I’m studying for an exam',
      'A topic refresher with key concepts and examples',
      'Course notes I want to organize before a test',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Course, chapter, exam-readiness date', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 18, includeLabels: true } },
      { title: 'Big Ideas', tier: 'required', purpose: 'The 3-4 concepts everything else builds on', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Key Concepts', tier: 'required', purpose: 'Definitions and the relationships between them', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 20 } },
      { title: 'Worked Examples', tier: 'recommended', purpose: 'Walk-throughs of the typical problem types', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60, includeCallout: true } },
      { title: 'Common Mistakes', tier: 'recommended', purpose: 'Where students lose points', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Formulas to Memorize', tier: 'optional', purpose: 'The short list of must-know equations', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 12 } },
      { title: 'Review Questions', tier: 'required', purpose: 'Self-test prompts to check mastery', layout: 'single', blockTemplate: 'bullet-list', contentBudget: { headingLevel: 2, maxItems: 5, itemMaxWords: 18 } },
      { title: 'Going Deeper', tier: 'optional', purpose: 'Where to read more if curious', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
    ],
  },
  {
    id: 'group-project',
    defaultSkillId: 'educational',
    name: 'Group Project',
    description: 'Present team coursework — problem, approach, findings, recommendations, reflections.',
    category: 'educational',
    thumbnailLayout: 'story',
    samplePrompt: 'Group project on whether our city should build a new light-rail line — analysis and recommendation',
    inspireTopics: [
      'A team capstone project — problem, approach, findings',
      'A semester-long group research project we want to present',
      'A case competition entry or class deliverable',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Project title, course, team, date', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 22, includeLabels: true } },
      { title: 'The Problem', tier: 'required', purpose: 'What we set out to solve', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Our Approach', tier: 'required', purpose: 'How we tackled it — methods, data, tools', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 18 } },
      { title: 'Findings', tier: 'required', purpose: 'What the work revealed', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Recommendation', tier: 'required', purpose: 'What we propose and why', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Limitations', tier: 'recommended', purpose: 'What our analysis cannot answer', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'What We Learned', tier: 'recommended', purpose: 'Reflections from the team', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Team & Roles', tier: 'optional', purpose: 'Who did what', layout: 'single', blockTemplate: 'grid-1x4', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
      { title: 'Q&A', tier: 'optional', purpose: 'Prompts for the audience', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
    ],
  },

  // ── Knowledge work ───────────────────────────────────────────────────────
  // Cross-functional decks that show up in operating teams, product orgs,
  // and consulting work — useful regardless of industry.
  {
    id: 'decision-memo',
    defaultSkillId: 'executive',
    name: 'Decision Memo',
    description: 'Recommend a path — TL;DR, options, tradeoffs, recommendation, open questions.',
    category: 'go-to-market',
    thumbnailLayout: 'grid',
    samplePrompt: 'Decision memo — should we build, buy, or partner for our new identity-management module',
    inspireTopics: [
      'A build-vs-buy or partner-vs-internal decision',
      'A go/no-go on a specific initiative or investment',
      'A pricing, packaging, or positioning change',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Decision needed, owner, deadline', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'TL;DR', tier: 'required', purpose: 'The recommendation in 3 lines', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18, includeCallout: true } },
      { title: 'Context', tier: 'required', purpose: 'Why this decision now', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55 } },
      { title: 'Options', tier: 'required', purpose: 'The candidates considered', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Tradeoffs', tier: 'required', purpose: 'Side-by-side comparison on what matters', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Recommendation', tier: 'required', purpose: 'The path we propose and why', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 55, includeCallout: true } },
      { title: 'Risks & Mitigations', tier: 'recommended', purpose: 'What could go wrong, how we handle it', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Open Questions', tier: 'recommended', purpose: 'Things we still need to resolve', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Next Steps', tier: 'optional', purpose: 'What happens after this decision lands', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 14 } },
    ],
  },
  {
    id: 'post-mortem',
    defaultSkillId: 'technical',
    name: 'Post-Mortem',
    description: 'Incident retrospective — timeline, root cause, impact, what worked, action items.',
    category: 'go-to-market',
    thumbnailLayout: 'timeline',
    samplePrompt: 'Post-mortem on the 47-minute payments outage last Tuesday — timeline, root cause, action items',
    inspireTopics: [
      'An incident retrospective — what happened and what we’re changing',
      'A launch retro covering wins, misses, and learnings',
      'A failed project review with action items',
    ],
    steps: [
      { title: 'Cover', tier: 'required', purpose: 'Incident name, date, severity, author', layout: 'split-left', blockTemplate: 'hero-title', contentBudget: { headingLevel: 1, bodyMaxWords: 20, includeLabels: true } },
      { title: 'Summary', tier: 'required', purpose: 'What happened, in 3-4 lines', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 22, includeCallout: true } },
      { title: 'Timeline', tier: 'required', purpose: 'Key moments from detection to resolution', layout: 'single', blockTemplate: 'timeline', contentBudget: { headingLevel: 2, maxItems: 5, itemMaxWords: 16 } },
      { title: 'Root Cause', tier: 'required', purpose: 'Why it happened, not just what', layout: 'single', blockTemplate: 'paragraph-content', contentBudget: { headingLevel: 2, bodyMaxWords: 60 } },
      { title: 'Impact', tier: 'required', purpose: 'Customers, revenue, trust', layout: 'single', blockTemplate: 'grid-1x3', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 16 } },
      { title: 'What Went Well', tier: 'recommended', purpose: 'Detection, response, communication wins', layout: 'single', blockTemplate: 'icon-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'What Did Not', tier: 'recommended', purpose: 'Gaps in tooling, process, knowledge', layout: 'single', blockTemplate: 'callout-list', contentBudget: { headingLevel: 2, maxItems: 3, itemMaxWords: 18 } },
      { title: 'Action Items', tier: 'required', purpose: 'Specific commitments with owners and dates', layout: 'split-right', blockTemplate: 'cta-closing', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 16 } },
      { title: 'Appendix', tier: 'optional', purpose: 'Logs, screenshots, supporting detail', layout: 'single', blockTemplate: 'grid-2x2', contentBudget: { headingLevel: 2, maxItems: 4, itemMaxWords: 14 } },
    ],
  },
];

// Helper: get frameworks by category
export function getFrameworksByCategory(category: FrameworkCategory): Framework[] {
  return FRAMEWORKS.filter(f => f.category === category);
}

/**
 * Pick the slide list for a given card count, scaling required → recommended →
 * optional. Floor: card count cannot go below the count of required steps; if
 * `count` is below that floor, the floor is used. Ceiling: at most all of the
 * framework's declared steps (if `count` exceeds total, total is used).
 *
 * Usage in the wizard:
 *   const slides = getStepsForCount(framework, userPickedCount);
 *
 * The returned array is in canonical (declared) order. The wizard can let the
 * user inline-rename, remove, or reorder the result without affecting the
 * source-of-truth tier data here.
 */
export function getStepsForCount(framework: Framework, count: number): FrameworkStep[] {
  const required = framework.steps.filter(s => s.tier === 'required');
  const recommended = framework.steps.filter(s => s.tier === 'recommended');
  const optional = framework.steps.filter(s => s.tier === 'optional');
  const target = Math.min(framework.steps.length, Math.max(required.length, count));
  const out: FrameworkStep[] = [...required];
  for (const s of recommended) {
    if (out.length >= target) break;
    out.push(s);
  }
  for (const s of optional) {
    if (out.length >= target) break;
    out.push(s);
  }
  return out;
}

/** Floor for the wizard's card-count adjuster — can never go below this. */
export function getRequiredStepCount(framework: Framework): number {
  return framework.steps.filter(s => s.tier === 'required').length;
}

/** Default count surfaced when a framework is first selected. */
export function getDefaultStepCount(framework: Framework): number {
  return framework.steps.filter(s => s.tier !== 'optional').length;
}

/** Ceiling — total steps available including optional. */
export function getMaxStepCount(framework: Framework): number {
  return framework.steps.length;
}

// Helper: find best framework match for a prompt
export function suggestFramework(prompt: string): Framework | null {
  const lower = prompt.toLowerCase();
  if (lower.includes('investor') || lower.includes('fundrais') || lower.includes('vc') || lower.includes('seed') || lower.includes('series a')) return FRAMEWORKS.find(f => f.id === 'investor-pitch') || null;
  if (lower.includes('sales') || lower.includes('prospect') || lower.includes('deal') || lower.includes('pitch') || lower.includes('persuad')) return FRAMEWORKS.find(f => f.id === 'sales-pitch') || null;
  if (lower.includes('quarterly') || lower.includes('qbr') || lower.includes('end of quarter') || lower.includes('review')) return FRAMEWORKS.find(f => f.id === 'quarterly-review') || null;
  if (lower.includes('launch') || lower.includes('product') || lower.includes('release') || lower.includes('feature announcement')) return FRAMEWORKS.find(f => f.id === 'product-launch') || null;
  if (lower.includes('marketing') || lower.includes('campaign') || lower.includes('positioning')) return FRAMEWORKS.find(f => f.id === 'marketing-strategy') || null;
  if (lower.includes('weekly') || lower.includes('team update') || lower.includes('all-hands') || lower.includes('all hands')) return FRAMEWORKS.find(f => f.id === 'team-update') || null;
  if (lower.includes('project') || lower.includes('kickoff') || lower.includes('brief')) return FRAMEWORKS.find(f => f.id === 'project-brief') || null;
  if (lower.includes('strategy') || lower.includes('plan')) return FRAMEWORKS.find(f => f.id === 'strategy-brief') || null;
  if (lower.includes('onboarding') || lower.includes('new hire') || lower.includes('welcome')) return FRAMEWORKS.find(f => f.id === 'onboarding-deck') || null;
  if (lower.includes('lesson') || lower.includes('teach') || lower.includes('course') || lower.includes('class')) return FRAMEWORKS.find(f => f.id === 'lesson-plan') || null;
  if (lower.includes('research') || lower.includes('findings') || lower.includes('study') || lower.includes('analysis')) return FRAMEWORKS.find(f => f.id === 'research-brief') || null;
  if (lower.includes('workshop') || lower.includes('session') || lower.includes('training')) return FRAMEWORKS.find(f => f.id === 'workshop') || null;
  if (lower.includes('trip') || lower.includes('travel') || lower.includes('vacation') || lower.includes('tourist') || lower.includes('visit')) return FRAMEWORKS.find(f => f.id === 'trip-recap') || null;
  if (lower.includes('story') || lower.includes('personal') || lower.includes('memoir')) return FRAMEWORKS.find(f => f.id === 'personal-story') || null;
  return FRAMEWORKS.find(f => f.id === 'product-launch') || null;
}
