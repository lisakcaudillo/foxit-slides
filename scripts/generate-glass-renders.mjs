/**
 * generate-glass-renders.mjs
 *
 * Generates PREMIUM 3D glass-render art (the look Lisa confirmed 2026-06-08:
 * cinematic translucent glass ribbons / rings / spirals / droplets with
 * subsurface scattering, water-droplet specular, clean type negative-space) via
 * OpenAI gpt-image-1 — the SAME engine + params as /api/ai/generate-image.
 *
 * Source prompts: the surviving glass-centerpiece .prompt.txt files (the exact
 * recipes that produced Lisa's reference images) + new on-brand ribbon/glass
 * variants across the palette. Each prompt already reserves a typography
 * clean-zone, so we send it near-verbatim (just a hard no-text guard).
 *
 * COSTS MONEY: gpt-image-1 medium landscape ≈ $0.06/image. Rate limit ~5/min →
 * 13s pacing + 429 retry. openai + key resolved from the MAIN checkout.
 *
 * Usage (from repo root or app/):
 *   node app/scripts/generate-glass-renders.mjs                 # full batch
 *   node app/scripts/generate-glass-renders.mjs --only ribbons  # ribbons only
 *   node app/scripts/generate-glass-renders.mjs --dry-run       # list, no spend
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const LIBRARY_DIR = path.join(APP_DIR, 'public', 'library');
const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
const METADATA_PATH = path.join(LIBRARY_DIR, 'metadata.json');
const MAIN_APP = process.env.MAIN_APP || 'C:/Users/lisak/Compose/app';
const GLASS_PROMPTS_DIR = path.join(MAIN_APP, 'public', 'glass-centerpieces');

const require = createRequire(path.join(MAIN_APP, 'package.json'));
let OpenAI;
try {
  OpenAI = require('openai').default ?? require('openai').OpenAI ?? require('openai');
} catch (err) {
  console.error('Could not load openai from', MAIN_APP, '-', err.message);
  process.exit(1);
}

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = await fs.readFile(path.join(MAIN_APP, '.env.local'), 'utf-8');
    const line = env.split(/\r?\n/).find((l) => l.startsWith('OPENAI_API_KEY='));
    if (line) return line.slice('OPENAI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  } catch { /* none */ }
  return null;
}

const NO_TEXT = 'Absolutely no text, letters, words, numbers, or logos anywhere in the image.';

// New on-brand ribbon/glass prompts (same craft register as the originals).
// `cat` decides the library category tag: ribbons join Lisa's ribbons set.
const NEW_PROMPTS = [
  { name: 'ribbon-violet', cat: 'ribbons', text: 'Cinematic 3D render of flowing translucent glass ribbons curving through space, cool gradient palette of deep violet, periwinkle, lavender, and silver, subsurface scattering with soft specular highlights, water droplets on glossy surfaces catching light, shallow depth of field with bokeh, soft rim lighting, premium minimalist aesthetic, clean negative space at right of frame, Octane render quality, 4K' },
  { name: 'ribbon-azure', cat: 'ribbons', text: 'Cinematic 3D render of a continuous translucent glass ribbon flowing diagonally, cool gradient palette of midnight blue, electric cyan, azure, and pearl, subsurface scattering, water droplets catching light, caustic refraction through the glass, shallow depth of field, soft rim lighting, premium minimalist aesthetic, clean negative space upper-right for typography, Cinema 4D rendered, 4K' },
  { name: 'ribbon-emerald', cat: 'ribbons', text: 'A continuous twisted glass ribbon spiraling through space frozen mid-motion, emerald, jade, mint, and pearl gradient running along its length, caustic light bending through each twist, viewed slightly from above, the bottom-right stays a clean gradient void for title text, couture installation lighting, Cinema 4D rendered, premium editorial mood, 4K' },
  { name: 'ribbon-amber', cat: 'ribbons', text: 'Cinematic 3D render of flowing translucent glass ribbons and curved surfaces, warm gradient palette of amber, honey gold, champagne, and cream, subsurface scattering with soft specular highlights, water droplets on glossy surfaces, shallow depth of field with bokeh, soft rim lighting, premium minimalist aesthetic, clean negative space at left of frame, Octane render quality, 4K' },
  { name: 'rings-teal', cat: 'glass-render', text: 'Cinematic 3D render of three nested translucent glass rings stacked at slight offset angles on a dark studio backdrop, cool gradient palette of deep teal, aqua, seafoam, and silver, subsurface scattering, water droplets on glossy surfaces, refraction through ring walls, internal caustics, shallow depth of field with bokeh, soft rim lighting, premium minimalist aesthetic, clean dark negative space, Octane render quality, 4K' },
  { name: 'crystal-clear', cat: 'glass-render', text: 'Cinematic 3D render of a flowing translucent clear-crystal glass ribbon on a soft neutral grey gradient backdrop, faint cool highlights of silver and pale blue, subsurface scattering, water droplets catching a single soft key light, caustic refraction, shallow depth of field, premium minimalist aesthetic, generous clean negative space, Octane render quality, 4K' },
  { name: 'loops-magenta', cat: 'ribbons', text: 'Cinematic 3D render of looping translucent glass ribbons intertwining, warm gradient palette of magenta, fuchsia, rose, and pink-champagne, subsurface scattering with glossy specular highlights, water droplets catching light, shallow depth of field with bokeh, soft rim lighting, premium fashion-editorial mood, clean negative space, Octane render quality, 4K' },
];

