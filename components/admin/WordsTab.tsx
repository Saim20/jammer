'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, FlashcardSet } from '@/types';
import { CATEGORY_META, difficultyToCategory } from '@/types';
import { DifficultyBadge, SortHeader, EmptyState, TabSpinner, validateDraft, draftToRow, EMPTY_DRAFT, WordDraft } from './shared';
import WordForm from './WordForm';

type SortField = 'word' | 'difficulty';

export default function WordsTab({ onNavigateToAdd }: { onNavigateToAdd: () => void }) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: words = [], isLoading: loadingWords } = useQuery({
    queryKey: ['admin-words'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('words')
        .select('id, word, correct_definition, distractors, example_sentences, difficulty, set_id, created_at, updated_at')
        .order('word');
      if (error) throw error;
      return (data ?? []) as Word[];
    },
    enabled: !!user && !!isAdmin,
  });

  const { data: sets = [] } = useQuery({
    queryKey: ['admin-sets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flashcard_sets').select('*').order('category').order('display_order');
      if (error) throw error;
      return (data ?? []) as FlashcardSet[];
    },
    enabled: !!user && !!isAdmin,
  });

  // ── Search / sort ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('word');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDir('asc'); }
  }

  const displayed = words
    .filter((w) => w.word.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = sortField === 'word' ? a.word.toLowerCase() : a.difficulty;
      const vb = sortField === 'word' ? b.word.toLowerCase() : b.difficulty;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editDraft, setEditDraft] = useState<WordDraft>(EMPTY_DRAFT);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(w: Word) {
    setEditingWord(w);
    setEditDraft({
      word: w.word,
      correctDefinition: w.correct_definition,
      distractor1: w.distractors[0] ?? '',
      distractor2: w.distractors[1] ?? '',
      distractor3: w.distractors[2] ?? '',
      exampleSentence1: w.example_sentences?.[0] ?? '',
      exampleSentence2: w.example_sentences?.[1] ?? '',
      exampleSentence3: w.example_sentences?.[2] ?? '',
      difficulty: w.difficulty,
      set_id: w.set_id ?? '',
    });
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingWord) return;
    const err = validateDraft(editDraft);
    if (err) { setEditError(err); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const row = draftToRow(editDraft);
      const { error } = await supabase.from('words').update(row).eq('id', editingWord.id);
      if (error) throw error;
      queryClient.setQueryData(['admin-words'], (prev: Word[]) =>
        prev.map((w) => (w.id === editingWord.id ? { id: editingWord.id, ...row } as Word : w)),
      );
      setEditingWord(null);
    } catch (err) {
      console.error(err);
      setEditError('Failed to save. Check your connection and try again.');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function confirmDelete(id: string) {
    try {
      const { error } = await supabase.from('words').delete().eq('id', id);
      if (error) throw error;
      queryClient.setQueryData(['admin-words'], (prev: Word[]) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search words…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          onClick={onNavigateToAdd}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Word
        </button>
      </div>

      {/* Table */}
      {loadingWords ? (
        <TabSpinner />
      ) : displayed.length === 0 ? (
        <EmptyState message={search ? 'No words match your search.' : 'No words yet. Add some!'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <SortHeader label="Word" field="word" current={sortField} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 text-left text-gray-400 font-medium hidden md:table-cell">Definition</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium hidden lg:table-cell">Distractors</th>
                <SortHeader label="Diff." field="difficulty" current={sortField} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 text-right text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {displayed.map((w) => (
                <tr key={w.id} className="hover:bg-gray-900/40 transition-colors group">
                  <td className="px-4 py-3 font-semibold text-white">{w.word}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-60 truncate hidden md:table-cell">
                    {w.correct_definition}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                    <span className="line-clamp-1">{w.distractors.join(' · ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <DifficultyBadge value={w.difficulty} />
                      <span className="text-[10px] text-gray-600">
                        {(() => { const c = difficultyToCategory(w.difficulty); return `${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`; })()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(w)}
                        title="Edit"
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(w.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-500">
            {displayed.length} of {words.length} word{words.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">Edit Word</h2>
              <button onClick={() => setEditingWord(null)} className="text-gray-500 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              <WordForm
                draft={editDraft}
                onChange={setEditDraft}
                onSubmit={saveEdit}
                saving={editSaving}
                error={editError}
                submitLabel="Save Changes"
                submitIcon={<Check className="w-4 h-4" />}
                sets={sets}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-950 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Delete word?</h2>
              <p className="text-sm text-gray-400 mt-1">
                {words.find((w) => w.id === deletingId)?.word} — this cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeletingId(null)} className="px-5 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => confirmDelete(deletingId)} className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium text-white transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
