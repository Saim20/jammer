'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Zap, RefreshCw, Target, ChevronRight, Loader2, FileText, Shuffle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_META, WORD_CATEGORIES, difficultyToCategory } from '@/types';
import type { WordCategory, UserCategoryProgress } from '@/types';

export default function LearnPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['learn', user?.id],
    queryFn: async () => {
      const { count: due } = await supabase
        .from('flashcard_reviews')
        .select('word_id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .lte('next_review_at', new Date().toISOString());

      const { count: missed } = await supabase
        .from('user_word_stats')
        .select('word_id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .gt('incorrect_count', 0);

      const { data: progData } = await supabase
        .from('user_category_progress')
        .select('*')
        .eq('user_id', user!.id);
      const progress = {} as Record<WordCategory, UserCategoryProgress>;
      for (const row of progData ?? []) {
        progress[row.category as WordCategory] = row;
      }

      const { data: wordData } = await supabase.from('words').select('difficulty');
      const categoryTotals = {} as Record<WordCategory, number>;
      for (const cat of WORD_CATEGORIES) categoryTotals[cat] = 0;
      for (const row of wordData ?? []) {
        categoryTotals[difficultyToCategory(row.difficulty as number)]++;
      }

      return {
        dueCount: due ?? 0,
        missedCount: missed ?? 0,
        progress,
        categoryTotals,
      };
    },
    enabled: !!user,
  });

  const dueCount = data?.dueCount ?? 0;
  const missedCount = data?.missedCount ?? 0;
  const progress = data?.progress ?? ({} as Record<WordCategory, UserCategoryProgress>);
  const categoryTotals = data?.categoryTotals ?? ({} as Record<WordCategory, number>);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8 text-violet-400" />
          <h1 className="text-3xl font-extrabold bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Learning Hub
          </h1>
        </div>
        <p className="text-gray-400 text-sm">
          Study with flashcards, review due cards, and practice words you&apos;ve missed.
        </p>
      </div>

      {/* Quick-action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {/* Due reviews */}
        <Link
          href="/learn/flashcard?mode=review"
          className={`group relative rounded-2xl border p-5 flex items-start gap-4 transition-all hover:scale-[1.02] active:scale-100 ${dueCount > 0
              ? 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/15'
              : 'border-gray-700 bg-gray-900 opacity-60 pointer-events-none'
            }`}
        >
          <div className="p-2.5 rounded-xl bg-blue-500/20 shrink-0">
            <RefreshCw className="w-5 h-5 text-blue-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-white">Review Due</p>
              {dueCount > 0 && (
                <span className="text-xs bg-blue-500 text-white rounded-full px-2 py-0.5 font-bold">
                  {dueCount}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {dueCount > 0 ? `${dueCount} card${dueCount !== 1 ? 's' : ''} waiting for review` : 'All caught up!'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
        </Link>

        {/* Missed words */}
        <Link
          href="/learn/flashcard?mode=missed"
          className={`group relative rounded-2xl border p-5 flex items-start gap-4 transition-all hover:scale-[1.02] active:scale-100 ${missedCount > 0
              ? 'border-red-500/50 bg-red-500/10 hover:bg-red-500/15'
              : 'border-gray-700 bg-gray-900 opacity-60 pointer-events-none'
            }`}
        >
          <div className="p-2.5 rounded-xl bg-red-500/20 shrink-0">
            <Target className="w-5 h-5 text-red-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-white">Practice Missed</p>
              {missedCount > 0 && (
                <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">
                  {missedCount}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {missedCount > 0 ? `${missedCount} word${missedCount !== 1 ? 's' : ''} missed in past jams` : 'No missed words yet!'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
        </Link>

        {/* Sentence fill-in */}
        <Link
          href="/game/sentence"
          className="group relative rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex items-start gap-4 transition-all hover:scale-[1.02] hover:bg-emerald-500/15 active:scale-100"
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/20 shrink-0">
            <FileText className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white mb-0.5">Sentence Fill-in</p>
            <p className="text-sm text-gray-400">Pick the missing word in a real sentence.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
        </Link>

        {/* Sentence match */}
        <Link
          href="/game/sentence-match"
          className="group relative rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-5 flex items-start gap-4 transition-all hover:scale-[1.02] hover:bg-fuchsia-500/15 active:scale-100"
        >
          <div className="p-2.5 rounded-xl bg-fuchsia-500/20 shrink-0">
            <Shuffle className="w-5 h-5 text-fuchsia-300" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white mb-0.5">Sentence Match</p>
            <p className="text-sm text-gray-400">Match words to sentence examples in context.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
        </Link>
      </div>

      {/* Start a Jam CTA */}
      <div className="relative rounded-2xl border border-violet-500/50 bg-linear-to-r from-violet-950/80 to-fuchsia-950/80 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 overflow-hidden mb-10">
        <div className="absolute inset-0 bg-linear-to-r from-violet-600/10 to-fuchsia-600/10 pointer-events-none" />
        <div className="flex items-center gap-3 relative">
          <div className="p-2 rounded-xl bg-yellow-400/15 shrink-0">
            <Zap className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <p className="font-bold text-white text-base">Ready to Jam?</p>
            <p className="text-sm text-gray-300">Race the clock, score points, climb the leaderboard.</p>
          </div>
        </div>
        <Link
          href="/game"
          className="relative shrink-0 bg-linear-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold px-7 py-3 rounded-xl transition-all hover:scale-[1.04] active:scale-100 text-sm shadow-lg shadow-violet-900/50"
        >
          Start a Jam →
        </Link>
      </div>

      {/* Category cards */}
      <h2 className="text-lg font-bold text-gray-200 mb-4">Categories</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {WORD_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const prog = progress[cat];
          const total = categoryTotals[cat] ?? 0;
          const seen = prog?.words_seen ?? 0;
          const mastered = prog?.words_mastered ?? 0;
          const pct = total > 0 ? (seen / total) * 100 : 0;

          const colorMap: Record<string, string> = {
            emerald: 'border-emerald-500/40 hover:bg-emerald-500/10',
            sky: 'border-sky-500/40 hover:bg-sky-500/10',
            violet: 'border-violet-500/40 hover:bg-violet-500/10',
            amber: 'border-amber-500/40 hover:bg-amber-500/10',
          };
          const barMap: Record<string, string> = {
            emerald: 'bg-emerald-400',
            sky: 'bg-sky-400',
            violet: 'bg-violet-400',
            amber: 'bg-amber-400',
          };
          const textMap: Record<string, string> = {
            emerald: 'text-emerald-300',
            sky: 'text-sky-300',
            violet: 'text-violet-300',
            amber: 'text-amber-300',
          };

          return (
            <Link
              key={cat}
              href={`/learn/${cat}`}
              className={`group rounded-2xl border bg-gray-900 p-5 flex flex-col gap-4 transition-all hover:scale-[1.02] active:scale-100 ${colorMap[meta.color]}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div>
                    <p className={`font-bold text-base ${textMap[meta.color]}`}>{meta.label}</p>
                    <p className="text-xs text-gray-500">{total} words</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">{meta.description}</p>

              {/* Progress */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{seen} seen</span>
                  <span>{mastered} mastered</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barMap[meta.color]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">{Math.round(pct)}% explored</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
