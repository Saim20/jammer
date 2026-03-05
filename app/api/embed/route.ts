/**
 * POST /api/embed
 *
 * Server-side proxy for Google Gemini embedding generation.
 * Keeps GEMINI_API_KEY out of the browser bundle entirely.
 *
 * Request body:  { texts: string[] }
 * Response body: { embeddings: number[][] }   (L2-normalised, 1536-dim)
 *
 * Returns 503 if GEMINI_API_KEY is not configured — callers treat this as
 * "embeddings unavailable" and silently skip rather than showing an error.
 */

import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL  = 'gemini-embedding-001';
const EMBEDDING_DIM    = 1536;
const BATCH_URL        =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;

/** L2-normalise so pgvector's cosine <=> operator is accurate on 1536-dim vectors. */
function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY not configured' },
      { status: 503 },
    );
  }

  let texts: string[];
  try {
    ({ texts } = await req.json() as { texts: string[] });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    return NextResponse.json({ error: '`texts` must be a non-empty array' }, { status: 400 });
  }

  const requests = texts.map((text) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIM,
  }));

  const geminiRes = await fetch(`${BATCH_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!geminiRes.ok) {
    const body = await geminiRes.text();
    console.error(`[/api/embed] Gemini error ${geminiRes.status}:`, body);
    return NextResponse.json(
      { error: `Gemini API error: ${geminiRes.status}` },
      { status: 502 },
    );
  }

  const json = await geminiRes.json() as { embeddings: { values: number[] }[] };
  const embeddings = json.embeddings.map((e) => l2Normalize(e.values));

  return NextResponse.json({ embeddings });
}
