/**
 * rebuild-library-metadata.ts
 *
 * One-time curator tool: reconciles
 *   app/public/library/metadata.json
 * with whatever PNG/JPG/WEBP files actually live in
 *   app/public/library/images/
 *
 * Workflow:
 *   1. During dev/test, every AI-generated image auto-saves to the library.
 *   2. Before demo/launch, the maintainer opens app/public/library/images/ in
 *      Explorer and deletes the unusable / inappropriate / duplicate files.
 *   3. the maintainer runs this script. It:
 *        - drops metadata entries whose file no longer exists on disk
 *        - keeps the rest in original order
 *        - leaves orphan files (on disk but missing from metadata) untouched
 *          and logs them so the curator can decide what to do
 *   4. the maintainer commits the cleaned folder + rebuilt metadata.json. That snapshot
 *      ships with the product as the seed library end users browse.
 *
 * Run from repo root or app/:
 *   npx tsx app/scripts/rebuild-library-metadata.ts
 *   or
 *   cd app && npx tsx scripts/rebuild-library-metadata.ts
 *
 * Safe to run repeatedly. Writes via tmp+rename like the runtime code.
 */

import { promises as fs } from 'fs';
import path from 'path';

interface LibraryImage {
  id: string;
  filename: string;
  prompt: string;
  type: 'photo' | 'diagram';
  quality: string;
  width: number;
  height: number;
  createdAt: string;
}

interface LibraryMetadata {
  images: LibraryImage[];
}

async function main(): Promise<void> {
  // Resolve the library dir relative to repo layout, regardless of where
  // the script is run from. cwd ends in either `compose/` (repo root) or
  // `compose/app/` (after `cd app`).
  const cwd = process.cwd();
  const libraryDir = cwd.endsWith(path.sep + 'app')
    ? path.join(cwd, 'public', 'library')
    : path.join(cwd, 'app', 'public', 'library');

  const imagesDir = path.join(libraryDir, 'images');
  const metadataPath = path.join(libraryDir, 'metadata.json');

  // Read current metadata.
  let metadata: LibraryMetadata;
  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(raw) as LibraryMetadata;
    if (!metadata || !Array.isArray(metadata.images)) {
      throw new Error('metadata.json is not in expected shape');
    }
  } catch (err) {
    console.error(`[rebuild] cannot read ${metadataPath}:`, err);
    process.exit(1);
    return;
  }

  // List actual image files on disk.
  let onDisk: string[];
  try {
    onDisk = await fs.readdir(imagesDir);
  } catch (err) {
    console.error(`[rebuild] cannot read ${imagesDir}:`, err);
    process.exit(1);
    return;
  }
  const onDiskSet = new Set(onDisk);

  // Partition metadata: keep entries whose file still exists; drop the rest.
  const kept: LibraryImage[] = [];
  const dropped: LibraryImage[] = [];
  for (const entry of metadata.images) {
    if (onDiskSet.has(entry.filename)) {
      kept.push(entry);
    } else {
      dropped.push(entry);
    }
  }

  // Flag files on disk that have no metadata entry — orphans the curator
  // may want to either describe (add to metadata manually) or delete.
  const knownFilenames = new Set(metadata.images.map((i) => i.filename));
  const orphans = onDisk.filter(
    (f) => !knownFilenames.has(f) && /\.(png|jpg|jpeg|webp)$/i.test(f),
  );

  // Print the summary before writing so the curator can ctrl-C if it looks
  // wrong.
  console.log('Library rebuild summary');
  console.log('─'.repeat(60));
  console.log(`  metadata entries before:  ${metadata.images.length}`);
  console.log(`  files on disk:            ${onDisk.length}`);
  console.log(`  metadata entries kept:    ${kept.length}`);
  console.log(`  metadata entries dropped: ${dropped.length}`);
  console.log(`  orphan files (on disk, not in metadata): ${orphans.length}`);
  if (dropped.length > 0) {
    console.log('\nDropped (file no longer exists):');
    for (const d of dropped) console.log(`  - ${d.filename}  ${truncate(d.prompt, 60)}`);
  }
  if (orphans.length > 0) {
    console.log('\nOrphans (consider adding to metadata or deleting):');
    for (const o of orphans) console.log(`  - ${o}`);
  }
  console.log('─'.repeat(60));

  if (dropped.length === 0 && orphans.length === 0) {
    console.log('Nothing to do — metadata already matches disk.');
    return;
  }

  // Atomic write via tmp + rename, same pattern as the runtime helper.
  const next: LibraryMetadata = { images: kept };
  const tmp = metadataPath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8');
  await fs.rename(tmp, metadataPath);
  console.log(`\nWrote ${metadataPath} with ${kept.length} entries.`);
  if (orphans.length > 0) {
    console.log('Orphan files were NOT touched. Decide what to do with them and re-run if needed.');
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

main().catch((err) => {
  console.error('[rebuild] fatal:', err);
  process.exit(1);
});