// ── Theme SETS ────────────────────────────────────────────────────────────────
// A cohesive family: ONE palette + ONE lighting/material base, varied only by
// form, so the 6 images read as a matched set usable together across a deck's
// cards (the Gamma "theme thumbnails" pattern, Lisa 2026-06-08). Square by
// default — they're card-accent images.
const SET_STYLE = 'Cinematic 3D render, translucent glass material with subsurface scattering, soft pearl specular highlights, delicate water droplets catching light, shallow depth of field with gentle bokeh, soft studio rim lighting, consistent smooth gradient backdrop, premium minimalist aesthetic, generous clean negative space, Octane render quality, 4K';
const SET_FORMS = [
  { k: 'ribbon', d: 'a single flowing translucent glass ribbon curving gracefully across the frame' },
  { k: 'rings', d: 'three nested translucent glass rings stacked at slight offset angles' },
  { k: 'spiral', d: 'a twisted glass ribbon spiraling elegantly through space, frozen mid-motion' },
  { k: 'orbs', d: 'a soft cluster of smooth translucent glass orbs and droplets' },
  { k: 'drape', d: 'folded and gently layered translucent glass sheets, soft draping curves' },
  { k: 'wave', d: 'an undulating translucent glass wave with smooth flowing crests' },
];
const SET_PALETTES = {
  violet: 'palette of soft violet, lavender, lilac, periwinkle, and pearl white',
  azure: 'palette of azure, sky blue, cyan, ice blue, and pearl white',
  emerald: 'palette of emerald, jade, mint green, and pearl',
  peach: 'palette of peach, coral, soft blush, and warm cream',
  rose: 'palette of rose, fuchsia, pink champagne, and pearl',
  amber: 'palette of amber, honey gold, champagne, and cream',
  monochrome: 'palette of clear crystal, soft silver, pale cool grey, and pearl white',
};

function buildSetPrompts(keys) {
  const palettes = keys.includes('all') ? Object.keys(SET_PALETTES) : keys.filter((k) => SET_PALETTES[k]);
  const out = [];
  for (const pal of palettes) {
    for (const form of SET_FORMS) {
      out.push({
        name: `set-${pal}-${form.k}`,
        cat: `glass-set-${pal}`, // leading tag → groups as a family in the contact sheet
        text: `${form.d}, ${SET_PALETTES[pal]}, ${SET_STYLE}`,
      });
    }
  }
  return out;
}

