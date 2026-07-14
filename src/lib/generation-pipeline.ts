// Generation Pipeline v2 — Frontend Orchestrator
// Chains: classify-input → normalize-intent → blueprint → generate → polish (v2)
// Falls back to v1 generate on any stage failure.

import type {
  InputClassification,
  NormalizedIntent,
  ContentBlueprint,
  GenerationSpec,
  StructuredGenerationOutput,
  PipelineLog,
} from '@/types/generation';
import type { FXDATemplate } from '@/types/fxda';
import { checkFactualSafety, type SafetyCheckResult } from './factual-safety';
import { structuredOutputToFXDA } from './structured-to-fxda';

// ── Progress callback ──────────────────────────────────────────────────────

export type PipelineStage =
  | 'classifying'
  | 'normalizing'
  | 'blueprinting'
  | 'generating'
  | 'polishing'
  | 'complete'
  | 'fallback';

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  percent: number;
}

const STAGE_PROGRESS: Record<PipelineStage, { message: string; percent: number }> = {
  classifying: { message: 'Analyzing your input...', percent: 10 },
  normalizing: { message: 'Understanding intent and audience...', percent: 25 },
  blueprinting: { message: 'Building content plan...', percent: 40 },
  generating: { message: 'Generating structured document...', percent: 60 },
  polishing: { message: 'Polishing output quality...', percent: 85 },
  complete: { message: 'Complete!', percent: 100 },
  fallback: { message: 'Retrying with simplified approach...', percent: 40 },
};

// ── Wizard inputs → Pipeline ───────────────────────────────────────────────

export interface WizardInputs {
  prompt: string;
  clarifiedPrompt?: string;
  textAmount: 'concise' | 'balanced' | 'detailed';
  pageLayout: string;
  audience?: string;
  tone?: string;
  detail?: string;
  jurisdiction?: string;
  templateId?: string;
}

// ── Pipeline result ────────────────────────────────────────────────────────

export interface PipelineResult {
  template: FXDATemplate;
  structured?: StructuredGenerationOutput;
  pipelineVersion: 1 | 2;
  spec?: GenerationSpec;
  log?: PipelineLog;
  safetyCheck?: SafetyCheckResult;
}

// ── Two-phase pipeline plan ───────────────────────────────────────────────

export interface PipelinePlan {
  classification: InputClassification;
  intent: NormalizedIntent;
  blueprint: ContentBlueprint;
}

/**
 * Phase 1: Build the plan (classify → normalize → blueprint).
 * Returns the plan for user review/editing before generation.
 */
