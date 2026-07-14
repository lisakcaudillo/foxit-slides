// Evaluation Engine — Automated quality scoring types for AI outputs.

export interface EvaluationResult {
  overall: number;             // 0-100
  checks: EvaluationCheck[];
  passed: boolean;
  timestamp: string;
}

export interface EvaluationCheck {
  name: string;
  score: number;              // 0-100
  passed: boolean;
  threshold: number;
  reasoning: string;
}
