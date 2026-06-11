// FXDA (Foxit Document Automation) JSON Format Types

export interface FXDAField {
  id: string;
  type: 'text' | 'signature' | 'date' | 'checkbox' | 'dropdown' | 'initial' | 'company';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required: boolean;
  party?: number;
  placeholder?: string;
  options?: string[]; // For dropdown
  fontSize?: number;
  fontFamily?: string;
  validation?: string;
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
