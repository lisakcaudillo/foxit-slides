import { NextResponse } from 'next/server';
import { FXDATemplate, FXDAField, FXDAPage } from '@/types/fxda';

// Mock AI service for generating templates in FXDA format
export async function POST(request: Request) {
  const { prompt } = await request.json();
  
  // Simulate AI processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const templateName = extractTemplateName(prompt);
  const category = extractCategory(prompt);
  const documentId = `fxda-${Date.now()}`;
  
  // Generate FXDA JSON structure
  const fxdaTemplate: FXDATemplate = {
    version: '1.0',
    documentId,
    documentName: templateName,
    description: `AI-generated ${templateName.toLowerCase()} based on your requirements`,
    category,
    pages: generatePages(prompt),
    fields: generateFXDAFields(prompt),
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'AI Assistant',
      templateType: category.toLowerCase(),
      version: 1,
    },
    workflowPresetId: suggestWorkflow(prompt),
    tags: extractTags(prompt),
  };
  
  return NextResponse.json(fxdaTemplate);
}

function extractTemplateName(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('nda') || lowerPrompt.includes('non-disclosure')) return 'Non-Disclosure Agreement';
  if (lowerPrompt.includes('offer') || lowerPrompt.includes('employment')) return 'Employment Offer Letter';
  if (lowerPrompt.includes('vendor') || lowerPrompt.includes('contract')) return 'Vendor Service Agreement';
  if (lowerPrompt.includes('consulting') || lowerPrompt.includes('contractor')) return 'Consulting Agreement';
  return 'Business Agreement';
}

function extractCategory(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('legal') || lowerPrompt.includes('nda')) return 'Legal';
  if (lowerPrompt.includes('hr') || lowerPrompt.includes('employee')) return 'HR';
  if (lowerPrompt.includes('vendor') || lowerPrompt.includes('procurement')) return 'Procurement';
  return 'General';
}

function extractTags(prompt: string): string[] {
  const tags: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('nda')) tags.push('nda', 'confidential');
  if (lowerPrompt.includes('vendor')) tags.push('vendor', 'procurement');
  if (lowerPrompt.includes('employee') || lowerPrompt.includes('hr')) tags.push('hr', 'hiring');
  if (lowerPrompt.includes('sequential')) tags.push('sequential');
  if (lowerPrompt.includes('parallel')) tags.push('parallel');
  
  return tags.length > 0 ? tags : ['general', 'agreement'];
}

function generatePages(prompt: string): FXDAPage[] {
  const templateName = extractTemplateName(prompt);
  
  return [{
    pageNumber: 1,
    width: 612, // 8.5 inches * 72 DPI
    height: 792, // 11 inches * 72 DPI
    content: `${templateName}

This agreement is entered into between the parties identified below.

WHEREAS, the parties wish to establish terms and conditions for their business relationship;

NOW, THEREFORE, in consideration of the mutual covenants contained herein, the parties agree as follows:

1. DEFINITIONS
   The terms used in this Agreement shall have the meanings set forth herein.

2. OBLIGATIONS
   Each party agrees to fulfill their respective obligations as outlined in this document.

3. CONFIDENTIALITY
   ${prompt.toLowerCase().includes('nda') || prompt.toLowerCase().includes('confidential') 
     ? 'All information exchanged shall be kept strictly confidential and shall not be disclosed to third parties without prior written consent.'
     : 'The parties agree to maintain confidentiality regarding proprietary information.'}

4. TERM AND TERMINATION
   This Agreement shall commence on the Effective Date and continue as specified.

5. SIGNATURES
   By signing below, the parties agree to be bound by the terms of this Agreement.
`,
  }];
}

function generateFXDAFields(prompt: string): FXDAField[] {
  const lowerPrompt = prompt.toLowerCase();
  const fields: FXDAField[] = [];
  let fieldY = 650; // Start near bottom of page for signature fields
  
  // Determine number of parties
  const numParties = lowerPrompt.includes('2 part') || lowerPrompt.includes('two part') ? 2 : 
                     lowerPrompt.includes('3 part') || lowerPrompt.includes('three part') ? 3 : 2;
  
  // Add fields for each party
  for (let i = 1; i <= numParties; i++) {
    const partyLabel = i === 1 ? 'First' : i === 2 ? 'Second' : 'Third';
    
    // Party Name
    fields.push({
      id: `party${i}_name`,
      type: 'text',
      name: `${partyLabel} Party Name`,
      x: 50,
      y: fieldY - (i - 1) * 140,
      width: 250,
      height: 30,
      page: 1,
      required: true,
      party: i,
      placeholder: `Enter ${partyLabel.toLowerCase()} party name`,
      fontSize: 12,
      fontFamily: 'Arial',
    });
    
    // Party Title/Company (for business agreements)
    fields.push({
      id: `party${i}_title`,
      type: 'text',
      name: `${partyLabel} Party Title/Company`,
      x: 320,
      y: fieldY - (i - 1) * 140,
      width: 240,
      height: 30,
      page: 1,
      required: false,
      party: i,
      placeholder: 'Title or Company',
      fontSize: 12,
      fontFamily: 'Arial',
    });
    
    // Signature
    fields.push({
      id: `party${i}_signature`,
      type: 'signature',
      name: `${partyLabel} Party Signature`,
      x: 50,
      y: fieldY - 40 - (i - 1) * 140,
      width: 200,
      height: 50,
      page: 1,
      required: true,
      party: i,
      fontSize: 14,
      fontFamily: 'Brush Script MT',
    });
    
    // Date
    fields.push({
      id: `party${i}_date`,
      type: 'date',
      name: `Date Signed`,
      x: 270,
      y: fieldY - 40 - (i - 1) * 140,
      width: 150,
      height: 30,
      page: 1,
      required: true,
      party: i,
      fontSize: 12,
      fontFamily: 'Arial',
    });
    
    // Add checkboxes for NDA or agreements with acceptance clauses
    if (lowerPrompt.includes('nda') || lowerPrompt.includes('agree') || lowerPrompt.includes('accept')) {
      fields.push({
        id: `party${i}_accept`,
        type: 'checkbox',
        name: `${partyLabel} Party Acceptance`,
        x: 450,
        y: fieldY - 40 - (i - 1) * 140,
        width: 20,
        height: 20,
        page: 1,
        required: true,
        party: i,
        fontSize: 12,
        fontFamily: 'Arial',
      });
    }
  }
  
  // Add effective date field at top
  fields.push({
    id: 'effective_date',
    type: 'date',
    name: 'Effective Date',
    x: 400,
    y: 100,
    width: 150,
    height: 30,
    page: 1,
    required: true,
    placeholder: 'MM/DD/YYYY',
    fontSize: 12,
    fontFamily: 'Arial',
  });
  
  // Add optional checkboxes for common agreement elements
  if (lowerPrompt.includes('confidential') || lowerPrompt.includes('nda')) {
    fields.push({
      id: 'confirm_read',
      type: 'checkbox',
      name: 'I confirm I have read and understand this agreement',
      x: 50,
      y: 400,
      width: 20,
      height: 20,
      page: 1,
      required: true,
      fontSize: 12,
      fontFamily: 'Arial',
    });
  }
  
  return fields;
}

function suggestWorkflow(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('nda')) return 'nda-standard';
  if (lowerPrompt.includes('offer')) return 'hr-offer';
  if (lowerPrompt.includes('vendor')) return 'vendor-contract';
  if (lowerPrompt.includes('sequential')) return 'nda-standard';
  if (lowerPrompt.includes('parallel')) return 'simple-agreement';
  return 'simple-agreement';
}
