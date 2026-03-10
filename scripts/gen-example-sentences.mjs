/**
 * gen-example-sentences.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Uses Google Gemini (gemini-2.0-flash) to generate 1–3 example sentences
 * for every word in the Supabase `words` table that currently has an empty
 * `example_sentences` array.
 *
 * Env vars (auto-loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_SECRET_KEY       — secret key (bypasses RLS)
 *   GEMINI_API_KEY            — required; get one free at aistudio.google.com
 *
 * Usage
 * ──────
 *   # Fill only words that have no example sentences yet
 *   node scripts/gen-example-sentences.mjs
 *
 *   # Overwrite ALL words (even those that already have sentences)
 *   node scripts/gen-example-sentences.mjs --force
 *
 * Notes
 * ──────
 * • Words are processed in batches of 20 to stay within Gemini rate limits.
 * • Each word gets exactly 3 example sentences.
 * • Sentences use the word naturally in context — not dictionary-style.
 * • Progress is printed to stdout; failures for individual words are logged
 *   and skipped rather than aborting the whole run.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const envPath = new URL('../.env.local', import.meta.url);
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= val;
  }
} catch {
  // .env.local is optional — fall through to env vars set externally
}

// ── CLI flags ────────────────────────────────────────────────────────────────
const FORCE = process.argv.includes('--force'); // overwrite existing sentences

// ── Validate env ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY   = process.env.SUPABASE_SECRET_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('❌  Missing required env vars:');
  if (!SUPABASE_URL) console.error('   NEXT_PUBLIC_SUPABASE_URL');
  if (!SECRET_KEY)   console.error('   SUPABASE_SECRET_KEY  (Dashboard → Settings → API → Secret key)');
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error('❌  GEMINI_API_KEY is required. Get a free key at https://aistudio.google.com/apikey');
  process.exit(1);
}

// ── Supabase client (service-role — bypasses RLS) ────────────────────────────
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Gemini config ────────────────────────────────────────────────────────────
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const BATCH_SIZE     = 20;  // words per Gemini request
const DELAY_MS       = 500; // ms between batches to respect rate limits

/**
 * POST to Gemini with automatic retry on 503 (high demand).
 */
async function geminiPost(payload, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status !== 503 || attempt >= maxRetries) return res;
    attempt++;
    const waitMs = 2000 * attempt;
    process.stdout.write(`(503, retry ${attempt}/${maxRetries} in ${waitMs / 1000}s) `);
    await sleep(waitMs);
  }
}

/**
 * Best-effort repair for common Gemini JSON mistakes:
 * e.g. closing an array value with } instead of ]
 */
function repairJSON(raw) {
  // "last sentence."\n  } -> "last sentence."\n  ]
  return raw.replace(/"(\s*\n\s*)}(\s*})/g, '"$1]$2');
}

/**
 * Ask Gemini to produce 3 example sentences for a batch of words.
 * Returns a map of { word -> string[] } or throws on API error.
 *
 * @param {{ word: string; correct_definition: string; difficulty: number }[]} words
 * @returns {Promise<Record<string, string[]>>}
 */
async function generateSentencesForBatch(words) {
  const wordList = words
    .map((w) => `- "${w.word}" (difficulty ${w.difficulty}/10): ${w.correct_definition}`)
    .join('\n');

  const prompt = `You are a vocabulary teacher. For each word below, write exactly 3 short example sentences that demonstrate the word used naturally in context. The sentences should be clear, varied in structure, and suitable for a vocabulary learning app.

Respond with ONLY a valid JSON object — no markdown fences, no extra text. The format must be:
{
  "word1": ["sentence 1", "sentence 2", "sentence 3"],
  "word2": ["sentence 1", "sentence 2", "sentence 3"]
}

Words:
${wordList}`;

  const res = await geminiPost({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error('Gemini returned an empty response');
  }

  // Strip markdown fences if the model ignored the instruction, repair common JSON mistakes
  const cleaned = repairJSON(
    raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  );

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Gemini JSON response:\n${cleaned}`);
  }

  return parsed;
}

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to Supabase:', SUPABASE_URL);
  console.log(`🤖  Using model: ${GEMINI_MODEL}`);
  if (FORCE) console.log('⚠️   --force: will overwrite existing example sentences.');

  // Fetch all words; filter client-side so a missing column doesn't break the query
  const query = supabase
    .from('words')
    .select('id, word, correct_definition, difficulty, example_sentences')
    .order('difficulty');

  const { data: allWords, error } = await query;
  if (error) {
    console.error('❌  Failed to fetch words:', error.message);
    process.exit(1);
  }

  const words = FORCE
    ? allWords
    : allWords.filter((w) => !w.example_sentences || w.example_sentences.length === 0);

  if (words.length === 0) {
    console.log('\n✅  All words already have example sentences. Use --force to regenerate.');
    return;
  }

  console.log(`\n📖  Generating example sentences for ${words.length} word(s) in batches of ${BATCH_SIZE}…\n`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(words.length / BATCH_SIZE);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (words ${i + 1}–${Math.min(i + BATCH_SIZE, words.length)})… `);

    let sentenceMap;
    try {
      sentenceMap = await generateSentencesForBatch(batch);
    } catch (err) {
      console.error(`\n❌  Batch ${batchNum} failed: ${err.message}`);
      failed += batch.length;
      if (i + BATCH_SIZE < words.length) await sleep(DELAY_MS);
      continue;
    }

    // Write each word's sentences to Supabase
    for (const wordRow of batch) {
      const sentences = sentenceMap[wordRow.word];

      if (!Array.isArray(sentences) || sentences.length === 0) {
        console.warn(`\n⚠️   No sentences returned for "${wordRow.word}" — skipping.`);
        failed++;
        continue;
      }

      // Trim whitespace and cap at 3
      const cleaned = sentences.slice(0, 3).map((s) => s.trim()).filter(Boolean);

      const { error: updateErr } = await supabase
        .from('words')
        .update({ example_sentences: cleaned })
        .eq('id', wordRow.id);

      if (updateErr) {
        console.warn(`\n⚠️   Failed to save "${wordRow.word}": ${updateErr.message}`);
        failed++;
      } else {
        done++;
      }
    }

    console.log('done');

    // Throttle between batches (skip delay after the last batch)
    if (i + BATCH_SIZE < words.length) await sleep(DELAY_MS);
  }

  console.log(`\n✅  Done — ${done} word(s) updated, ${failed} failed.`);
  if (failed > 0) {
    console.log('   Re-run the script (without --force) to retry failed words.');
  }
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
