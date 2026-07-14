// Type definitions for the template management system

// --- Canvas Block types (shared by Canvas component and editor routes) ---

export interface BlockDiff {
  deleted: string;
  inserted: string;
}

export interface SignField {
  id: string;
  type: 'signature' | 'initial' | 'text' | 'textbox' | 'date' | 'checkbox' | 'radiobutton' | 'dropdown' | 'attachment' | 'image' | 'secure' | 'accept' | 'decline';
  partyIndex: number;
  label: string;
  offsetY?: number; // legacy: 0-100 percentage within the block for vertical positioning
  // Page-level absolute positioning (percentage of page content area)
  x?: number;       // 0-100 percentage from left edge of page content
  y?: number;       // 0-100 percentage from top edge of page content
  width?: number;   // width in px (default: 120)
  height?: number;  // height in px (default: 32)
  pageIndex?: number; // which page (0-based)
  blockId?: string; // legacy: which block this field was attached to
}

export interface SignParty {
  name: string;
  email: string;
  role: string; // "Signer", "Approver", "Viewer"
  color: string; // for visual distinction on canvas
}

export interface Block {
  id: string;
  content: string;
  diff: BlockDiff | null;
  bookmark?: string; // heading bookmark label, extracted from PDF structure
  signFields?: SignField[];
  // Structural metadata from Atlas extraction
  blockType?: 'heading' | 'paragraph' | 'clause' | 'definition' | 'exhibit' | 'table' | 'list' | 'image' | 'signature' | 'data';
  // Data block fields
  dataLayout?: 'stat-row' | 'card-grid';
  dataItems?: Array<{ label: string; value: string | number; unit?: string }>;
  headingLevel?: 1 | 2 | 3;
  clauseType?: string; // definition, obligation, condition-precedent, termination, representation
  clauseNumber?: string; // e.g., "1.1", "7.2"
  parentId?: string; // ID of the heading block this belongs to
  sectionPath?: string[]; // e.g., ["TERMS OF EMPLOYMENT", "Salary and Benefits"]
  // Freeform positioning on the A4 page (Gamma-style floating cards)
  position?: {
    x: number;    // pixels from left edge of A4 page
    y: number;    // pixels from top edge of A4 page
    width: number;  // width in pixels
    height: number; // height in pixels (0 = auto)
  };
}

// --- Workflow Banner ---

export interface WorkflowBanner {
  name: string;
  onDetach: () => void;
}

// --- Form and Template types ---

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
