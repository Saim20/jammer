'use client';

import { useState } from 'react';
import { Bot, Sparkles, Check, X, Loader2, AlertCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, WordCandidate } from '@/types';
import { DifficultyBadge, TabSpinner } from './shared';

export default function AgentTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('word_candidates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WordCandidate[];
    },
    enabled: !!user && !!isAdmin,
  });

  const [theme, setTheme] = useState('');
  const [count, setCount] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ queued: number; skipped_duplicates: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  async function runAgent() {
    setRunning(true);
    setResult(null);
    setRunError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/word-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme: theme.trim() || undefined, count }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const data = await res.json() as { queued: number; skipped_duplicates: number };
      setResult(data);
      if (data.queued > 0) {
        setStatusFilter('pending');
        refetch();
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  async function approveCandidate(candidate: WordCandidate) {
    setApprovingId(candidate.id);
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('words')
        .insert({
          word: candidate.word,
          correct_definition: candidate.correct_definition,
          distractors: candidate.distractors,
          example_sentences: candidate.example_sentences,
          difficulty: candidate.difficulty,
          embedding: candidate.embedding,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      await supabase.from('word_candidates').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user!.id,
      }).eq('id', candidate.id);
      queryClient.setQueryData(['admin-candidates'], (prev: WordCandidate[]) =>
        (prev ?? []).map((c) => (c.id === candidate.id ? { ...c, status: 'approved' as const } : c)),
      );
      queryClient.setQueryData(['admin-words'], (prev: Word[]) =>
        [...(prev ?? []), inserted as Word].sort((a, b) => a.word.localeCompare(b.word)),
      );
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApprovingId(null);
    }
  }

  async function rejectCandidate(candidateId: string, notes: string) {
    setRejectingId(candidateId);
    try {
      await supabase.from('word_candidates').update({
        status: 'rejected',
        review_notes: notes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user!.id,
      }).eq('id', candidateId);
      queryClient.setQueryData(['admin-candidates'], (prev: WordCandidate[]) =>
        (prev ?? []).map((c) => (c.id === candidateId ? { ...c, status: 'rejected' as const, review_notes: notes || null } : c)),
      );
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setRejectingId(null);
      setRejectNotes('');
    }
  }

  const pendingCount = candidates.filter((c) => c.status === 'pending').length;

  return (
    <section className="space-y-6 max-w-4xl">
      <p className="text-sm text-gray-400">
        Discover new vocabulary words with AI. Words are queued for your review before being added to the main word bank.
      </p>

      {/* Discovery trigger */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-white text-sm">Word Discovery</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Theme / Focus (optional)</label>
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. medical terminology, rhetoric, law…"
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Words to discover: <strong className="text-white">{count}</strong></label>
            <input
              type="range" min={5} max={50} step={5} value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full mt-2 accent-violet-500"
            />
          </div>
        </div>
        {runError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{runError}
          </div>
        )}
        {result && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950/40 border border-emerald-800 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />
            Queued {result.queued} new word{result.queued !== 1 ? 's' : ''} for review.
            {result.skipped_duplicates > 0 && ` Skipped ${result.skipped_duplicates} near-duplicate${result.skipped_duplicates !== 1 ? 's' : ''}.`}
          </div>
        )}
        <button
          onClick={runAgent}
          disabled={running}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {running ? 'Discovering words…' : 'Discover Words'}
        </button>
      </div>

      {/* Review queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-white text-sm">
            Review Queue
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </h3>
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {(['pending', 'approved', 'rejected'] as const).map((s) => {
              const c = candidates.filter((cd) => cd.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {s} ({c})
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? <TabSpinner /> : (
          <div className="space-y-3">
            {candidates.filter((c) => c.status === statusFilter).length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-2xl text-sm">
                No {statusFilter} candidates.
              </div>
            ) : candidates.filter((c) => c.status === statusFilter).map((candidate) => (
              <div key={candidate.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-bold text-white">{candidate.word}</h4>
                    <DifficultyBadge value={candidate.difficulty} small />
                  </div>
                  {candidate.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveCandidate(candidate)}
                        disabled={approvingId === candidate.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                      >
                        {approvingId === candidate.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          if (rejectingId === candidate.id) rejectCandidate(candidate.id, rejectNotes);
                          else { setRejectingId(candidate.id); setRejectNotes(''); }
                        }}
                        disabled={approvingId === candidate.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        {rejectingId === candidate.id ? 'Confirm Reject' : 'Reject'}
                      </button>
                    </div>
                  )}
                  {candidate.status === 'approved' && <span className="text-xs text-emerald-400 font-medium">✓ Approved</span>}
                  {candidate.status === 'rejected' && <span className="text-xs text-red-400 font-medium">✗ Rejected</span>}
                </div>

                {rejectingId === candidate.id && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <button onClick={() => setRejectingId(null)} className="text-gray-500 hover:text-white px-2">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <p className="text-sm text-gray-300">{candidate.correct_definition}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {candidate.distractors.map((d, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-400">
                      <span className="text-gray-600 mr-1">✗</span>{d}
                    </div>
                  ))}
                </div>

                {candidate.example_sentences.length > 0 && (
                  <div className="space-y-1">
                    {candidate.example_sentences.map((s, i) => (
                      <p key={i} className="text-xs text-gray-500 italic border-l-2 border-gray-700 pl-2">{s}</p>
                    ))}
                  </div>
                )}

                {candidate.review_notes && (
                  <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-lg px-3 py-2">
                    Note: {candidate.review_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
