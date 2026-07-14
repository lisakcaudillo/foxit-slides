/**
 * seed-stock-library.mjs
 *
 * One-off curator: builds out the shared image library with a TOP-TIER,
 * presentation-ready set of free stock photos from Pexels (commercial-use,
 * no attribution required — we still store a credit for provenance).
 *
 * Why a dedicated script (vs the runtime /api/images/stock path): the runtime
 * path is tuned for "one relevant photo per slide at generation time". This is
 * a curation pass — fetch a large pool per category, filter for resolution +
 * 16:9 fitness, dedupe globally + by photographer for variety, crop every pick
 * to a uniform 1600×900 (clean library grid, perfect for full-bleed title
 * slides), and write into app/public/library/ using the SAME metadata shape as
 * imageLibrary.ts so the Media panel / "more like this" ranking just work.
 *
 * Categories are tagged via the established `[category]` prompt-prefix
 * convention so they're filterable/greppable in metadata.json.
 *
 * Usage (from repo root or app/):
 *   node app/scripts/seed-stock-library.mjs            # full curated run (~8/category)
 *   node app/scripts/seed-stock-library.mjs --per 6    # N per category
 *   node app/scripts/seed-stock-library.mjs --only abstract-gradient,technology
 *   node app/scripts/seed-stock-library.mjs --dry-run  # plan only, no downloads/writes
 *
 * Key: reads PEXELS_API_KEY from app/.env.local (or process.env).
 * Safe to re-run: globally dedupes against photo ids already present in
 * metadata.json (via the [stock:pexels#<id>] tag), so re-runs add only new art.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ lives under app/ → library is ../public/library
const APP_DIR = path.resolve(__dirname, '..');
const LIBRARY_DIR = path.join(APP_DIR, 'public', 'library');
const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
const METADATA_PATH = path.join(LIBRARY_DIR, 'metadata.json');

// ── Curated categories ──────────────────────────────────────────────────────
// Each category: a human label (drives searchable keywords) + one or more
// Pexels queries whose pools merge. Queries are chosen to reliably surface
// premium, well-lit, editorial imagery — the kind that reads as "designed",
// not "clip-art stock". Order roughly: title-hero abstracts → business →
// tech → finance → people → nature/sustainability → architecture → science.
const CATEGORIES = [
  {
    key: 'abstract-gradient',
    label: 'abstract gradient color flow soft light',
    queries: ['gradient abstract background', 'colorful abstract flowing', 'abstract color soft light'],
  },
  {
    key: 'minimal-texture',
    label: 'minimal neutral texture surface backdrop',
    queries: ['minimal neutral texture', 'marble texture surface', 'concrete minimal background'],
  },
  {
    key: 'aerial-landscape',
    label: 'aerial drone landscape mountains nature vista',
    queries: ['aerial mountain landscape', 'drone forest landscape', 'aerial coastline nature'],
  },
  {
    key: 'ocean-water',
    label: 'ocean water waves sea calm surface',
    queries: ['ocean waves aerial', 'calm water surface', 'sea horizon minimal'],
  },
  {
    key: 'modern-office',
    label: 'modern office workspace interior architecture',
    queries: ['modern office interior', 'minimal office space', 'coworking space architecture'],
  },
  {
    key: 'business-team',
    label: 'business team collaboration meeting diverse professionals',
    queries: ['business team meeting', 'team collaboration office', 'diverse professionals working'],
  },
  {
    key: 'technology',
    label: 'technology network data digital abstract futuristic',
    queries: ['technology network abstract', 'data center server', 'digital technology blue'],
  },
  {
    key: 'developer',
    label: 'software developer coding screen engineering',
    queries: ['software developer working', 'programming code screen', 'engineer computer'],
  },
  {
    key: 'finance-growth',
    label: 'finance growth chart investment market business',
    queries: ['financial chart growth', 'stock market data', 'business finance analysis'],
  },
  {
    key: 'city-architecture',
    label: 'city skyline modern architecture building urban',
    queries: ['city skyline aerial', 'modern architecture building', 'glass building facade'],
  },
  {
    key: 'renewable-energy',
    label: 'renewable energy solar wind sustainability green',
    queries: ['solar panels field', 'wind turbine renewable', 'clean energy landscape'],
  },
  {
    key: 'remote-work',
    label: 'remote work laptop lifestyle home desk',
    queries: ['remote work laptop', 'home office desk', 'working from home professional'],
  },
  {
    key: 'creative-design',
    label: 'creative design studio workspace tools craft',
    queries: ['creative workspace design', 'designer studio desk', 'design tools flatlay'],
  },
  {
    key: 'science-lab',
    label: 'science laboratory research medical innovation',
    queries: ['science laboratory research', 'medical research lab', 'biotech science'],
  },
  {
    key: 'nature-macro',
    label: 'nature green leaves botanical organic macro',
    queries: ['green leaves macro', 'botanical nature close', 'plant organic texture'],
  },
  {
    key: 'sky-horizon',
    label: 'sky clouds sunset horizon atmospheric calm',
    queries: ['sunset sky clouds', 'minimal sky horizon', 'dramatic clouds atmosphere'],
  },
  // ── Batch 2: rounding out the common deck needs ────────────────────────────
  {
    key: 'healthcare-medical',
    label: 'healthcare medical doctor patient hospital care',
    queries: ['doctor patient care', 'hospital medical professional', 'healthcare modern clinic'],
  },
  {
    key: 'education-learning',
    label: 'education learning students classroom study campus',
    queries: ['students classroom learning', 'university campus students', 'study books learning'],
  },
  {
    key: 'food-culinary',
    label: 'food culinary cooking ingredients dining gourmet',
    queries: ['gourmet food plating', 'fresh ingredients cooking', 'restaurant dining table'],
  },
  {
    key: 'travel-destination',
    label: 'travel destination journey hospitality scenery',
    queries: ['travel destination scenery', 'luxury hotel resort', 'airplane travel window'],
  },
  {
    key: 'retail-shopping',
    label: 'retail shopping store commerce product fashion',
    queries: ['modern retail store', 'shopping fashion boutique', 'product display store'],
  },
  {
    key: 'abstract-3d',
    label: 'abstract 3d render geometric shapes glass minimal',
    queries: ['3d render abstract shapes', 'geometric abstract minimal', 'abstract glass render'],
  },
  {
    key: 'data-analytics',
    label: 'data analytics dashboard charts screen insights',
    queries: ['data analytics dashboard', 'business analytics screen', 'charts graph monitor'],
  },
  {
    key: 'manufacturing-industry',
    label: 'manufacturing industry factory automation production',
    queries: ['modern factory automation', 'industrial manufacturing', 'production line robotics'],
  },
  {
    key: 'people-portrait',
    label: 'professional portrait person confident candid environmental',
    queries: ['confident professional portrait', 'business person portrait', 'creative professional candid'],
  },
  {
    key: 'wellness-mindfulness',
    label: 'wellness mindfulness calm yoga meditation balance',
    queries: ['yoga meditation calm', 'wellness spa relax', 'mindfulness nature peaceful'],
  },
  {
    key: 'agriculture-farming',
    label: 'agriculture farming crops field sustainable harvest',
    queries: ['agriculture field crops', 'sustainable farming', 'farmland aerial green'],
  },
  {
    key: 'logistics-transport',
    label: 'logistics transport shipping supply chain cargo',
    queries: ['shipping container port', 'cargo logistics truck', 'warehouse supply chain'],
  },
  {
    key: 'marketing-content',
    label: 'marketing content creation camera social creative',
    queries: ['content creator camera', 'social media workspace', 'photographer creative shoot'],
  },
  {
    key: 'conference-event',
    label: 'conference event audience speaker presentation stage',
    queries: ['conference audience presentation', 'business event speaker', 'seminar stage crowd'],
  },
  {
    key: 'real-estate-interior',
    label: 'real estate modern home interior architecture design',
    queries: ['modern home interior', 'luxury living room design', 'minimal interior architecture'],
  },
  {
    key: 'partnership-handshake',
    label: 'partnership handshake agreement deal collaboration trust',
    queries: ['business handshake deal', 'partnership agreement', 'professional handshake meeting'],
  },
  // ── Batch 3: designed cover-art styles (Gamma motion-glass / editorial) ─────
  // These are the looks stock can approximate but AI gen art-directs best —
  // pulled from stock for an immediate, free option; AI-gen versions (the
  // surviving glass-centerpiece / ribbon-paper prompts) remain the premium tier.
  {
    key: 'glassmorphism',
    label: 'glassmorphism frosted translucent glass blur iridescent 3d render',
    queries: ['frosted glass texture', 'translucent glass abstract', 'iridescent glass blur', '3d glass render abstract'],
  },
  {
    key: 'ribbons',
    label: 'flowing ribbon silk satin fabric wave elegant drape',
    queries: ['silk ribbon flowing', 'satin fabric waves', 'flowing fabric abstract', 'silk wave texture'],
  },
  {
    key: 'abstract-art',
    label: 'abstract art painterly fluid colorful artistic expressive',
    queries: ['abstract painting art', 'abstract fluid art', 'colorful abstract artistic', 'modern abstract texture'],
  },
  {
    key: 'minimalist',
    label: 'minimalist minimal geometric clean negative space simple design',
    queries: ['minimalist abstract', 'minimal geometric design', 'minimal negative space', 'simple minimal background'],
  },
];

// New-in-batch-2 keys, for convenient `--only batch2`.
const BATCH2 = [
  'healthcare-medical', 'education-learning', 'food-culinary', 'travel-destination',
  'retail-shopping', 'abstract-3d', 'data-analytics', 'manufacturing-industry',
  'people-portrait', 'wellness-mindfulness', 'agriculture-farming', 'logistics-transport',
  'marketing-content', 'conference-event', 'real-estate-interior', 'partnership-handshake',
];

// Batch 3 — designed cover-art styles.
const BATCH3 = ['glassmorphism', 'ribbons', 'abstract-art', 'minimalist'];

// ── Args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { per: 8, only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--per') out.per = parseInt(argv[++i], 10) || out.per;
    else if (a === '--only') {
      const raw = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
      out.only = raw.flatMap((k) => (k === 'batch2' ? BATCH2 : k === 'batch3' ? BATCH3 : k));
    }
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

// ── Pexels key from app/.env.local ────────────────────────────────────────────
async function loadPexelsKey() {
  if (process.env.PEXELS_API_KEY) return process.env.PEXELS_API_KEY;
  try {
    const env = await fs.readFile(path.join(APP_DIR, '.env.local'), 'utf-8');
    const line = env.split(/\r?\n/).find((l) => l.startsWith('PEXELS_API_KEY='));
    if (line) return line.slice('PEXELS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  } catch {
    /* no env file */
  }
  return null;
}

