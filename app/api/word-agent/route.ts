/**
 * POST /api/word-agent
 *
 * Admin-only endpoint that uses Gemini to discover new vocabulary words,
 * checks for near-duplicates via vector similarity, then queues them in
 * `word_candidates` for admin review.
 *
 * Request body:  { theme?: string; count?: number }
 * Auth header:   Authorization: Bearer <supabase_access_token>
 *
 * Response:      { queued: number; skipped_duplicates: number }
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   — service role key (bypasses RLS)
 *   GEMINI_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY    = process.env.SUPABASE_SECRET_KEY ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

const GEMINI_GENERATE_MODEL  = 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM          = 1536;

const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GENERATE_MODEL}:generateContent`;
const EMBED_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeneratedWord {
  word: string;
  correct_definition: string;
  distractors: string[];
  example_sentences: string[];
  difficulty: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch(`${EMBED_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    });
    if (!res.ok) return texts.map(() => null);
    const json = await res.json() as { embeddings: { values: number[] }[] };
    return json.embeddings.map((e) => l2Normalize(e.values));
  } catch {
    return texts.map(() => null);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verify env
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: 'Server not configured (missing Supabase keys)' }, { status: 503 });
  }
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Server not configured (missing GEMINI_API_KEY)' }, { status: 503 });
  }

  // 2. Authenticate + verify admin status
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user: authUser }, error: authError } = await serviceClient.auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { data: profileRow } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (profileRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // 3. Parse request body
  let theme = '';
  let count = 10;
  try {
    const body = await req.json() as { theme?: string; count?: number };
    theme = (body.theme ?? '').trim();
    count = Math.min(50, Math.max(5, body.count ?? 10));
  } catch {
    // use defaults
  }

  // 4. Fetch existing words for context + duplicate detection
  const { data: existingWords } = await serviceClient
    .from('words')
    .select('word')
    .order('created_at', { ascending: false });

  const existingWordSet = new Set((existingWords ?? []).map((w: { word: string }) => w.word.toLowerCase()));

  // Also fetch already-queued candidates to avoid re-suggesting them
  const { data: existingCandidates } = await serviceClient
    .from('word_candidates')
    .select('word')
    .in('status', ['pending', 'approved']);
  for (const c of existingCandidates ?? []) {
    existingWordSet.add((c as { word: string }).word.toLowerCase());
  }

  // Pick a random sample of existing words to give Gemini context
  const sampleWords = (existingWords ?? [])
    .sort(() => Math.random() - 0.5)
    .slice(0, 60)
    .map((w: { word: string }) => w.word);

  // 5. Call Gemini to generate words
  const prompt = `You are an expert English vocabulary teacher. Generate exactly ${count} important English vocabulary words that would be valuable for language learners (GRE/SAT/academic level) but are NOT in the list below.${theme ? `\n\nFocus area: ${theme}` : ''}

Words already in the database (DO NOT include these or close synonyms):
${sampleWords.join(', ')}

For each word provide:
1. The word itself (a single English word or compound)
2. A clear, student-friendly definition (25–60 words)
3. Exactly 3 plausible but incorrect definitions (multiple-choice distractors, similar style to the correct one)
4. Exactly 3 natural example sentences that demonstrate the word in context (not dictionary examples)
5. A difficulty rating 1–10 (1=everyday, 5=educated adult, 8=GRE level, 10=highly specialized)

Respond with ONLY a JSON array (no markdown, no commentary):
[
  {
    "word": "...",
    "correct_definition": "...",
    "distractors": ["...", "...", "..."],
    "example_sentences": ["...", "...", "..."],
    "difficulty": 7
  }
]`;

  let generated: GeneratedWord[] = [];
  try {
    const geminiRes = await fetch(`${GENERATE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[word-agent] Gemini generate error:', errBody);
      return NextResponse.json({ error: `Gemini API error: ${geminiRes.status}` }, { status: 502 });
    }

    const geminiJson = await geminiRes.json() as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

    // Parse, stripping any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as GeneratedWord[];
    if (Array.isArray(parsed)) {
      generated = parsed.filter(
        (w) =>
          typeof w.word === 'string' &&
          typeof w.correct_definition === 'string' &&
          Array.isArray(w.distractors) && w.distractors.length === 3 &&
          Array.isArray(w.example_sentences) &&
          typeof w.difficulty === 'number' &&
          w.difficulty >= 1 && w.difficulty <= 10,
      );
    }
  } catch (err) {
    console.error('[word-agent] Gemini generate/parse error:', err);
    return NextResponse.json({ error: 'Failed to generate or parse words from Gemini' }, { status: 502 });
  }

  if (generated.length === 0) {
    return NextResponse.json({ queued: 0, skipped_duplicates: 0 });
  }

  // 6. Filter textual duplicates (exact or already-queued)
  const novel = generated.filter((w) => !existingWordSet.has(w.word.toLowerCase()));
  const textSkipped = generated.length - novel.length;

  if (novel.length === 0) {
    return NextResponse.json({ queued: 0, skipped_duplicates: textSkipped });
  }

  // 7. Generate embeddings for novel candidates
  const embedTexts = novel.map((w) => `word: ${w.word}. definition: ${w.correct_definition}`);
  const embeddings = await generateEmbeddings(embedTexts);

  // 8. Vector near-duplicate check via match_words RPC (threshold 0.92)
  const toInsert: (GeneratedWord & { embedding: number[] | null })[] = [];
  let vectorSkipped = 0;

  for (let i = 0; i < novel.length; i++) {
    const emb = embeddings[i];
    if (emb) {
      const { data: matches } = await serviceClient.rpc('match_words', {
        query_embedding: JSON.stringify(emb),
        match_threshold: 0.92,
        match_count: 1,
      });
      if (matches && (matches as unknown[]).length > 0) {
        vectorSkipped++;
        continue;
      }
    }
    toInsert.push({ ...novel[i], embedding: emb });
  }

  // 9. Bulk insert into word_candidates
  let queued = 0;
  if (toInsert.length > 0) {
    const rows = toInsert.map((w) => ({
      word:               w.word,
      correct_definition: w.correct_definition,
      distractors:        w.distractors.slice(0, 3),
      example_sentences:  w.example_sentences.slice(0, 3),
      difficulty:         w.difficulty,
      embedding:          w.embedding ? JSON.stringify(w.embedding) : null,
      status:             'pending',
      ai_model:           GEMINI_GENERATE_MODEL,
    }));

    const { data: inserted, error: insertErr } = await serviceClient
      .from('word_candidates')
      .insert(rows)
      .select('id');

    if (insertErr) {
      console.error('[word-agent] Insert error:', insertErr);
      // Partial success is possible if some rows conflict; count what we got
    }
    queued = (inserted ?? []).length;
  }

  return NextResponse.json({
    queued,
    skipped_duplicates: textSkipped + vectorSkipped,
  });
}
