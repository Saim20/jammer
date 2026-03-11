import { supabase } from '@/lib/supabase';

export const EMBED_BATCH_SIZE = 100;

export function embedText(word: string, definition: string): string {
  return `word: ${word}. definition: ${definition}`;
}

export async function fetchEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (res.status === 503) return null;
    if (!res.ok) return null;
    const { embeddings } = (await res.json()) as { embeddings: number[][] };
    return embeddings ?? null;
  } catch {
    return null;
  }
}

export async function storeEmbedding(id: string, embedding: number[]): Promise<void> {
  await supabase
    .from('words')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', id);
}
