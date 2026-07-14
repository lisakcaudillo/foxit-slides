#!/usr/bin/env node
/**
 * Independent Verify Harness — an INDEPENDENT (cross-model) checker for claims.
 *
 * Why this exists: Claude (the agent building Compose) marks its own homework.
 * This script routes a CLAIM + EVIDENCE to a *different* model (OpenAI) and
 * returns a grounded verdict. The agent is not allowed to call it "done" — the
 * independent verifier says so against the evidence, or it stays UNVERIFIED.
 *
 * Same primitive used three ways:
 *   1. Check the agent's work during a build  (claim + diff/screenshot)
 *   2. Slides visual judge                     (claim + rendered-slide image)
 *   3. Compare `summary_verified`              (impact summary + source text)
 *
 * Hard rule: the verdict MUST be grounded in the supplied evidence only. The
 * verifier is told to reject when the evidence does not actually support the
 * claim — including when evidence is missing.
 *
 * Usage:
 *   node scripts/verify.mjs --selftest
 *   node scripts/verify.mjs --claim "..." --evidence "..."
 *   node scripts/verify.mjs --claim "..." --evidence-file path.txt
 *   node scripts/verify.mjs --claim "..." --image screenshot.png [--evidence "..."]
 *
 * Exit code: 0 = verified, 1 = NOT verified / self-test failed, 2 = harness error.
 */

import OpenAI from 'openai';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

config({ path: '.env.local', quiet: true });

const MODEL = process.env.VERIFY_MODEL || 'gpt-4o-mini'; // cheap + vision-capable

// ── arg parsing (tiny, no deps) ──────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const VERDICT_SCHEMA = {
  name: 'verdict',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verified: {
        type: 'boolean',
        description: 'true ONLY if the evidence concretely supports the claim. false if it contradicts, is insufficient, or is missing.',
      },
      confidence: { type: 'number', description: '0..1 — how sure you are in this verdict.' },
      reasoning: { type: 'string', description: 'One or two sentences. Ground it in the evidence.' },
      evidence_basis: {
        type: 'string',
        description: 'Quote or point to the exact part of the evidence that drove the verdict. If evidence is missing, say so.',
      },
    },
    required: ['verified', 'confidence', 'reasoning', 'evidence_basis'],
  },
};

const SYSTEM = [
  'You are an INDEPENDENT verifier. Another AI produced a CLAIM about its own work; you did not write it and you owe it no benefit of the doubt.',
  'Decide whether the supplied EVIDENCE concretely supports the CLAIM.',
  'Rules:',
  '- Ground your verdict ONLY in the evidence provided. Do not assume facts not present.',
  '- If the evidence contradicts the claim, is insufficient, or is absent, return verified=false.',
  '- A claim that "X works" or "looks good" requires evidence that actually shows it (a screenshot, a diff, an output) — not a restatement of the claim.',
  '- Be strict but fair: if the evidence clearly supports the claim, return verified=true.',
  'Report ONLY via the structured schema.',
].join('\n');

function mimeFromPath(p) {
  const e = extname(p).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.gif') return 'image/gif';
  if (e === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function verify({ claim, evidence, imagePath }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userContent = [];
  let text = `CLAIM:\n${claim}\n`;
  if (evidence) text += `\nEVIDENCE (text):\n"""\n${evidence}\n"""\n`;
  if (imagePath) text += `\nEVIDENCE (image): attached below. Judge the claim against what the image actually shows.\n`;
  if (!evidence && !imagePath) text += `\nEVIDENCE: (none provided)\n`;
  userContent.push({ type: 'text', text });

  if (imagePath) {
    const bytes = readFileSync(imagePath);
    const url = `data:${mimeFromPath(imagePath)};base64,${bytes.toString('base64')}`;
    userContent.push({ type: 'image_url', image_url: { url } });
  }

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: VERDICT_SCHEMA },
    max_tokens: 500,
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error('no content in verifier response');
  return JSON.parse(raw);
}

// ── self-test: the verifier must DISCRIMINATE, not rubber-stamp ──────────────
async function selftest() {
  const evidence = 'function add(a, b) { return a + b; }';
  const trueClaim = 'The add function returns the sum of its two arguments.';
  const falseClaim = 'The add function returns the product of its two arguments.';

  console.log(`[selftest] model=${MODEL}`);
  console.log('[selftest] case 1 — TRUE claim, should verify...');
  const r1 = await verify({ claim: trueClaim, evidence });
  console.log('  →', JSON.stringify(r1));
  console.log('[selftest] case 2 — FALSE claim, should REJECT...');
  const r2 = await verify({ claim: falseClaim, evidence });
  console.log('  →', JSON.stringify(r2));

  const pass = r1.verified === true && r2.verified === false;
  if (pass) {
    console.log('\n✅ SELF-TEST PASSED — verifier discriminates (true→verified, false→rejected). Trustworthy.');
    return 0;
  }
  console.log('\n❌ SELF-TEST FAILED — verifier did not discriminate. Do NOT trust it.');
  console.log(`   true-claim verified=${r1.verified} (want true), false-claim verified=${r2.verified} (want false)`);
  return 1;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not set (looked in .env.local).');
    process.exit(2);
  }
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.selftest) {
      process.exit(await selftest());
    }
    if (!args.claim) {
      console.error('Usage: node scripts/verify.mjs --claim "..." [--evidence "..." | --evidence-file f | --image img.png]');
      console.error('   or: node scripts/verify.mjs --selftest');
      process.exit(2);
    }
    let evidence = typeof args.evidence === 'string' ? args.evidence : undefined;
    if (args['evidence-file']) evidence = readFileSync(args['evidence-file'], 'utf8');
    const imagePath = typeof args.image === 'string' ? args.image : undefined;

    const verdict = await verify({ claim: args.claim, evidence, imagePath });
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(verdict.verified ? 0 : 1);
  } catch (err) {
    console.error('HARNESS ERROR:', err?.message || err);
    process.exit(2);
  }
})();
