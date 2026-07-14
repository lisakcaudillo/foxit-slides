/**
 * Document Skills — Named presets that configure semantic intent.
 *
 * Instead of manually setting tone/depth/audience/pattern,
 * users pick a skill that sets everything at once.
 * Skills can be applied in the BlueprintEditor before generation.
 */

import {
  Gavel,
  Briefcase,
  Code2,
  Target,
  MessageCircle,
  Users,
  BookOpen,
  Landmark,
  GraduationCap,
  LineChart,
  type LucideIcon,
} from 'lucide-react';

/** Union of every valid Skill id. Use this as the field type when a
 *  framework, template, or runtime override needs to reference a Skill. */
export type SkillId =
  | 'legal'
  | 'executive'
  | 'technical'
  | 'persuasive'
  | 'simple'
  | 'hr'
  | 'research'
  | 'government'
  | 'educational'
  | 'financial';

export interface DocumentSkill {
  id: SkillId;
  label: string;
  icon: LucideIcon;
  description: string;
  tone: 'formal' | 'professional' | 'conversational' | 'technical' | 'persuasive';
  desiredDepth: 'concise' | 'standard' | 'detailed' | 'comprehensive';
  narrativePattern: 'linear' | 'problem-solution' | 'compare-contrast' | 'executive-summary' | 'procedural';
  audience: string;
  factualGroundingPolicy: 'source-only' | 'infer-safe' | 'creative';
  /** Concrete voice/vocabulary/convention rules injected into the Generate-
   *  stage Claude prompt. Per PRD §5.2 voice profiles — the secret-sauce
   *  layer that makes "pitch deck" prose feel different from "legal contract"
   *  prose. Multi-sentence; goes verbatim into the prompt under VOICE: section. */
  voicePromptFragment: string;
}

