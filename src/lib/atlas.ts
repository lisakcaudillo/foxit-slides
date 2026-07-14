import { z } from 'zod';

// All Atlas calls now go through Next.js API proxy routes (/api/document-intelligence/*).
// The proxy routes handle Atlas connectivity and fallback internally.
// No direct Atlas URL needed here — everything is same-origin.

// --- Zod Schemas ---

const ExtractedBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  page: z.number(),
  bookmark: z.string().nullable().optional(),
});

const ComparisonEntrySchema = z.object({
  classification: z.string(),
  sectionId: z.string().nullable().optional(),
  clauseType: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  reviewPriority: z.number().nullable().optional(),
  impactSummary: z.string().nullable().optional(),
  hedgedSummary: z.string().nullable().optional(),
  certaintyLevel: z.enum(['definitive', 'conditional', 'ambiguous']).nullable().optional(),
  content: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  similarity: z.number().optional(),
});

const SanitizeStatsSchema = z.object({
  parties_redacted: z.number(),
  amounts_redacted: z.number(),
  dates_redacted: z.number(),
});

const TerminationRiskSchema = z.object({
  riskLevel: z.enum(['high', 'moderate', 'low', 'none']),
  terminationChangeCount: z.number(),
  avgCalibratedConfidence: z.number(),
  hasUnverified: z.boolean(),
  hasNumericOverride: z.boolean(),
  highestReviewPriority: z.number(),
  keyFindings: z.array(z.string()),
  affectedClauses: z.array(z.string()),
  recommendation: z.string(),
});

const SemanticDiffSchema = z.object({
  additions: z.array(ComparisonEntrySchema),
  removals: z.array(ComparisonEntrySchema),
  modifications: z.array(ComparisonEntrySchema),
  summary: z.string(),
  strategy: z.string().optional(),
  totalSections: z.number().optional(),
  sanitized: z.boolean().optional(),
  sanitizeStats: SanitizeStatsSchema.nullable().optional(),
  terminationRisk: TerminationRiskSchema.optional(),
});

const ComplianceResultSchema = z.object({
  piiFlags: z.array(
    z.object({
      type: z.string(),
      location: z.string(),
      severity: z.string(),
    })
  ),
  sensitivityLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

const FieldInferenceResultSchema = z.object({
  roleMap: z.record(z.string(), z.string()),
  fieldSuggestions: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      party: z.number().optional(),
    })
  ),
});

function AtlasResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: z.string().nullable(),
  });
}

// --- Inferred Types ---

type ExtractedBlock = z.infer<typeof ExtractedBlockSchema>;
type SemanticDiff = z.infer<typeof SemanticDiffSchema>;
type ComplianceResult = z.infer<typeof ComplianceResultSchema>;
type FieldInferenceResult = z.infer<typeof FieldInferenceResultSchema>;

interface AtlasResponse<T> {
  data: T | null;
  error: string | null;
}

// --- Helper ---

async function fetchAndValidate<T>(
  url: string,
  options: RequestInit,
  dataSchema: z.ZodType<T>
): Promise<AtlasResponse<T>> {
  const res = await fetch(url, options);
  const json: unknown = await res.json();

  // Try strict validation first
  try {
    const envelopeSchema = AtlasResponseSchema(dataSchema);
    const validated = envelopeSchema.parse(json);
    return validated as AtlasResponse<T>;
  } catch {
    // If Zod validation fails, try to extract data loosely
    const loose = json as Record<string, unknown>;
    if (loose.error && typeof loose.error === 'string') {
      return { data: null, error: loose.error };
    }
    if (loose.data) {
      // Return data as-is without strict validation
      return { data: loose.data as T, error: null };
    }
    return { data: null, error: 'Unexpected response from server. Please try again.' };
  }
}

// --- API Functions ---

export async function extract(file: File): Promise<AtlasResponse<ExtractedBlock[]>> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchAndValidate(
    '/api/document-intelligence/extract',
    { method: 'POST', body: formData },
    z.array(ExtractedBlockSchema)
  );
}

export async function compare(
  fileA: File,
  fileB: File,
  options?: { sanitize?: boolean }
): Promise<AtlasResponse<SemanticDiff>> {
  const formData = new FormData();
  formData.append('file_a', fileA);
  formData.append('file_b', fileB);
  if (options?.sanitize) {
    formData.append('sanitize', 'true');
  }
  return fetchAndValidate(
    '/api/document-intelligence/compare',
    { method: 'POST', body: formData },
    SemanticDiffSchema
  );
}

export async function complianceScan(
  content: string,
  signal?: AbortSignal
): Promise<AtlasResponse<ComplianceResult>> {
  return fetchAndValidate(
    '/api/document-intelligence/compliance',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal,
    },
    ComplianceResultSchema
  );
}

export async function inferFields(
  content: string
): Promise<AtlasResponse<FieldInferenceResult>> {
  return fetchAndValidate(
    '/api/document-intelligence/fields',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
    FieldInferenceResultSchema
  );
}
