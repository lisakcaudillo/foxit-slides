import { NextRequest, NextResponse } from 'next/server';
import { generateMetadata } from '@/lib/claude';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== 'object' ||
      !('documentContent' in body) ||
      typeof (body as Record<string, unknown>).documentContent !== 'string'
    ) {
      return NextResponse.json(
        { error: 'documentContent is required' },
        { status: 400 },
      );
    }

    const { documentContent } = body as { documentContent: string };

    if (!documentContent.trim()) {
      return NextResponse.json(
        { error: 'documentContent must not be empty' },
        { status: 400 },
      );
    }

    const metadata = await generateMetadata({ documentContent });

    return NextResponse.json({ data: metadata, error: null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Metadata generation failed';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
