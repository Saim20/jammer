'use client';

import { useState } from 'react';
import { Plus, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { FlashcardSet, WordCategory } from '@/types';
import { CATEGORY_META, WORD_CATEGORIES } from '@/types';
import { EmptyState, TabSpinner, Label, inputCls } from './shared';

export default function SetsTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['admin-sets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flashcard_sets')
        .select('*')
        .order('category')
        .order('display_order');
      if (error) throw error;
      return (data ?? []) as FlashcardSet[];
    },
    enabled: !!user && !!isAdmin,
  });

  const [draft, setDraft] = useState<{ name: string; description: string; category: WordCategory | ''; display_order: number }>({
    name: '', description: '', category: '', display_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!draft.name.trim()) { setError('Name is required.'); return; }
    if (!draft.category) { setError('Category is required.'); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { data, error: insertErr } = await supabase
        .from('flashcard_sets')
        .insert({ name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, display_order: draft.display_order })
        .select()
        .single();
      if (insertErr) throw insertErr;
      queryClient.setQueryData(['admin-sets'], (prev: FlashcardSet[]) =>
        [...(prev ?? []), data as FlashcardSet].sort((a, b) => a.category.localeCompare(b.category) || a.display_order - b.display_order),
      );
      setDraft({ name: '', description: '', category: '', display_order: 0 });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to create set.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { error: delErr } = await supabase.from('flashcard_sets').delete().eq('id', id);
      if (delErr) throw delErr;
      queryClient.setQueryData(['admin-sets'], (prev: FlashcardSet[]) => (prev ?? []).filter((s) => s.id !== id));
    } catch (err) {
      console.error('Delete set failed:', err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-gray-400">
        Create named groups of words within each learning category. Words assigned to a set appear in the corresponding flashcard deck.
      </p>

      {/* Create form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-white text-sm">New Set</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Set Name</Label>
            <input
              type="text" value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Travel & Transport"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as WordCategory | '' }))}
              className={inputCls}
            >
              <option value="">— choose —</option>
              {WORD_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description (optional)</Label>
            <input
              type="text" value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Brief description of the set…"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Display Order</Label>
            <input
              type="number" min={0} value={draft.display_order}
              onChange={(e) => setDraft((d) => ({ ...d, display_order: Number(e.target.value) }))}
              className={inputCls}
            />
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />Set created!
          </div>
        )}
        <button
          onClick={handleCreate} disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? 'Creating…' : 'Create Set'}
        </button>
      </div>

      {/* Sets list */}
      {isLoading ? <TabSpinner /> : sets.length === 0 ? (
        <EmptyState message="No sets yet. Create your first set above." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Category</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium w-14">Order</th>
                <th className="px-4 py-3 text-right text-gray-400 font-medium w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {sets.map((s) => {
                const meta = CATEGORY_META[s.category];
                return (
                  <tr key={s.id} className="hover:bg-gray-900/40 transition-colors group">
                    <td className="px-4 py-3 font-semibold text-white">{s.name}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{meta.emoji} {meta.label}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-50 truncate hidden md:table-cell">
                      {s.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.display_order}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        title="Delete set"
                        className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-400 hover:text-red-400 disabled:opacity-50 transition-colors opacity-60 group-hover:opacity-100"
                      >
                        {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-500">
            {sets.length} set{sets.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </section>
  );
}
