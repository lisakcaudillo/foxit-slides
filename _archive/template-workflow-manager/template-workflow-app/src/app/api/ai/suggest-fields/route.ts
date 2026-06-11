import { NextResponse } from 'next/server';
import { FXDAField } from '@/types/fxda';

export async function POST(request: Request) {
  const body = await request.json();
  const { content } = body || { content: '' };

  // Very small heuristic to suggest fields based on keywords and simple rules
  const lower = (content || '').toLowerCase();
  const fields: FXDAField[] = [];
  let fieldY = 120;

  // If the document mentions signature or sign, add signature fields
  if (lower.includes('signature') || lower.includes('sign')) {
    fields.push({
      id: `sig_1`,
      type: 'signature',
      name: 'Signature',
      x: 50,
      y: fieldY,
      width: 200,
      height: 50,
      page: 1,
      required: true,
      fontSize: 14,
      fontFamily: 'Brush Script MT',
    } as FXDAField);
    fieldY += 100;
  }

  // Add effective date if date mentioned or 'effective date' appears
  if (lower.includes('effective date') || lower.includes('date')) {
    fields.push({
      id: 'effective_date',
      type: 'date',
      name: 'Effective Date',
      x: 300,
      y: 120,
      width: 150,
      height: 30,
      page: 1,
      required: true,
      fontSize: 12,
      fontFamily: 'Arial',
    } as FXDAField);
  }

  // If NDA or confidentiality, add a confirmation checkbox
  if (lower.includes('nda') || lower.includes('confidential')) {
    fields.push({
      id: 'confirm_read',
      type: 'checkbox',
      name: 'I confirm I have read and understand this agreement',
      x: 50,
      y: fieldY + 20,
      width: 20,
      height: 20,
      page: 1,
      required: true,
      fontSize: 12,
      fontFamily: 'Arial',
    } as FXDAField);
  }

  // Fallback: add a party name and date
  if (fields.length === 0) {
    fields.push({
      id: 'party1_name',
      type: 'text',
      name: 'Party 1 Name',
      x: 50,
      y: 600,
      width: 250,
      height: 30,
      page: 1,
      required: true,
      fontSize: 12,
      fontFamily: 'Arial',
    } as FXDAField);
  }

  return NextResponse.json({ fields });
}
