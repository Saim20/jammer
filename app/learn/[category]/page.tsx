'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, BookOpen, Loader2, ChevronRight, LayoutGrid } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_META, WORD_CATEGORIES, CATEGORY_DIFFICULTY_RANGE } from '@/types';
import type { WordCategory, FlashcardSet } from '@/types';

interface SetWithProgress extends FlashcardSet {
  total: number;
  seen: number;
  due: number;
}

export default function CategoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const category = params.category as string;

  const isValidCategory = WORD_CATEGORIES.includes(category as WordCategory);

  const { data, isLoading } = useQuery({
    queryKey: ['learn-cat', user?.id, category],
    queryFn: async () => {
      const { data: setsData } = await supabase
        .from('flashcard_sets')
        .select('*')
        .eq('category', category)
        .order('display_order', { ascending: true });

      const [diffMin, diffMax] = CATEGORY_DIFFICULTY_RANGE[category as WordCategory];
      const { data: wordData } = await supabase
        .from('words')
        .select('id, set_id')
        .gte('difficulty', diffMin)
        .lte('difficulty', diffMax);

      const wordIds = (wordData ?? []).map((w) => w.id);
      const seenSet = new Set<string>();
      const dueSet = new Set<string>();
      if (wordIds.length > 0) {
        const { data: reviewData } = await supabase
          .from('flashcard_reviews')
          .select('word_id, next_review_at')
          .eq('user_id', user!.id)
          .in('word_id', wordIds);
        const now = new Date().toISOString();
        for (const r of reviewData ?? []) {
          seenSet.add(r.word_id);
          if (r.next_review_at <= now) dueSet.add(r.word_id);
        }
      }

      const countBySet: Record<string, number> = {};
      for (const w of wordData ?? []) {
        if (w.set_id) countBySet[w.set_id] = (countBySet[w.set_id] ?? 0) + 1;
      }
      const uncategorizedIds = (wordData ?? []).filter((w) => !w.set_id).map((w) => w.id);

      const enriched: SetWithProgress[] = (setsData ?? []).map((s) => {
        const setWordIds = (wordData ?? []).filter((w) => w.set_id === s.id).map((w) => w.id);
        return {
          ...s,
          total: countBySet[s.id] ?? 0,
          seen: setWordIds.filter((id) => seenSet.has(id)).length,
          due: setWordIds.filter((id) => dueSet.has(id)).length,
        };
      });

      if (uncategorizedIds.length > 0) {
        enriched.push({
          id: '__unset__',
          name: 'Uncategorized',
          description: 'Words in this category not yet assigned to a set.',
          category: category as WordCategory,
          display_order: 9999,
          created_at: '',
          total: uncategorizedIds.length,
          seen: uncategorizedIds.filter((id) => seenSet.has(id)).length,
          due: uncategorizedIds.filter((id) => dueSet.has(id)).length,
        });
      }

      return {
        sets: enriched,
        totalInCategory: wordIds.length,
        seenInCategory: seenSet.size,
      };
    },
    enabled: !!user && isValidCategory,
  });

  const sets = data?.sets ?? [];
  const totalInCategory = data?.totalInCategory ?? 0;
  const seenInCategory = data?.seenInCategory ?? 0;

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
    if (!authLoading && !isValidCategory) router.replace('/learn');
  }, [user, authLoading, router, isValidCategory]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!isValidCategory) return null;

  const meta = CATEGORY_META[category as WordCategory];
  const pct = totalInCategory > 0 ? Math.round((seenInCategory / totalInCategory) * 100) : 0;

  const colorBorder: Record<string, string> = {
    emerald: 'border-emerald-500/30',
    sky:     'border-sky-500/30',
    violet:  'border-violet-500/30',
    amber:   'border-amber-500/30',
  };
  const colorText: Record<string, string> = {
    emerald: 'text-emerald-300',
    sky:     'text-sky-300',
    violet:  'text-violet-300',
    amber:   'text-amber-300',
  };
  const colorBar: Record<string, string> = {
    emerald: 'bg-emerald-400',
    sky:     'bg-sky-400',
    violet:  'bg-violet-400',
    amber:   'bg-amber-400',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Back */}
      <Link
        href="/learn"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Learning Hub
      </Link>

      {/* Header */}
      <div className={`rounded-2xl border ${colorBorder[meta.color]} bg-gray-900 p-6 mb-8`}>
        <div className="flex items-start gap-4">
          <span className="text-4xl shrink-0">{meta.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className={`text-2xl font-extrabold ${colorText[meta.color]}`}>{meta.label}</h1>
            <p className="text-xs text-gray-500 mt-0.5">Difficulty {meta.difficultyRange}</p>
            <p className="text-sm text-gray-400 mt-1">{meta.description}</p>
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{seenInCategory} of {totalInCategory} words seen</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colorBar[meta.color]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Study All button */}
        <div className="mt-4 flex gap-3">
          <Link
            href={`/learn/flashcard?category=${category}&mode=learn`}
            className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Study All
          </Link>
          <Link
            href={`/learn/flashcard?category=${category}&mode=review`}
            className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <LayoutGrid className="w-4 h-4" />
            Review Due
          </Link>
        </div>
      </div>

      {/* Sets */}
      <h2 className="text-lg font-bold text-gray-200 mb-4">Flashcard Sets</h2>
      {sets.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No sets yet for this category.</p>
          <p className="text-sm mt-1">An admin can create sets and assign words to them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sets.map((s) => {
            const setPct = s.total > 0 ? Math.round((s.seen / s.total) * 100) : 0;
            const setUrl = s.id === '__unset__'
              ? `/learn/flashcard?category=${category}&mode=learn`
              : `/learn/flashcard?set_id=${s.id}&mode=learn`;
            const reviewUrl = s.id === '__unset__'
              ? `/learn/flashcard?category=${category}&mode=review`
              : `/learn/flashcard?set_id=${s.id}&mode=review`;

            return (
              <div
                key={s.id}
                className="rounded-2xl border border-gray-700 bg-gray-900 p-5 flex flex-col gap-4 hover:border-gray-600 transition-colors"
              >
                <div>
                  <p className="font-semibold text-white">{s.name}</p>
                  {s.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.description}</p>
                  )}
                  <p className="text-xs text-gray-600 mt-1">{s.total} words</p>
                </div>

                {/* Per-set progress */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{s.seen} seen</span>
                    {s.due > 0 && (
                      <span className="text-blue-400 font-medium">{s.due} due</span>
                    )}
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colorBar[meta.color]}`}
                      style={{ width: `${setPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={setUrl}
                    className="flex-1 text-center text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Study
                  </Link>
                  {s.due > 0 && (
                    <Link
                      href={reviewUrl}
                      className="flex items-center gap-1 text-sm bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      {s.due} due
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
