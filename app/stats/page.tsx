'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  Zap,
  Target,
  TrendingUp,
  Clock,
  Star,
  BookOpen,
  ChevronRight,
  Loader2,
  Award,
  RefreshCcw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_META, WORD_CATEGORIES, difficultyToCategory } from '@/types';
import type { WordCategory, GameSession, UserCategoryProgress } from '@/types';

interface CategoryAccuracy {
  category: WordCategory;
  correct: number;
  total: number;
  accuracy: number;
}

interface TopMissedWord {
  word_id: string;
  word: string;
  correct_definition: string;
  difficulty: number;
  incorrect_count: number;
  correct_count: number;
}

export default function StatsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', user?.id],
    queryFn: async () => {
      const [sessionsRes, wordStatsRes, flashcardProgressRes, dueReviewRes] = await Promise.all([
        supabase
          .from('game_sessions')
          .select('id, score, max_score, word_count, created_at, type')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('user_word_stats')
          .select('word_id, correct_count, incorrect_count, last_correct')
          .eq('user_id', user!.id),

        supabase
          .from('user_category_progress')
          .select('*')
          .eq('user_id', user!.id),

        supabase
          .from('flashcard_reviews')
          .select('word_id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .lte('next_review_at', new Date().toISOString()),
      ]);

      const sessions = (sessionsRes.data ?? []) as GameSession[];
      const wordStats = wordStatsRes.data ?? [];
      const flashcardProgress = (flashcardProgressRes.data ?? []) as UserCategoryProgress[];
      const dueReviewCount = dueReviewRes.count ?? 0;

      const totalSessions = sessions.length;
      const bestScore = sessions.length > 0 ? Math.max(...sessions.map((s) => s.score)) : 0;
      const averageScore =
        sessions.length > 0
          ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
          : 0;
      const recentSessions = sessions.slice(0, 10);

      const totalWordsAttempted = wordStats.reduce((n, s) => n + s.correct_count + s.incorrect_count, 0);
      const overallCorrect = wordStats.reduce((n, s) => n + s.correct_count, 0);

      const attemptedWordIds = wordStats.map((s) => s.word_id);
      let categoryAccuracy: CategoryAccuracy[] = WORD_CATEGORIES.map((cat) => ({
        category: cat, correct: 0, total: 0, accuracy: 0,
      }));

      if (attemptedWordIds.length > 0) {
        const { data: wordDiffs } = await supabase
          .from('words')
          .select('id, difficulty')
          .in('id', attemptedWordIds);

        const diffMap = new Map((wordDiffs ?? []).map((w) => [w.id, w.difficulty as number]));
        const catMap: Record<WordCategory, { correct: number; total: number }> = {
          survival: { correct: 0, total: 0 },
          social: { correct: 0, total: 0 },
          professional: { correct: 0, total: 0 },
          eloquent: { correct: 0, total: 0 },
        };
        for (const stat of wordStats) {
          const diff = diffMap.get(stat.word_id);
          if (diff == null) continue;
          const cat = difficultyToCategory(diff);
          catMap[cat].correct += stat.correct_count;
          catMap[cat].total += stat.correct_count + stat.incorrect_count;
        }
        categoryAccuracy = WORD_CATEGORIES.map((cat) => ({
          category: cat,
          correct: catMap[cat].correct,
          total: catMap[cat].total,
          accuracy: catMap[cat].total > 0 ? Math.round((catMap[cat].correct / catMap[cat].total) * 100) : 0,
        }));
      }

      const { data: missedRaw } = await supabase
        .from('user_word_stats')
        .select('word_id, correct_count, incorrect_count')
        .eq('user_id', user!.id)
        .gt('incorrect_count', 0)
        .order('incorrect_count', { ascending: false })
        .limit(5);

      const topMissed: TopMissedWord[] = [];
      if ((missedRaw ?? []).length > 0) {
        const missedIds = (missedRaw ?? []).map((r) => r.word_id);
        const { data: missedWordData } = await supabase
          .from('words')
          .select('id, word, correct_definition, difficulty')
          .in('id', missedIds);
        const wordInfoMap = new Map((missedWordData ?? []).map((w) => [w.id, w]));
        for (const r of missedRaw ?? []) {
          const w = wordInfoMap.get(r.word_id);
          if (w) {
            topMissed.push({
              word_id: r.word_id,
              word: w.word,
              correct_definition: w.correct_definition,
              difficulty: w.difficulty,
              incorrect_count: r.incorrect_count,
              correct_count: r.correct_count,
            });
          }
        }
      }

      const { count: masteredCount } = await supabase
        .from('flashcard_reviews')
        .select('word_id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .gte('repetitions', 3);

      return {
        totalSessions,
        totalWordsAttempted,
        overallCorrect,
        bestScore,
        averageScore,
        recentSessions,
        categoryAccuracy,
        topMissed,
        flashcardStats: flashcardProgress,
        dueReviewCount,
        masteredCount: masteredCount ?? 0,
      };
    },
    enabled: !!user,
  });

  useEffect(() => {
    console.debug('[StatsPage] auth guard effect', { authLoading, hasUser: !!user });
    if (!authLoading && !user) {
      console.debug('[StatsPage] no user — redirecting to /');
      router.replace('/');
    }
  }, [user, authLoading, router]);

  console.debug('[StatsPage] render', { authLoading, isLoading, hasUser: !!user });

  if (authLoading || isLoading) {
    console.debug('[StatsPage] showing spinner', { authLoading, isLoading });
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  const overallAccuracy = stats && stats.totalWordsAttempted > 0
    ? Math.round((stats.overallCorrect / stats.totalWordsAttempted) * 100)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="w-7 h-7 text-violet-400" />
          <h1 className="text-2xl font-extrabold text-white">My Stats</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Your performance across Jam sessions and flashcard learning.
        </p>
      </div>

      {stats && stats.totalSessions === 0 && stats.totalWordsAttempted === 0 ? (
        /* First-time user */
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-10 text-center space-y-4">
          <Zap className="w-12 h-12 text-yellow-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">No data yet!</h2>
          <p className="text-sm text-gray-400">Complete a Jam or a flashcard session to see your stats here.</p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/learn"
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <BookOpen className="w-4 h-4" /> Start Learning
            </Link>
            <Link
              href="/game"
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <Zap className="w-4 h-4" /> Play a Jam
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Overview stat cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard
              icon={<Zap className="w-5 h-5 text-yellow-400" />}
              label="Jams Played"
              value={stats?.totalSessions ?? 0}
            />
            <StatCard
              icon={<Star className="w-5 h-5 text-violet-400" />}
              label="Best Score"
              value={stats?.bestScore ?? 0}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-sky-400" />}
              label="Avg Score"
              value={stats?.averageScore ?? 0}
            />
            <StatCard
              icon={<Target className="w-5 h-5 text-emerald-400" />}
              label="Accuracy"
              value={overallAccuracy !== null ? `${overallAccuracy}%` : '—'}
            />
          </div>

          {/* ── Flashcard overview ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            <StatCard
              icon={<BookOpen className="w-5 h-5 text-fuchsia-400" />}
              label="Words Seen (Flashcards)"
              value={(stats?.flashcardStats ?? []).reduce((n, p) => n + p.words_seen, 0)}
            />
            <StatCard
              icon={<Award className="w-5 h-5 text-amber-400" />}
              label="Words Mastered"
              value={stats?.masteredCount ?? 0}
            />
            <StatCard
              icon={<RefreshCcw className="w-5 h-5 text-blue-400" />}
              label="Due for Review"
              value={stats?.dueReviewCount ?? 0}
              highlight={!!stats?.dueReviewCount}
              href="/learn/flashcard?mode=review"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* ── Category accuracy ──────────────────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="font-bold text-white mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-400" />
                Accuracy by Category
              </h2>
              <div className="space-y-3">
                {(stats?.categoryAccuracy ?? []).map(({ category, correct, total, accuracy }) => {
                  const meta = CATEGORY_META[category];
                  const barColor: Record<string, string> = {
                    emerald: 'bg-emerald-400',
                    sky: 'bg-sky-400',
                    violet: 'bg-violet-400',
                    amber: 'bg-amber-400',
                  };
                  return (
                    <div key={category}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-300 flex items-center gap-1.5">
                          <span>{meta.emoji}</span>
                          <span>{meta.label}</span>
                          <span className="text-xs text-gray-600">({meta.difficultyRange})</span>
                        </span>
                        <span className="text-xs text-gray-400">
                          {total > 0 ? `${accuracy}%  (${correct}/${total})` : 'no data'}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor[meta.color]}`}
                          style={{ width: `${accuracy}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Flashcard progress by category ──────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="font-bold text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-fuchsia-400" />
                Flashcard Progress
              </h2>
              <div className="space-y-3">
                {WORD_CATEGORIES.map((cat) => {
                  const prog = (stats?.flashcardStats ?? []).find((p) => p.category === cat);
                  const meta = CATEGORY_META[cat];
                  const seen = prog?.words_seen ?? 0;
                  const mastered = prog?.words_mastered ?? 0;
                  const barColor: Record<string, string> = {
                    emerald: 'bg-emerald-400/60',
                    sky: 'bg-sky-400/60',
                    violet: 'bg-violet-400/60',
                    amber: 'bg-amber-400/60',
                  };
                  return (
                    <Link
                      key={cat}
                      href={`/learn/${cat}`}
                      className="flex items-center justify-between py-1.5 group hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.emoji}</span>
                        <div>
                          <p className="text-sm text-gray-300 group-hover:text-white transition-colors">
                            {meta.label}
                            <span className="text-xs text-gray-600 ml-1">({meta.difficultyRange})</span>
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColor[meta.color]}`}
                                style={{ width: mastered > 0 && seen > 0 ? `${Math.round((mastered / seen) * 100)}%` : '0%' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{seen} seen</p>
                        <p className="text-xs text-gray-600">{mastered} mastered</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-300 ml-2 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Top missed words ─────────────────────────────────────────────── */}
          {(stats?.topMissed ?? []).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-red-400" />
                  Most Missed Words
                </h2>
                <Link
                  href="/learn/flashcard?mode=missed"
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                >
                  Practice all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {(stats?.topMissed ?? []).map((w) => {
                  const cat = difficultyToCategory(w.difficulty);
                  const meta = CATEGORY_META[cat];
                  const totalAttempts = w.correct_count + w.incorrect_count;
                  const accuracy = totalAttempts > 0 ? Math.round((w.correct_count / totalAttempts) * 100) : 0;
                  return (
                    <div
                      key={w.word_id}
                      className="flex items-start justify-between gap-4 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-white text-sm">{w.word}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400">
                            {meta.emoji} d{w.difficulty}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{w.correct_definition}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-red-400 font-medium">{w.incorrect_count}× missed</p>
                        <p className="text-[10px] text-gray-600">{accuracy}% correct</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Recent sessions ───────────────────────────────────────────────── */}
          {(stats?.recentSessions ?? []).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="font-bold text-white mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                Recent Jams
              </h2>
              <div className="space-y-2">
                {(stats?.recentSessions ?? []).map((session) => {
                  const pct = session.max_score > 0
                    ? Math.round((session.score / session.max_score) * 100)
                    : 0;
                  const date = new Date(session.created_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });
                  const time = new Date(session.created_at).toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-800/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-gray-300">
                          <span className="font-semibold text-white">{session.score}</span>
                          <span className="text-gray-600"> / {session.max_score} pts</span>
                          <span className="text-gray-600 ml-2 text-xs">({session.word_count} words)</span>
                        </p>
                        <p className="text-xs text-gray-600">{date} · {time}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${
                          pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CTA strip ─────────────────────────────────────────────────────── */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/learn"
              className="rounded-2xl border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 p-4 flex items-center gap-3 transition-colors group"
            >
              <BookOpen className="w-5 h-5 text-violet-300 shrink-0" />
              <div>
                <p className="font-semibold text-white text-sm">Study Flashcards</p>
                <p className="text-xs text-gray-400">Browse by category and track mastery</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 ml-auto transition-colors" />
            </Link>
            <Link
              href="/game"
              className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 p-4 flex items-center gap-3 transition-colors group"
            >
              <Zap className="w-5 h-5 text-yellow-300 shrink-0" />
              <div>
                <p className="font-semibold text-white text-sm">Play a Jam</p>
                <p className="text-xs text-gray-400">Test your knowledge against the clock</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 ml-auto transition-colors" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  highlight,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div className={`bg-gray-900 border rounded-2xl p-4 flex items-center gap-3 ${
      highlight ? 'border-blue-500/50 bg-blue-500/10' : 'border-gray-800'
    }`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xl font-extrabold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>;
  }
  return inner;
}
