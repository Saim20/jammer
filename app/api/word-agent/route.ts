/**
 * POST /api/word-agent
 *
 * Admin-only agentic endpoint. Uses Gemini via the Vercel AI SDK to generate
 * vocabulary words one at a time, checking each for near-duplicates via vector
 * similarity before queueing in `word_candidates` for admin review.
 *
 * Context words for the prompt are retrieved semantically (theme embedding →
 * match_words) rather than fetched as a random dump, so Gemini avoids the words
 * it is most likely to duplicate.
 *
 * Request body:  { theme?: string; count?: number }
 * Auth header:   Authorization: Bearer <supabase_access_token>
 *
 * Response:      NDJSON stream of ProgressEvent objects
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   — service role key (bypasses RLS)
 *   GEMINI_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateText, tool, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY    = process.env.SUPABASE_SECRET_KEY ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

const GEMINI_GENERATE_MODEL  = 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM          = 1536;

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProgressEvent =
  | { type: 'start';    total: number }
  | { type: 'checking'; word: string }
  | { type: 'queued';   word: string; difficulty: number }
  | { type: 'skipped';  word: string; reason: string }
  | { type: 'done';     queued: number; skipped: number }
  | { type: 'error';    message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

async function embedText(
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' = 'RETRIEVAL_DOCUMENT',
): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBED_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIM,
        }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { embeddings: { values: number[] }[] };
    const values = json.embeddings[0]?.values;
    return values ? l2Normalize(values) : null;
  } catch {
    return null;
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

  // 4. Set up NDJSON streaming response
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  function emit(event: ProgressEvent): void {
    writer.write(encoder.encode(JSON.stringify(event) + '\n')).catch(() => {});
  }

  // 5. Run agent asynchronously — keeps the stream open until done
  void (async () => {
    try {
      // Fetch context words (semantically related via theme embedding) and the
      // full word-name set (for O(1) textual dedup) in parallel.
      const [allWordsResult, candidatesResult] = await Promise.all([
        serviceClient.from('words').select('word'),
        serviceClient.from('word_candidates').select('word').in('status', ['pending', 'approved']),
      ]);

      // existingWordSet is mutated as words are queued to prevent in-session duplicates
      const existingWordSet = new Set<string>();
      for (const w of allWordsResult.data ?? [])    existingWordSet.add((w as { word: string }).word.toLowerCase());
      for (const c of candidatesResult.data ?? [])  existingWordSet.add((c as { word: string }).word.toLowerCase());

      // Context words: semantic neighbours of the theme (RETRIEVAL_QUERY → match_words),
      // or the 80 most-recently-added words when no theme is given.
      let contextWords: string[];
      if (theme) {
        const themeEmb = await embedText(theme, 'RETRIEVAL_QUERY');
        if (themeEmb) {
          const { data: related } = await serviceClient.rpc('match_words', {
            query_embedding: JSON.stringify(themeEmb),
            match_threshold: 0.2,
            match_count: 60,
          });
          contextWords = (related as { word: string }[] | null)?.map((w) => w.word) ?? [];
        } else {
          contextWords = [];
        }
      } else {
        const { data: recent } = await serviceClient
          .from('words').select('word').order('created_at', { ascending: false }).limit(80);
        contextWords = (recent ?? []).map((w: { word: string }) => w.word);
      }

      emit({ type: 'start', total: count });

      let queued  = 0;
      let skipped = 0;

      const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });

      await generateText({
        model: google(GEMINI_GENERATE_MODEL),
        // Allow enough steps: each process_word call is one step; budget for retries
        stopWhen: stepCountIs(Math.min(150, count * 2 + 10)),
        system: [
          `You are a vocabulary generation agent for a GRE/SAT-level English learning app.`,
          `Goal: successfully queue exactly ${count} unique vocabulary words${theme ? ` on the theme: "${theme}"` : ''}.`,
          `For every word you want to add, call the process_word tool with all fields fully populated.`,
          `The tool handles near-duplicate detection and tells you if a word was accepted or rejected.`,
          `If a word is rejected as a duplicate, try a different word. Keep going until ${count} are queued.`,
          ``,
          `Words already in the database — DO NOT repeat these or close synonyms:`,
          contextWords.join(', '),
        ].join('\n'),
        prompt: `Queue ${count} GRE/SAT-level English vocabulary words${theme ? ` focused on: ${theme}` : ''}.`,
        tools: {
          process_word: tool({
            description: [
              'Submit a single vocabulary word for uniqueness validation and queue insertion.',
              'Embeds the word+definition, checks vector near-duplicates (threshold 0.92),',
              'and inserts unique words into the pending review queue.',
              'Returns { status: "queued" | "skipped" | "error", reason?: string }.',
            ].join(' '),
            inputSchema: z.object({
              word: z.string()
                .describe('The vocabulary word (single English word or hyphenated compound)'),
              correct_definition: z.string().min(20).max(300)
                .describe('Student-friendly definition, 25–60 words'),
              distractors: z.array(z.string().min(10)).length(3)
                .describe('Exactly 3 plausible but incorrect definitions, similar style to the correct one'),
              example_sentences: z.array(z.string().min(10)).length(3)
                .describe('Exactly 3 natural sentences demonstrating the word in context'),
              difficulty: z.number().int().min(1).max(10)
                .describe('Difficulty 1–10 (1=everyday, 5=educated adult, 8=GRE level, 10=highly specialized)'),
            }),
            execute: async ({ word, correct_definition, distractors, example_sentences, difficulty }) => {
              emit({ type: 'checking', word });

              // Fast textual dedup — O(1) Set lookup
              if (existingWordSet.has(word.toLowerCase())) {
                skipped++;
                emit({ type: 'skipped', word, reason: 'already in database' });
                return { status: 'skipped', reason: 'already in database' };
              }

              // Embed with RETRIEVAL_DOCUMENT — matches how stored words were indexed
              const emb = await embedText(
                `word: ${word}. definition: ${correct_definition}`,
                'RETRIEVAL_DOCUMENT',
              );

              // Vector near-duplicate check via HNSW index
              if (emb) {
                const { data: matches } = await serviceClient.rpc('match_words', {
                  query_embedding: JSON.stringify(emb),
                  match_threshold: 0.92,
                  match_count: 1,
                });
                if (matches && (matches as unknown[]).length > 0) {
                  const similar = (matches as { word: string }[])[0].word;
                  skipped++;
                  emit({ type: 'skipped', word, reason: `near-duplicate of "${similar}"` });
                  return { status: 'skipped', reason: `near-duplicate of "${similar}"` };
                }
              }

              // Insert into word_candidates
              const { error: insertErr } = await serviceClient
                .from('word_candidates')
                .insert({
                  word,
                  correct_definition,
                  distractors:       distractors.slice(0, 3),
                  example_sentences: example_sentences.slice(0, 3),
                  difficulty,
                  embedding: emb ? JSON.stringify(emb) : null,
                  status:    'pending',
                  ai_model:  GEMINI_GENERATE_MODEL,
                });

              if (insertErr) {
                if (insertErr.code === '23505') {
                  // Unique constraint violation — race condition or case mismatch
                  skipped++;
                  existingWordSet.add(word.toLowerCase());
                  emit({ type: 'skipped', word, reason: 'already queued' });
                  return { status: 'skipped', reason: 'already queued' };
                }
                emit({ type: 'error', message: `Failed to insert "${word}": ${insertErr.message}` });
                return { status: 'error', reason: insertErr.message };
              }

              queued++;
              existingWordSet.add(word.toLowerCase());
              emit({ type: 'queued', word, difficulty });
              return { status: 'queued' };
            },
          }),
        },
      });

      emit({ type: 'done', queued, skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[word-agent]', message);
      emit({ type: 'error', message });
      emit({ type: 'done', queued: 0, skipped: 0 });
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no', // disable nginx/proxy buffering
    },
  });
}