export const DOCUMENT_SKILLS: DocumentSkill[] = [
  {
    id: 'legal',
    label: 'Legal',
    icon: Gavel,
    description: 'Formal tone, detailed clauses, source-only grounding',
    tone: 'formal',
    desiredDepth: 'detailed',
    narrativePattern: 'linear',
    audience: 'Legal and compliance teams',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Formal, qualified, citation-backed register. Use legal-conventional vocabulary where appropriate ("shall", "hereinafter", "notwithstanding", "pursuant to"). Long, clause-laden sentences with explicit subjects and qualifications. Avoid contractions. Name parties precisely ("the Disclosing Party", not "they"). Hedge any factual claim that could be disputed in writing.`,
  },
  {
    id: 'executive',
    label: 'Executive',
    icon: Briefcase,
    description: 'Professional tone, concise, conclusion-first',
    tone: 'professional',
    desiredDepth: 'concise',
    narrativePattern: 'executive-summary',
    audience: 'C-suite and board members',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `BLUF — bottom line up front. Lead every section with the decision, conclusion, or ask. Then supporting evidence. 1–2 sentence paragraphs. Active voice. Decision-oriented language ("recommend", "request", "approve"). Strip filler. Time and money are the units that matter — surface them early.`,
  },
  {
    id: 'technical',
    label: 'Technical',
    icon: Code2,
    description: 'Technical language, comprehensive detail, step-by-step',
    tone: 'technical',
    desiredDepth: 'comprehensive',
    narrativePattern: 'procedural',
    audience: 'Engineers and developers',
    factualGroundingPolicy: 'infer-safe',
    voicePromptFragment: `Precise, claim-evidence pattern, low-ambiguity prose. Define terms before using them. Use code-literate vocabulary where appropriate. Cite benchmarks and version numbers as proof. Prefer specific over general ("17ms p99 latency" beats "fast"). Acknowledge known limitations explicitly.`,
  },
  {
    id: 'persuasive',
    label: 'Persuasive',
    icon: Target,
    description: 'Persuasive tone, problem-solution structure',
    tone: 'persuasive',
    desiredDepth: 'standard',
    narrativePattern: 'problem-solution',
    audience: 'Stakeholders and decision-makers',
    factualGroundingPolicy: 'infer-safe',
    voicePromptFragment: `Short, punchy sentences. Second-person address ("you", "your team"). Lead with the pain or the opportunity, then the solution. Use social proof when supported by the prompt. End sections with a CTA-shaped sentence or a sharp implication. Avoid hedging — confident, declarative voice.`,
  },
  {
    id: 'simple',
    label: 'Simple',
    icon: MessageCircle,
    description: 'Conversational, concise, plain language',
    tone: 'conversational',
    desiredDepth: 'concise',
    narrativePattern: 'linear',
    audience: 'General audience',
    factualGroundingPolicy: 'creative',
    voicePromptFragment: `Plain language, grade 6–8 reading level. One idea per sentence. Common words over technical synonyms ("use" over "utilize", "help" over "facilitate"). Define jargon inline if it must appear. Short paragraphs. Friendly without being cute. Reads aloud naturally.`,
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Users,
    description: 'Professional tone, standard detail, employee-friendly',
    tone: 'professional',
    desiredDepth: 'standard',
    narrativePattern: 'linear',
    audience: 'Employees and candidates',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Warm-professional. Benefit-framed language ("you'll receive…", "you have access to…"). Inclusive vocabulary ("they/them" as singular default; avoid gendered assumptions). Legally-aware phrasing on protected topics (avoid promises beyond the prompt). Clear next-step instructions for the employee or candidate.`,
  },
  {
    id: 'research',
    label: 'Research',
    icon: BookOpen,
    description: 'Academic tone, comprehensive detail, source-only grounding',
    tone: 'formal',
    desiredDepth: 'comprehensive',
    narrativePattern: 'problem-solution',
    audience: 'Academic reviewers and committees',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Academic register. Hedged claims ("suggests", "appears to", "is consistent with") rather than absolute assertions. Cite evidence whenever a claim is non-trivial. Structured argumentation — background → question → method → finding → implication. Avoid first-person singular; prefer passive voice or "the study" / "the data" as subject where conventional in the field.`,
  },
  {
    id: 'government',
    label: 'Government',
    icon: Landmark,
    description: 'Regulatory tone, structured compliance, citation-heavy, source-only grounding',
    tone: 'formal',
    desiredDepth: 'comprehensive',
    narrativePattern: 'procedural',
    audience: 'Government agencies, regulators, and compliance officers',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Regulatory register. Cite the specific rule, regulation, or statute by number/section when applicable. Plain English where mandated, formal procedural language otherwise. Structured: requirement → applicable entity → effective date → compliance action. Avoid editorial commentary. Use defined terms consistently throughout.`,
  },
  {
    id: 'educational',
    label: 'Educational',
    icon: GraduationCap,
    description: 'Pedagogical, scaffolded, example-led — for lesson plans, courses, and study material',
    tone: 'conversational',
    desiredDepth: 'standard',
    narrativePattern: 'linear',
    audience: 'Learners, students, trainees',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Pedagogical, scaffolded, example-led. One concept per slide or section. Lead with a concrete example before introducing the abstraction. Use check-for-understanding patterns ("What would happen if…?", "Try this:"). Acknowledge what learners likely already know vs what's new. End sections with a reflection prompt or summary cue.`,
  },
  {
    id: 'financial',
    label: 'Financial',
    icon: LineChart,
    description: 'Numeric precision, period-aware, regulator-cautious — for earnings, board reports, MD&A',
    tone: 'formal',
    desiredDepth: 'detailed',
    narrativePattern: 'executive-summary',
    audience: 'Investors, board members, finance leaders, auditors',
    factualGroundingPolicy: 'source-only',
    voicePromptFragment: `Numeric precision. Every figure carries its period ("Q4 2025 revenue: $4.2M") and its basis (GAAP / non-GAAP / pro forma). Surface YoY / QoQ comparisons explicitly. Use regulator-aware hedging on forward-looking statements ("we expect", "currently anticipate", paired with the risk-factor caveat where appropriate). Define non-standard metrics inline. Round consistently; never invent precision the prompt didn't provide.`,
  },
];

/** Build the voice-rules block to inject into the Generate-stage prompt.
 *  Returns an empty string when no Skill resolved — the prompt remains
 *  generic and the existing tone/audience controls do the work. */
export function buildSkillVoiceInstructions(skillId: SkillId | null | undefined): string {
  if (!skillId) return '';
  const skill = DOCUMENT_SKILLS.find((s) => s.id === skillId);
  if (!skill) return '';
  return `VOICE (${skill.label}):
${skill.voicePromptFragment}
`;
}

/** Find a skill by ID */
export function getSkill(id: string): DocumentSkill | undefined {
  return DOCUMENT_SKILLS.find((s) => s.id === id);
}

/** Apply a skill to a NormalizedIntent, returning the updated intent */
export function applySkillToIntent(
  skill: DocumentSkill,
  intent: { tone: string; desiredDepth: string; narrativePattern: string; audience: string },
): typeof intent {
  return {
    ...intent,
    tone: skill.tone,
    desiredDepth: skill.desiredDepth,
    narrativePattern: skill.narrativePattern,
    audience: skill.audience,
  };
}
