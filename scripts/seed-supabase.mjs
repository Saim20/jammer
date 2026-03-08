/**
 * seed-supabase.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Uploads vocabulary words to the Supabase `words` table and optionally
 * generates Google Gemini embeddings (gemini-embedding-001, 1536-dim) for
 * the match_words() vector-search RPC defined in supabase/schema.sql.
 *
 * Model: gemini-embedding-001 (Google AI Studio, latest June 2025)
 * Dims:  1536  — MTEB score 68.17 (best across all supported sizes)
 * Task:  RETRIEVAL_DOCUMENT (optimised for document indexing)
 *
 * Env vars (auto-loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_SECRET_KEY       — secret key (bypasses RLS)
 *                               Supabase Dashboard → Settings → API → Secret key
 *   GEMINI_API_KEY            — optional; enables embedding generation
 *                               Get one free at https://aistudio.google.com/apikey
 *
 * Usage
 * ──────
 *   # Upload words only (no embeddings)
 *   node scripts/seed-supabase.mjs
 *
 *   # Upload words + generate embeddings
 *   GEMINI_API_KEY=AIza... node scripts/seed-supabase.mjs
 *
 *   # Only fill NULL embeddings for words already in the DB (no inserts)
 *   node scripts/seed-supabase.mjs --embed-only
 *
 *   # Force re-generate all embeddings (even non-NULL ones)
 *   node scripts/seed-supabase.mjs --embed-only --force-embed
 *
 * Notes
 * ──────
 * • The secret key bypasses Row Level Security — keep it out of git.
 * • Duplicate words are silently skipped (unique constraint on `words.word`).
 * • Embedding text: "word: <word>. definition: <correct_definition>"
 * • 1536-dim vectors from Gemini are L2-normalised before storage so that
 *   cosine similarity via pgvector's <=> operator is accurate.
 * • Batches up to 100 texts per API request (Gemini's maximum).
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
const EMBED_ONLY  = process.argv.includes('--embed-only');   // skip word inserts
const FORCE_EMBED = process.argv.includes('--force-embed');  // overwrite existing embeddings

// ── Validate env ─────────────────────────────────────────────────────────────
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY     = process.env.SUPABASE_SECRET_KEY;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('❌  Missing required env vars:');
  if (!SUPABASE_URL) console.error('   NEXT_PUBLIC_SUPABASE_URL');
  if (!SECRET_KEY)   console.error('   SUPABASE_SECRET_KEY  (Dashboard → Settings → API → Secret key)');
  process.exit(1);
}

// ── Supabase client (service-role — bypasses RLS) ────────────────────────────
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Word bank ─────────────────────────────────────────────────────────────────
// Loaded from scripts/words.json — edit that file to add or modify words.
// difficulty 1–2 = beginner, 3–4 = easy, 5–6 = medium, 7–8 = hard, 9–10 = expert
const WORDS = JSON.parse(readFileSync(new URL('./words.json', import.meta.url), 'utf8'));

// ── Google Gemini embedding helper ───────────────────────────────────────────
// Model: gemini-embedding-001 (latest, June 2025)
// Dims:  1536 — highest MTEB score (68.17) across all supported sizes
// Task:  RETRIEVAL_DOCUMENT — optimised for indexing searchable documents
const EMBEDDING_MODEL     = 'gemini-embedding-001';
const EMBEDDING_DIM       = 1536;
const EMBED_BATCH_SIZE    = 100; // Gemini's maximum per batchEmbedContents request
const GEMINI_BATCH_URL    =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;

/**
 * Build the text we embed for each word.
 * Combining word + definition gives the vector index richer semantic signal.
 */
function embeddingText(word) {
  return `word: ${word.word}. definition: ${word.correct_definition}`;
}

/**
 * L2-normalise a vector so cosine similarity via pgvector's <=> operator
 * is accurate. Gemini auto-normalises 3072-dim but not 1536-dim.
 * @param {number[]} vec
 * @returns {number[]}
 */
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

/**
 * Call Gemini batchEmbedContents for up to 100 texts.
 * Returns an array of normalised float[] in the same order as `texts`.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  const requests = texts.map((text) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIM,
  }));

  const res = await fetch(`${GEMINI_BATCH_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  // json.embeddings[].values — normalise each vector before storing
  return json.embeddings.map((e) => l2Normalize(e.values));
}

// ── Step 1 — Upsert words ────────────────────────────────────────────────────
async function upsertWords() {
  console.log(`\n📖  Upserting ${WORDS.length} words into Supabase…`);

  // Supabase upsert with ignoreDuplicates silently skips rows that violate
  // the unique constraint on words.word — no error thrown.
  const { data, error } = await supabase
    .from('words')
    .upsert(WORDS, { onConflict: 'word', ignoreDuplicates: true })
    .select('id, word');

  if (error) {
    console.error('❌  Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`✅  Inserted ${data.length} new word(s) (duplicates silently skipped).`);
  return data;
}

// ── Step 2 — Generate & store embeddings ────────────────────────────────────
async function generateEmbeddings() {
  if (!GEMINI_KEY) {
    console.log('\nℹ️   GEMINI_API_KEY not set — skipping embedding generation.');
    console.log('   Get a free key at https://aistudio.google.com/apikey');
    console.log('   Then set GEMINI_API_KEY in .env.local to enable vector search via match_words().');
    return;
  }

  // Fetch rows that need embeddings
  let query = supabase.from('words').select('id, word, correct_definition');
  if (!FORCE_EMBED) {
    query = query.is('embedding', null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('❌  Failed to fetch words for embedding:', error.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('\n✅  All words already have embeddings. Use --force-embed to regenerate.');
    return;
  }

  console.log(`\n🤖  Generating embeddings for ${rows.length} word(s) using ${EMBEDDING_MODEL}…`);

  let done = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const texts  = batch.map(embeddingText);

    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`❌  Gemini batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1} failed:`, err.message);
      process.exit(1);
    }

    // Update each row individually (Supabase JS v2 doesn't support bulk vector updates)
    for (let j = 0; j < batch.length; j++) {
      const { error: updateErr } = await supabase
        .from('words')
        .update({ embedding: JSON.stringify(embeddings[j]) })
        .eq('id', batch[j].id);

      if (updateErr) {
        console.error(`❌  Failed to store embedding for "${batch[j].word}":`, updateErr.message);
        process.exit(1);
      }
    }

    done += batch.length;
    const pct = Math.round((done / rows.length) * 100);
    process.stdout.write(`   ${done}/${rows.length} (${pct}%)\r`);
  }

  console.log(`\n✅  Stored embeddings for ${rows.length} word(s).`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to Supabase:', SUPABASE_URL);
  if (GEMINI_KEY) {
    console.log('🤖  Gemini key detected — embeddings will be generated (gemini-embedding-001, 1536-dim).');
  }
  if (EMBED_ONLY) {
    console.log('⚡  --embed-only: skipping word inserts.');
  }
  if (FORCE_EMBED) {
    console.log('⚠️   --force-embed: will overwrite existing embeddings.');
  }

  if (!EMBED_ONLY) {
    await upsertWords();
  }

  await generateEmbeddings();

  console.log('\n🎮  Done! Your Supabase words table is ready.');
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
