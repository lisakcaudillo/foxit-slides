import { NextResponse } from 'next/server';
import { workflowPresets } from '@/data/mockData';

export async function GET() {
  return NextResponse.json(workflowPresets);
}
