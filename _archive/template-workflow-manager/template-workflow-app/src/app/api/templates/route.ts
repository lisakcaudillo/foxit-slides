import { NextResponse } from 'next/server';
import { mockTemplates } from '@/data/mockData';

export async function GET() {
  return NextResponse.json(mockTemplates);
}

export async function POST(request: Request) {
  const body = await request.json();
  
  // In a real app, this would save to a database
  const newTemplate = {
    id: `tpl-${Date.now()}`,
    ...body,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    validated: false,
  };
  
  return NextResponse.json(newTemplate, { status: 201 });
}
