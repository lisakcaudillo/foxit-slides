import { NextResponse } from 'next/server';
import { generateComboLayouts } from '@/lib/card-engine/combo-baseline';
export async function GET() { return NextResponse.json(generateComboLayouts()); }
