'use client';

import { useState } from 'react';
import { Plus, Check, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, FlashcardSet } from '@/types';
import { EMPTY_DRAFT, validateDraft, draftToRow, WordDraft } from './shared';
import { fetchEmbeddings, storeEmbedding, embedText } from './embedHelpers';
import WordForm from './WordForm';

export default function AddWordTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: sets = [] } = useQuery({
    queryKey: ['admin-sets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flashcard_sets').select('*').order('category').order('display_order');
      if (error) throw error;
      return (data ?? []) as FlashcardSet[];
    },
    enabled: !!user && !!isAdmin,
  });

  const [draft, setDraft] = useState<WordDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');

  async function handleAdd() {
    const err = validateDraft(draft);
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    setEmbedStatus('idle');
    let insertedId: string | null = null;
    let insertedWord: { word: string; correct_definition: string } | null = null;
    try {
      const row = draftToRow(draft);
      const { data, error: insertErr } = await supabase.from('words').insert(row).select().single();
      if (insertErr) throw insertErr;
      insertedId = (data as Word).id;
      insertedWord = { word: row.word, correct_definition: row.correct_definition };
      queryClient.setQueryData(['admin-words'], (prev: Word[]) =>
        [...(prev ?? []), data as Word].sort((a, b) => a.word.localeCompare(b.word)),
      );
      setDraft(EMPTY_DRAFT);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to add word. Check your connection and try again.');
    } finally {
      setSaving(false);
    }

    if (insertedId && insertedWord) {
      setEmbedStatus('generating');
      const embeddings = await fetchEmbeddings([embedText(insertedWord.word, insertedWord.correct_definition)]);
      if (embeddings?.[0]) {
        await storeEmbedding(insertedId, embeddings[0]);
        setEmbedStatus('done');
      } else {
        setEmbedStatus('error');
      }
      setTimeout(() => setEmbedStatus('idle'), 5000);
    }
  }

  return (
    <section className="max-w-2xl space-y-6">
      <p className="text-sm text-gray-400">Fill in all fields to add a new vocabulary word.</p>
      <WordForm
        draft={draft}
        onChange={setDraft}
        onSubmit={handleAdd}
        saving={saving}
        error={error}
        submitLabel="Add Word"
        submitIcon={<Plus className="w-4 h-4" />}
        sets={sets}
      />
      {success && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
          <Check className="w-4 h-4 shrink-0" /> Word added successfully!
        </div>
      )}
      {embedStatus !== 'idle' && (
        <div
          className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${
            embedStatus === 'generating'
              ? 'text-violet-300 bg-violet-950/40 border-violet-800'
              : embedStatus === 'done'
                ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                : 'text-amber-400 bg-amber-950/40 border-amber-800'
          }`}
        >
          {embedStatus === 'generating' ? (
            <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Generating embedding&hellip;</>
          ) : embedStatus === 'done' ? (
            <><Check className="w-4 h-4 shrink-0" /> Embedding stored — word is now searchable via vector search.</>
          ) : (
            <><AlertCircle className="w-4 h-4 shrink-0" /> Embedding skipped — word saved, but won&apos;t appear in semantic search. Is <code className="text-amber-300">GEMINI_API_KEY</code> set?</>
          )}
        </div>
      )}
    </section>
  );
}
