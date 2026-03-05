'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Trophy, Gamepad2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LeaderboardEntry } from '@/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from('leaderboard_ranked')
      .select('*')
      .eq('type', 'global')
      .order('score', { ascending: false })
      .limit(10);

    if (!error && data) {
      setEntries(data as LeaderboardEntry[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaderboard();

    // Real-time: re-fetch whenever any leaderboard row changes
    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leaderboard' },
        fetchLeaderboard,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaderboard]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <Trophy className="w-14 h-14 text-yellow-400 mx-auto mb-3 drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]" />
          <h1 className="text-4xl font-extrabold">Leaderboard</h1>
          <p className="text-gray-400 mt-2 text-sm">Top 10 all-time scores · live updates</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-xl text-gray-400">No scores yet — be the first!</p>
            <Link
              href="/game"
              className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 underline underline-offset-4"
            >
              <Gamepad2 className="w-4 h-4" /> Play now
            </Link>
          </div>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-colors ${
                  i === 0
                    ? 'border-yellow-500/40 bg-yellow-950/20'
                    : i === 1
                      ? 'border-gray-400/30 bg-gray-800/40'
                      : i === 2
                        ? 'border-amber-700/30 bg-amber-950/20'
                        : 'border-gray-800 bg-gray-900/40'
                }`}
              >
                {/* Rank */}
                <span className="text-2xl w-8 text-center shrink-0 leading-none">
                  {i < 3 ? (
                    MEDALS[i]
                  ) : (
                    <span className="text-gray-500 text-base font-bold">#{i + 1}</span>
                  )}
                </span>

                {/* Avatar */}
                {entry.user_photo ? (
                  <Image
                    src={entry.user_photo}
                    alt={entry.user_name ?? 'Player'}
                    width={40}
                    height={40}
                    className="rounded-full shrink-0 ring-2 ring-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {entry.user_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}

                {/* Name */}
                <span className="flex-1 font-semibold truncate">{entry.user_name ?? 'Anonymous'}</span>

                {/* Score */}
                <span
                  className={`text-xl font-black tabular-nums ${
                    i === 0
                      ? 'text-yellow-400'
                      : i === 1
                        ? 'text-gray-300'
                        : i === 2
                          ? 'text-amber-600'
                          : 'text-violet-400'
                  }`}
                >
                  {entry.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* CTA */}
        <div className="text-center mt-10">
          <Link
            href="/game"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            <Gamepad2 className="w-4 h-4" />
            Play &amp; Claim Your Spot
          </Link>
        </div>
      </div>
    </div>
  );
}