async function searchPexels(key, query, perPage) {
  const params = new URLSearchParams({ query, per_page: String(perPage), orientation: 'landscape' });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key } });
  if (!res.ok) {
    console.warn(`  ! Pexels ${res.status} for "${query}"`);
    return [];
  }
  const data = await res.json();
  return data.photos ?? [];
}

// Uniform 16:9 presentation crop at 1600×900 from a Pexels photo.
function cropUrl(photo) {
  const base = photo.src?.original;
  if (!base) return null;
  return `${base}?auto=compress&cs=tinysrgb&fit=crop&w=1600&h=900`;
}

function newId() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function readMetadata() {
  try {
    const raw = await fs.readFile(METADATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.images)) return parsed;
  } catch {
    /* missing/unparseable → empty */
  }
  return { images: [] };
}

async function writeMetadata(meta) {
  const tmp = METADATA_PATH + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  await fs.rename(tmp, METADATA_PATH);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = await loadPexelsKey();
  if (!key) {
    console.error('No PEXELS_API_KEY found (env or app/.env.local). Aborting.');
    process.exit(1);
  }

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const meta = await readMetadata();

  // Global dedupe: collect Pexels photo ids already in the library (tagged
  // [stock:pexels#<id>]) so re-runs never re-add the same photo.
  const seenIds = new Set();
  for (const img of meta.images) {
    const m = (img.prompt || '').match(/\[stock:pexels#(\d+)\]/);
    if (m) seenIds.add(m[1]);
  }

  const categories = args.only ? CATEGORIES.filter((c) => args.only.includes(c.key)) : CATEGORIES;
  if (categories.length === 0) {
    console.error(`No matching categories for --only ${args.only?.join(',')}.`);
    process.exit(1);
  }

  console.log(`Seeding stock library → ${IMAGES_DIR}`);
  console.log(`Categories: ${categories.length} · target ${args.per}/category · already in library: ${meta.images.length}\n`);

  const newEntries = [];
  let downloaded = 0;

  for (const cat of categories) {
    // Merge pools from all queries, dedupe by photo id, drop globally-seen.
    const pool = [];
    const poolIds = new Set();
    for (const q of cat.queries) {
      const photos = await searchPexels(key, q, 30);
      for (const p of photos) {
        const id = String(p.id);
        if (poolIds.has(id) || seenIds.has(id)) continue;
        // Quality gate: large enough to crop without upscaling, landscape-ish.
        const ar = p.width / p.height;
        if (p.width < 1600 || ar < 1.2 || ar > 2.2) continue;
        poolIds.add(id);
        pool.push(p);
      }
      await sleep(250); // gentle on the API
    }

    // Variety: prefer one-per-photographer; relax if pool is too small.
    const byPhotog = new Set();
    const primary = [];
    const overflow = [];
    for (const p of pool) {
      const who = p.photographer || String(p.photographer_id || '');
      if (who && byPhotog.has(who)) overflow.push(p);
      else {
        byPhotog.add(who);
        primary.push(p);
      }
    }
    const picks = [...primary, ...overflow].slice(0, args.per);

    console.log(`▸ ${cat.key}: pool ${pool.length} → picking ${picks.length}`);
    if (args.dryRun) {
      for (const p of picks) console.log(`    · ${p.id} ${p.width}×${p.height} by ${p.photographer}`);
      continue;
    }

    for (const p of picks) {
      const url = cropUrl(p);
      if (!url) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`    ! download ${res.status} for ${p.id}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const id = newId();
        const filename = `${id}.jpg`;
        await fs.writeFile(path.join(IMAGES_DIR, filename), buf);
        seenIds.add(String(p.id));
        newEntries.push({
          id,
          filename,
          // [category] keeps it filterable; [stock:pexels#id] enables re-run
          // dedupe; label gives "more like this" Jaccard real keywords; credit
          // is provenance.
          prompt: `[${cat.key}] [stock:pexels#${p.id}] ${cat.label}. Photo by ${p.photographer || 'Pexels'} on Pexels`,
          type: 'photo',
          quality: 'stock',
          width: 1600,
          height: 900,
          createdAt: new Date().toISOString(),
        });
        downloaded++;
        await sleep(120);
      } catch (err) {
        console.warn(`    ! failed ${p.id}: ${err.message}`);
      }
    }
  }

  if (args.dryRun) {
    console.log('\nDry run — nothing written.');
    return;
  }

  if (newEntries.length > 0) {
    meta.images = [...newEntries, ...meta.images]; // most-recent-first, matches lib
    await writeMetadata(meta);
  }

  console.log(`\nDone. Added ${downloaded} images. Library now: ${meta.images.length} entries.`);
  console.log(`Metadata: ${METADATA_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
