// Type definitions for the template management system

export interface FormField {
  id: string;
  name: string;
  type: 'text' | 'signature' | 'date' | 'checkbox' | 'dropdown';
  required: boolean;
  party?: number;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  parties: number;
  signingOrder: 'sequential' | 'parallel';
  requiresApproval: boolean;
  securityLevel: 'standard' | 'high' | 'enterprise';
  reminderDays: number;
  expirationDays: number;
  category: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  documentStructure: string;
  fields: FormField[];
  workflowPresetId?: string; // Reference to workflow, stored separately
  hasWorkflow: boolean; // Flag to indicate if workflow is configured
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  usageCount: number;
  validated: boolean;
  fxdaDocumentId?: string; // Link to FXDA document
}

export interface TemplateMetadata {
  id: string;
  name: string;
  category: string;
  thumbnail?: string;
  workflowBadges: string[];
  policyIndicators: string[];
  usageCount: number;
}