export async function buildPipelinePlan(
  inputs: WizardInputs,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<PipelinePlan> {
  const report = (stage: PipelineStage) => {
    const stageInfo = STAGE_PROGRESS[stage];
    onProgress?.({ stage, message: stageInfo.message, percent: stageInfo.percent });
  };

  // Stage 1: Classify input
  report('classifying');
  const classification = await classifyInput(
    inputs.prompt,
    !!inputs.templateId,
  );

  // Stage 3: Normalize intent (stage 2 = clarify, already handled by wizard)
  report('normalizing');
  const intent = await normalizeIntent(
    inputs.prompt,
    inputs.clarifiedPrompt,
    classification,
    inputs,
  );

  // Stage 4: Content blueprint
  report('blueprinting');
  const blueprint = await generateBlueprint(
    inputs.prompt,
    inputs.clarifiedPrompt,
    intent,
    inputs.templateId,
  );

  return { classification, intent, blueprint };
}

/**
 * Phase 2: Generate from an (potentially user-edited) plan.
 * Skips classify/normalize/blueprint — runs generate → polish → safety check.
 * Falls back to v1 on failure.
 */
export async function generateFromPlan(
  inputs: WizardInputs,
  plan: PipelinePlan,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<PipelineResult> {
  const startTime = Date.now();
  let lastPercent = STAGE_PROGRESS.generating.percent; // start at 60%
  const report = (stage: PipelineStage) => {
    const stageInfo = STAGE_PROGRESS[stage];
    const percent = Math.max(stageInfo.percent, lastPercent);
    lastPercent = percent;
    onProgress?.({ stage, message: stageInfo.message, percent });
  };

  try {
    // Assemble GenerationSpec from the (edited) plan
    const spec: GenerationSpec = {
      rawPrompt: inputs.prompt,
      clarifiedPrompt: inputs.clarifiedPrompt,
      inputClassification: plan.classification,
      intent: plan.intent,
      blueprint: plan.blueprint,
      templateId: inputs.templateId,
      templateMode: inputs.templateId ? 'template-first' : 'auto',
      visualPolicy: 'balanced',
      factualGroundingPolicy: 'source-only',
    };

    // Stage 6: Generate from spec
    report('generating');
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationSpec: spec }),
    });

    if (!response.ok) {
      throw new Error(`Generate failed: ${response.status}`);
    }

    const data = await response.json();
    let structured = data.structured as StructuredGenerationOutput;

    // Stage 7: Polish pass
    report('polishing');
    try {
      const polishRes = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structured }),
      });
      if (polishRes.ok) {
        const polishData = await polishRes.json();
        if (polishData.polishApplied && polishData.polished) {
          structured = polishData.polished as StructuredGenerationOutput;
        }
      }
    } catch (polishError) {
      console.warn('Polish pass failed, using unpolished output:', polishError);
    }

    // AC7: Factual safety check
    const safetyCheck = checkFactualSafety(structured, spec.factualGroundingPolicy);
    if (!safetyCheck.passed) {
      console.warn('[Pipeline v2 Phase 2] Factual safety flags:', safetyCheck.flags);
    }

    // AC8: Pipeline logging
    const durationMs = Date.now() - startTime;
    const log: PipelineLog = {
      timestamp: new Date().toISOString(),
      rawPrompt: inputs.prompt,
      inputClassification: plan.classification,
      clarifiedPrompt: inputs.clarifiedPrompt ?? null,
      intent: plan.intent,
      blueprint: plan.blueprint,
      templateSelection: inputs.templateId ?? null,
      structuredOutput: structured,
      durationMs,
      error: null,
    };
    console.info('[Pipeline v2 Phase 2]', JSON.stringify(log));

    report('complete');

    const template = structured
      ? structuredOutputToFXDA(spec, structured)
      : (data.template as FXDATemplate);

    return {
      template,
      structured,
      pipelineVersion: 2,
      spec,
      log,
      safetyCheck,
    };
  } catch (error) {
    // Graceful degradation: fall back to v1
    console.warn('Pipeline v2 Phase 2 failed, falling back to v1:', error);
    report('fallback');
    return runV1Fallback(inputs);
  }
}

// ── Main orchestrator ──────────────────────────────────────────────────────

export async function runGenerationPipeline(
  inputs: WizardInputs,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<PipelineResult> {
  const startTime = Date.now();
  let lastPercent = 0;
  const report = (stage: PipelineStage) => {
    const stageInfo = STAGE_PROGRESS[stage];
    // Never let progress bar go backward (e.g., on fallback after partial progress)
    const percent = Math.max(stageInfo.percent, lastPercent);
    lastPercent = percent;
    onProgress?.({ stage, message: stageInfo.message, percent });
  };

  try {
    // Stage 1: Classify input
    report('classifying');
    const classification = await classifyInput(
      inputs.prompt,
      !!inputs.templateId,
    );

    // Stage 3: Normalize intent (stage 2 = clarify, already handled by wizard)
    report('normalizing');
    const intent = await normalizeIntent(
      inputs.prompt,
      inputs.clarifiedPrompt,
      classification,
      inputs,
    );

    // Stage 4: Content blueprint
    report('blueprinting');
    const blueprint = await generateBlueprint(
      inputs.prompt,
      inputs.clarifiedPrompt,
      intent,
      inputs.templateId,
    );

    // Assemble GenerationSpec
    const spec: GenerationSpec = {
      rawPrompt: inputs.prompt,
      clarifiedPrompt: inputs.clarifiedPrompt,
      inputClassification: classification,
      intent,
      blueprint,
      templateId: inputs.templateId,
      templateMode: inputs.templateId ? 'template-first' : 'auto',
      visualPolicy: 'balanced',
      factualGroundingPolicy: 'source-only',
    };

    // Stage 6: Generate from spec
    report('generating');
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationSpec: spec }),
    });

    if (!response.ok) {
      throw new Error(`Generate failed: ${response.status}`);
    }

    const data = await response.json();
    let structured = data.structured as StructuredGenerationOutput;

    // Stage 7: Polish pass
    report('polishing');
    try {
      const polishRes = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structured }),
      });
      if (polishRes.ok) {
        const polishData = await polishRes.json();
        if (polishData.polishApplied && polishData.polished) {
          structured = polishData.polished as StructuredGenerationOutput;
        }
      }
    } catch (polishError) {
      console.warn('Polish pass failed, using unpolished output:', polishError);
    }

    // AC7: Factual safety check
    const safetyCheck = checkFactualSafety(structured, spec.factualGroundingPolicy);
    if (!safetyCheck.passed) {
      console.warn('[Pipeline v2] Factual safety flags:', safetyCheck.flags);
    }

    // AC8: Pipeline logging
    const durationMs = Date.now() - startTime;
    const log: PipelineLog = {
      timestamp: new Date().toISOString(),
      rawPrompt: inputs.prompt,
      inputClassification: classification,
      clarifiedPrompt: inputs.clarifiedPrompt ?? null,
      intent,
      blueprint,
      templateSelection: inputs.templateId ?? null,
      structuredOutput: structured,
      durationMs,
      error: null,
    };
    console.info('[Pipeline v2]', JSON.stringify(log));

    report('complete');

    // Rebuild template from (potentially polished) structured output
    const template = structured
      ? structuredOutputToFXDA(spec, structured)
      : (data.template as FXDATemplate);

    return {
      template,
      structured,
      pipelineVersion: 2,
      spec,
      log,
      safetyCheck,
    };
  } catch (error) {
    // Graceful degradation: fall back to v1
    console.warn('Pipeline v2 failed, falling back to v1:', error);
    report('fallback');
    return runV1Fallback(inputs);
  }
}

