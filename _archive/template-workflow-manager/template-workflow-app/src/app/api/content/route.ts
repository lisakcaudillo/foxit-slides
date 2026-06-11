import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const updates = await request.json();
  
  try {
    // Read current content dictionary
    const filePath = path.join(process.cwd(), 'src', 'data', 'contentDictionary.json');
    const currentContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Merge updates
    const updatedContent = { ...currentContent, ...updates };
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(updatedContent, null, 2), 'utf8');
    
    return NextResponse.json({ success: true, updated: Object.keys(updates) });
  } catch (error) {
    console.error('Failed to save content:', error);
    return NextResponse.json({ success: false, error: 'Failed to save content' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'contentDictionary.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return NextResponse.json(content);
  } catch (error) {
    console.error('Failed to read content:', error);
    return NextResponse.json({ error: 'Failed to read content' }, { status: 500 });
  }
}
