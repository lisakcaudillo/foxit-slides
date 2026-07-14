import { NextRequest, NextResponse } from 'next/server';
import { inferFields } from '@/lib/claude';

/** Page dimensions in PDF points (US Letter) */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const TOP_MARGIN = 50;
const BOTTOM_MARGIN = 42; // 792 - 750

interface LayoutHint {
  text: string;
  lineNumber: number;
  suggestedY: number;
  suggestedFieldType: string;
}

/**
 * Patterns that indicate where form fields should be placed.
 * Each pattern maps to a field type for layout hint generation.
 */
const FIELD_PATTERNS: Array<{ pattern: RegExp; fieldType: string }> = [
  { pattern: /\bsignature\b/i, fieldType: 'signature' },
  { pattern: /\bsigned?\b.*\bby\b/i, fieldType: 'signature' },
  { pattern: /\bdate\b[:\s]/i, fieldType: 'date' },
  { pattern: /\bdated?\b[:\s]/i, fieldType: 'date' },
  { pattern: /\beffective\s+date\b/i, fieldType: 'date' },
  { pattern: /\bname\b[:\s]/i, fieldType: 'text' },
  { pattern: /\bprint\s+name\b/i, fieldType: 'text' },
  { pattern: /\btitle\b[:\s]/i, fieldType: 'text' },
  { pattern: /\bcompany\b[:\s]/i, fieldType: 'text' },
  { pattern: /\borganization\b[:\s]/i, fieldType: 'text' },
  { pattern: /\baddress\b[:\s]/i, fieldType: 'text' },
  { pattern: /\bemail\b[:\s]/i, fieldType: 'text' },
  { pattern: /\bphone\b[:\s]/i, fieldType: 'text' },
  { pattern: /\binitial\b/i, fieldType: 'initial' },
  { pattern: /\[\s*\w[^\]]*\s*\]/, fieldType: 'text' }, // [Placeholder] patterns
  { pattern: /_{3,}/, fieldType: 'text' }, // ___ blank lines
  { pattern: /\b[☐□]\s/i, fieldType: 'checkbox' },
];

/**
 * Analyze document content to extract layout hints that give Claude
 * structural awareness of where fields should be placed.
 */
function extractLayoutHints(content: string): LayoutHint[] {
  const lines = content.split('\n');
  const totalLines = lines.length;
  if (totalLines === 0) return [];

  const usableHeight = PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
  const hints: LayoutHint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    for (const { pattern, fieldType } of FIELD_PATTERNS) {
      if (pattern.test(line)) {
        const lineNumber = i + 1;
        const suggestedY = TOP_MARGIN + (lineNumber / totalLines) * usableHeight;

        hints.push({
          text: line.substring(0, 120), // truncate long lines
          lineNumber,
          suggestedY: Math.round(suggestedY),
          suggestedFieldType: fieldType,
        });
        break; // one hint per line
      }
    }
  }

  return hints;
}

export async function POST(request: NextRequest) {
  try {
    const { documentContent, existingFields } = await request.json();

    if (!documentContent || typeof documentContent !== 'string') {
      return NextResponse.json(
        { error: 'documentContent is required' },
        { status: 400 },
      );
    }

    const layoutHints = extractLayoutHints(documentContent);

    const result = await inferFields({
      documentContent,
      existingFields,
      layoutHints: layoutHints.length > 0 ? layoutHints : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Field inference failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
