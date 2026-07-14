// FXDA (Foxit Document Automation) JSON Format Types

// Field types match Foxit eSign API natively — no translation layer needed.
// This ensures full field parity with eSign and eliminates conversion steps.
export type ESignFieldType =
  | 'signature'
  | 'initial'
  | 'text'
  | 'textbox'
  | 'date'
  | 'checkbox'
  | 'radiobutton'
  | 'dropdown'
  | 'attachment'
  | 'image'
  | 'secure'
  | 'accept'
  | 'decline';

export interface FXDAField {
  id: string;
  type: ESignFieldType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required: boolean;
  party?: number;
  placeholder?: string;
  options?: string[]; // For dropdown / radiobutton
  fontSize?: number;
  fontColor?: string;
  characterLimit?: number;
  dateFormat?: string; // For date fields (e.g., "MM-DD-YYYY")
  tabOrder?: number;
  hideFieldNameForRecipients?: boolean;
}

export interface FXDAPage {
  pageNumber: number;
  width: number;
  height: number;
  content: string;
}

export interface FXDADocument {
  version: string;
  documentId: string;
  documentName: string;
  description: string;
  category: string;
  pages: FXDAPage[];
  fields: FXDAField[];
  metadata: {
    createdAt: string;
    createdBy: string;
    templateType: string;
    version: number;
  };
}

export interface FXDATemplate extends FXDADocument {
  workflowPresetId?: string;
  tags: string[];
}

// Block type classification for intelligent document decomposition
export type FXDABlockType =
  | 'heading'
  | 'paragraph'
  | 'clause'
  | 'definition'
  | 'list'
  | 'table'
  | 'data'
  | 'signature-block'
  | 'exhibit'
  | 'field-placeholder';

export interface FXDABlock {
  id: string;
  type: FXDABlockType;
  content: string;
  page: number;
  bookmark: string | null;
  clauseNumber?: string;         // e.g. "3.1", "4.2(a)"
  rows?: string[][];             // parsed table rows
  term?: string;                 // the defined term
  party?: number;                // which party this block belongs to
  exhibitLabel?: string;         // e.g. "Exhibit A", "Schedule 1"
  fieldType?: ESignFieldType; // inferred field type for this placeholder
  // Data block fields (stat-row, card-grid layouts)
  dataLayout?: 'stat-row' | 'card-grid';
  dataItems?: Array<{ label: string; value: string | number; unit?: string }>;
}
