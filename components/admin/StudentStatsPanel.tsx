'use client';

import { X, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { UserProfile, GameSession, UserCategoryProgress } from '@/types';
import { CATEGORY_META } from '@/types';
import { PlanBadge, RoleBadge } from './shared';

interface StudentStatsPanelProps {
  userId: string;
  user: UserProfile;
  onClose: () => void;
}

// Map game mode to a readable label
const MODE_LABEL: Record<string, string> = {
  vocabulary: 'Vocabulary',
  sentence_blank: 'Fill-in-blank',
  sentence_match: 'Sentence Match',
};

export default function StudentStatsPanel({ userId, user, onClose }: StudentStatsPanelProps) {
  const { isAdmin } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-student-stats', userId],
    queryFn: async () => {
      const [sessionsRes, wordStatsRes, categoryProgressRes] = await Promise.all([
        supabase
          .from('game_sessions')
          .select('id, score, max_score, word_count, mode, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('user_word_stats')
          .select('word_id, correct_count, incorrect_count')
          .eq('user_id', userId)
          .order('incorrect_count', { ascending: false })
          .limit(10),
        supabase.from('user_category_progress').select('*').eq('user_id', userId),
      ]);

      const topMissedWordIds = (wordStatsRes.data ?? [])
        .filter((w) => w.incorrect_count > 0)
        .map((w) => w.word_id);

      let topMissedWords: { id: string; word: string; incorrect_count: number; correct_count: number }[] = [];
      if (topMissedWordIds.length > 0) {
        const { data: wordData } = await supabase.from('words').select('id, word').in('id', topMissedWordIds);
        const wordMap = new Map((wordData ?? []).map((w) => [w.id, w.word]));
        topMissedWords = (wordStatsRes.data ?? [])
          .filter((w) => w.incorrect_count > 0)
          .map((w) => ({ id: w.word_id, word: wordMap.get(w.word_id) ?? '—', incorrect_count: w.incorrect_count, correct_count: w.correct_count }))
          .slice(0, 8);
      }

      return {
        sessions: (sessionsRes.data ?? []) as GameSession[],
        categoryProgress: (categoryProgressRes.data ?? []) as UserCategoryProgress[],
        topMissedWords,
      };
    },
    enabled: !!isAdmin,
  });

  // Compute derived stats from sessions
  const sessions = stats?.sessions ?? [];
  const sessionCount = sessions.length;
  const bestScore = sessionCount > 0 ? Math.max(...sessions.map((s) => s.score)) : 0;
  const avgScore = sessionCount > 0 ? Math.round(sessions.reduce((acc, s) => acc + s.score, 0) / sessionCount) : 0;
  const totalWordsAnswered = sessions.reduce((acc, s) => acc + (s.word_count ?? 0), 0);

  // Mode breakdown
  const modeBreakdown = sessions.reduce<Record<string, number>>((acc, s) => {
    const m = s.mode ?? 'vocabulary';
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});

  // Score accuracy trend (last 10 sessions as % of max_score)
  const recentTrend = sessions
    .slice(0, 10)
    .reverse()
    .map((s) => (s.max_score && s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 shrink-0">
        {user.avatar_url ? (
          <Image src={user.avatar_url} alt={user.name ?? ''} width={40} height={40} className="rounded-full shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
            {user.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white truncate">{user.name ?? 'Unknown'}</p>
            <PlanBadge plan={user.plan} />
            <RoleBadge role={user.role} />
          </div>
          <p className="text-xs text-gray-500">Joined {new Date(user.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
          </div>
        ) : !stats ? (
          <p className="text-center text-gray-500 text-sm py-10">No data yet for this student.</p>
        ) : (
          <>
            {/* Overview stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Sessions', value: sessionCount, color: 'text-white' },
                { label: 'Best Score', value: bestScore, color: 'text-violet-300' },
                { label: 'Avg Score', value: avgScore, color: 'text-emerald-300' },
                { label: 'Words Seen', value: totalWordsAnswered, color: 'text-sky-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-800 rounded-xl p-3 text-center">
                  <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Mode breakdown */}
            {sessionCount > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2.5">Mode Breakdown</p>
                <div className="space-y-2">
                  {Object.entries(modeBreakdown).map(([mode, count]) => (
                    <div key={mode} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-28 shrink-0">{MODE_LABEL[mode] ?? mode}</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full"
                          style={{ width: `${Math.round((count / sessionCount) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-6 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score accuracy trend */}
            {recentTrend.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2.5">Score Accuracy — Last {recentTrend.length} Sessions</p>
                <div className="flex items-end gap-1 h-10">
                  {recentTrend.map((pct, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <div
                        className={`w-full rounded-t transition-all ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ height: `${Math.max(4, pct)}%` }}
                        title={`${pct}%`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>oldest</span><span>newest</span>
                </div>
              </div>
            )}

            {/* Category progress */}
            {stats.categoryProgress.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2.5">Category Progress</p>
                <div className="space-y-2">
                  {stats.categoryProgress.map((cp) => {
                    const meta = CATEGORY_META[cp.category as keyof typeof CATEGORY_META];
                    if (!meta) return null;
                    const masteredPct = cp.words_seen > 0 ? Math.round((cp.words_mastered / cp.words_seen) * 100) : 0;
                    return (
                      <div key={cp.category} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-gray-400 shrink-0">{meta.emoji} {meta.label}</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500"
                            style={{ width: `${Math.min(100, masteredPct)}%` }}
                          />
                        </div>
                        <span className="text-gray-500 shrink-0 w-28 text-right">
                          {cp.words_mastered}/{cp.words_seen} mastered
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top missed words */}
            {stats.topMissedWords.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2.5">Top Missed Words</p>
                <div className="space-y-1.5">
                  {stats.topMissedWords.map((w) => {
                    const total = w.incorrect_count + w.correct_count;
                    const accuracy = total > 0 ? Math.round((w.correct_count / total) * 100) : 0;
                    return (
                      <div key={w.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                        <span className="text-white text-xs font-medium">{w.word}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-500">{accuracy}% acc.</span>
                          <span className="text-[11px]">
                            <span className="text-emerald-400">{w.correct_count}✓</span>
                            {' '}
                            <span className="text-red-400">{w.incorrect_count}✗</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent sessions */}
            {sessions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2.5">Recent Sessions</p>
                <div className="space-y-1.5">
                  {sessions.slice(0, 8).map((s) => {
                    const pct = s.max_score && s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0;
                    return (
                      <div key={s.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs gap-3">
                        <span className="text-gray-500 shrink-0">{new Date(s.created_at).toLocaleDateString()}</span>
                        <span className="text-gray-400 capitalize truncate">{MODE_LABEL[s.mode] ?? s.mode}</span>
                        <span className={`font-bold shrink-0 ${pct >= 75 ? 'text-emerald-300' : pct >= 50 ? 'text-yellow-300' : 'text-red-300'}`}>
                          {s.score}<span className="text-gray-600 font-normal">/{s.max_score}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sessionCount === 0 && stats.categoryProgress.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">This student hasn&apos;t played any sessions yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