function parsePrompt(raw) {
  // Keep only the prompt body — drop "Generator output note" + "---" sections.
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    if (l.trim() === '---' || /^generator output note/i.test(l.trim())) break;
    out.push(l);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

async function loadOriginalPrompts() {
  let files = [];
  try {
    files = (await fs.readdir(GLASS_PROMPTS_DIR)).filter((f) => f.endsWith('.prompt.txt'));
  } catch {
    console.warn('No glass-centerpieces prompt dir at', GLASS_PROMPTS_DIR);
    return [];
  }
  const out = [];
  for (const f of files.sort()) {
    const raw = await fs.readFile(path.join(GLASS_PROMPTS_DIR, f), 'utf-8');
    const name = f.replace('.prompt.txt', '');
    const isRibbon = /ribbon|spiral|sheets|cellophane/i.test(name);
    out.push({ name, cat: isRibbon ? 'ribbons' : 'glass-render', text: parsePrompt(raw) });
  }
  return out;
}

async function readMetadata() {
  try {
    const parsed = JSON.parse(await fs.readFile(METADATA_PATH, 'utf-8'));
    if (parsed && Array.isArray(parsed.images)) return parsed;
  } catch { /* empty */ }
  return { images: [] };
}
async function writeMetadata(meta) {
  const tmp = METADATA_PATH + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  await fs.rename(tmp, METADATA_PATH);
}
const newId = () => `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null; // 'ribbons' | 'glass-render'

  const key = await loadKey();
  if (!key) { console.error('No OPENAI_API_KEY (env or main .env.local).'); process.exit(1); }

  const originals = await loadOriginalPrompts();
  // --sets <palette,…|all>: cohesive theme families (overrides the prompt list).
  const setsIdx = args.indexOf('--sets');
  const setsMode = setsIdx >= 0;
  let prompts;
  if (setsMode) {
    const setKeys = (args[setsIdx + 1] || 'all').split(',').map((s) => s.trim()).filter(Boolean);
    prompts = buildSetPrompts(setKeys);
  } else {
    prompts = [...originals, ...NEW_PROMPTS];
    if (only) prompts = prompts.filter((p) => p.cat === only);
  }

  // --size: comma list of landscape|square|portrait. Default: landscape for the
  // individual renders, square for theme sets (card-accent images).
  const SIZE_MAP = {
    landscape: { dim: '1536x1024', w: 1536, h: 1024, ar: '16:9' },
    square: { dim: '1024x1024', w: 1024, h: 1024, ar: '1:1' },
    portrait: { dim: '1024x1536', w: 1024, h: 1536, ar: '9:16' },
  };
  const sizeIdx = args.indexOf('--size');
  const sizeKeys = sizeIdx >= 0
    ? args[sizeIdx + 1].split(',').map((s) => s.trim()).filter((s) => SIZE_MAP[s])
    : setsMode ? ['square'] : ['landscape'];
  const sizes = sizeKeys.map((k) => ({ key: k, ...SIZE_MAP[k] }));

  // jobs = every (prompt × size) combination.
  const jobs = [];
  for (const p of prompts) for (const s of sizes) jobs.push({ p, s });

  console.log(`Glass-render generation → ${IMAGES_DIR}`);
  console.log(`${prompts.length} prompts × ${sizes.length} size(s) [${sizeKeys.join(', ')}] = ${jobs.length} images · gpt-image-1 medium · ~$0.06 ea ≈ $${(jobs.length * 0.06).toFixed(2)}\n`);

  if (dryRun) {
    for (const j of jobs) console.log(`  [${j.p.cat}] ${j.p.name} @ ${j.s.dim}`);
    console.log('\nDry run — no spend.');
    return;
  }

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const client = new OpenAI({ apiKey: key });
  const baseImages = (await readMetadata()).images; // snapshot once
  const newEntries = [];

  for (let i = 0; i < jobs.length; i++) {
    const { p, s } = jobs[i];
    let attempt = 0;
    for (;;) {
      try {
        const resp = await client.images.generate({
          model: 'gpt-image-1',
          prompt: `${NO_TEXT}\n\n${p.text}`,
          size: s.dim,
          quality: 'medium',
          n: 1,
        });
        const b64 = resp.data?.[0]?.b64_json;
        if (!b64) throw new Error('no b64_json');
        const id = newId();
        const filename = `${id}.png`;
        await fs.writeFile(path.join(IMAGES_DIR, filename), Buffer.from(b64, 'base64'));
        newEntries.push({
          id, filename,
          prompt: `[${p.cat}] [glass-gen:${p.name}] [${s.ar}] ${p.text}`,
          type: 'photo', quality: 'render', width: s.w, height: s.h,
          createdAt: new Date().toISOString(),
        });
        console.log(`▸ [${p.cat}] ${p.name} @ ${s.dim} → ${filename}`);
        break;
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        if (status === 429 && attempt < 4) {
          attempt++;
          const wait = 20000 * attempt;
          console.warn(`  429 rate limit — waiting ${wait / 1000}s (retry ${attempt})`);
          await sleep(wait);
          continue;
        }
        console.error(`  ! ${p.name} @ ${s.dim} failed: ${err?.message ?? err}`);
        break;
      }
    }
    // Persist incrementally so a mid-run failure doesn't lose prior images.
    // newest-first: reverse newEntries (last generated on top) ahead of base.
    if (newEntries.length) {
      await writeMetadata({ images: [...newEntries.slice().reverse(), ...baseImages] });
    }
    if (i < jobs.length - 1) await sleep(13000); // ~5/min
  }

  const total = baseImages.length + newEntries.length;
  console.log(`\nDone. Generated ${newEntries.length}/${jobs.length}. Library now: ${total}.`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
