'use client';

import { useEffect, useState } from 'react';
import { Save, Hash, Timer, Gauge, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, GameConfig } from '@/types';
import { DEFAULT_GAME_CONFIG } from '@/types';
import { TabSpinner } from './shared';

export default function SettingsTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: fetchedConfig, isLoading: configLoading } = useQuery({
    queryKey: ['game-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('game_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return { ...DEFAULT_GAME_CONFIG, ...(data as GameConfig) } as GameConfig;
    },
    enabled: !!user && !!isAdmin,
  });

  const { data: words = [] } = useQuery<Word[]>({
    queryKey: ['admin-words'],
    enabled: false, // only read from cache — WordsTab populates this
  });

  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  useEffect(() => { if (fetchedConfig) setConfig(fetchedConfig); }, [fetchedConfig]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { error: upsertErr } = await supabase.from('game_config').upsert({ id: 1, ...config });
      if (upsertErr) throw upsertErr;
      queryClient.setQueryData(['game-config'], config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to save settings. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  if (configLoading) return <TabSpinner />;

  const eligiblePool = words.filter((w) => w.difficulty >= config.difficulty_min && w.difficulty <= config.difficulty_max).length;

  return (
    <section className="max-w-2xl space-y-8">
      <p className="text-sm text-gray-400">
        These settings apply globally to every new game session. Changes take effect immediately for all players.
      </p>

      {/* Word count */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-white text-sm">Words per Round</h3>
        </div>
        <p className="text-xs text-gray-500">
          How many words each player is quizzed on in a single game. Words are drawn randomly from the eligible pool.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range" min={3} max={Math.max(50, words.length)} step={1}
            value={config.word_count}
            onChange={(e) => setConfig((c) => ({ ...c, word_count: Number(e.target.value) }))}
            className="flex-1 accent-violet-500"
          />
          <span className="text-2xl font-extrabold text-violet-300 tabular-nums w-12 text-right">{config.word_count}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-600">
          <span>3 (min)</span>
          <span className="text-gray-500">Pool size: {eligiblePool} eligible words</span>
          <span>{Math.max(50, words.length)} (max)</span>
        </div>
        {config.word_count > eligiblePool && eligiblePool > 0 && (
          <p className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
            ⚠ Word count exceeds the eligible pool — all matching words will be used and the rest padded with repeats.
          </p>
        )}
      </div>

      {/* Timer */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-white text-sm">Timer per Word (seconds)</h3>
        </div>
        <p className="text-xs text-gray-500">
          Scoring formula: 100&nbsp;+&nbsp;(timeLeft&nbsp;×&nbsp;10) pts per correct answer, so max per word = 100&nbsp;+&nbsp;(timer&nbsp;×&nbsp;10).
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range" min={3} max={30} step={1}
            value={config.timer_seconds}
            onChange={(e) => setConfig((c) => ({ ...c, timer_seconds: Number(e.target.value) }))}
            className="flex-1 accent-violet-500"
          />
          <span className="text-2xl font-extrabold text-violet-300 tabular-nums w-16 text-right">{config.timer_seconds}s</span>
        </div>
        <div className="flex justify-between text-xs text-gray-600">
          <span>3s (fast)</span>
          <span className="text-gray-500">Max score/word: {100 + config.timer_seconds * 10} pts</span>
          <span>30s (relaxed)</span>
        </div>
      </div>

      {/* Difficulty range */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-white text-sm">Difficulty Filter</h3>
        </div>
        <p className="text-xs text-gray-500">
          Only words within this difficulty band appear in the game. Useful for themed sessions (e.g. beginners: 1–4, advanced: 7–10).
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Minimum</span>
              <span className="text-sm font-bold text-emerald-400">{config.difficulty_min}</span>
            </div>
            <input
              type="range" min={1} max={10} step={1} value={config.difficulty_min}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig((c) => ({ ...c, difficulty_min: v, difficulty_max: Math.max(c.difficulty_max, v) }));
              }}
              className="w-full accent-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Maximum</span>
              <span className="text-sm font-bold text-red-400">{config.difficulty_max}</span>
            </div>
            <input
              type="range" min={1} max={10} step={1} value={config.difficulty_max}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig((c) => ({ ...c, difficulty_max: v, difficulty_min: Math.min(c.difficulty_min, v) }));
              }}
              className="w-full accent-red-500"
            />
          </div>
        </div>
        <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-linear-to-r from-emerald-500 to-red-500 rounded-full transition-all"
            style={{ left: `${((config.difficulty_min - 1) / 9) * 100}%`, right: `${((10 - config.difficulty_max) / 9) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600">
          {[1,2,3,4,5,6,7,8,9,10].map((n) => (
            <span key={n} className={n >= config.difficulty_min && n <= config.difficulty_max ? 'text-gray-300 font-medium' : ''}>{n}</span>
          ))}
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 pt-1">
          {[1,2,3,4,5,6,7,8,9,10].map((n) => {
            const count = words.filter((w) => w.difficulty === n).length;
            const active = n >= config.difficulty_min && n <= config.difficulty_max;
            return (
              <div key={n} className={`text-center rounded-lg p-1.5 text-xs border ${active ? 'bg-violet-900/40 border-violet-700 text-violet-200' : 'bg-gray-800/40 border-gray-800 text-gray-600'}`}>
                <div className="font-bold">{count}</div>
                <div className="text-[10px] opacity-60">d{n}</div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
          <Check className="w-4 h-4 shrink-0" />Settings saved! New game sessions will use these values.
        </div>
      )}
      <button
        onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </section>
  );
}