// ── Individual stage calls ─────────────────────────────────────────────────

async function classifyInput(
  prompt: string,
  hasTemplate: boolean,
): Promise<InputClassification> {
  const res = await fetch('/api/ai/classify-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, hasTemplate }),
  });
  if (!res.ok) throw new Error(`classify-input: ${res.status}`);
  return res.json();
}

async function normalizeIntent(
  prompt: string,
  clarifiedPrompt: string | undefined,
  classification: InputClassification,
  inputs: WizardInputs,
): Promise<NormalizedIntent> {
  // Build prompt with user overrides baked in
  const overrideSuffix = [
    inputs.audience ? `Audience: ${inputs.audience}` : '',
    inputs.tone ? `Tone: ${inputs.tone}` : '',
    inputs.detail ? `Detail level: ${inputs.detail}` : '',
    inputs.jurisdiction ? `Jurisdiction: ${inputs.jurisdiction}` : '',
  ].filter(Boolean).join('. ');

  const effectivePrompt = overrideSuffix
    ? `${clarifiedPrompt || prompt}. ${overrideSuffix}`
    : (clarifiedPrompt || prompt);

  const res = await fetch('/api/ai/normalize-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: effectivePrompt,
      clarifiedPrompt,
      classification,
    }),
  });
  if (!res.ok) throw new Error(`normalize-intent: ${res.status}`);
  return res.json();
}

async function generateBlueprint(
  prompt: string,
  clarifiedPrompt: string | undefined,
  intent: NormalizedIntent,
  templateId?: string,
): Promise<ContentBlueprint> {
  const res = await fetch('/api/ai/blueprint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, clarifiedPrompt, intent, templateId }),
  });
  if (!res.ok) throw new Error(`blueprint: ${res.status}`);
  return res.json();
}

// ── V1 fallback ────────────────────────────────────────────────────────────

async function runV1Fallback(inputs: WizardInputs): Promise<PipelineResult> {
  const amountAndLayout = `Text amount: ${inputs.textAmount}. Layout: ${inputs.pageLayout}`;
  const opts = [
    inputs.audience ? `audience: ${inputs.audience}` : '',
    inputs.tone ? `tone: ${inputs.tone}` : '',
    inputs.detail ? `detail: ${inputs.detail}` : '',
    inputs.jurisdiction ? `jurisdiction: ${inputs.jurisdiction}` : '',
  ].filter(Boolean).join('. ');

  const enrichedPrompt = `${inputs.clarifiedPrompt || inputs.prompt}. ${amountAndLayout}.${opts ? ` ${opts}` : ''}`;

  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: enrichedPrompt }),
  });

  if (!res.ok) {
    throw new Error(`V1 generate failed: ${res.status}`);
  }

  const template: FXDATemplate = await res.json();
  return { template, pipelineVersion: 1 };
}
