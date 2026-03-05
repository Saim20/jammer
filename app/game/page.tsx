'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, RotateCcw, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import GameBoard from '@/components/GameBoard';
import CountdownTimer from '@/components/CountdownTimer';
import type { Word, GameConfig } from '@/types';
import { DEFAULT_GAME_CONFIG } from '@/types';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = 'loading' | 'playing' | 'feedback' | 'finished';

export default function GamePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  // timerSecondsRef always reflects the current config so callbacks don't stale-close over it
  const timerSecondsRef = useRef(DEFAULT_GAME_CONFIG.timer_seconds);

  const [restartKey, setRestartKey] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_GAME_CONFIG.timer_seconds);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [savingScore, setSavingScore] = useState(false);

  // Ref guard: prevents double-submission if timer fires at the same tick as a click
  const hasAnsweredRef = useRef(false);

  // Accumulates each word result during the game so they can be batch-saved at the end
  const wordResultsRef = useRef<{ word_id: string; correct: boolean }[]>([]);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  // ── startWord: resets per-question state ───────────────────────────────────
  const startWord = useCallback((index: number, wordList: Word[]) => {
    const w = wordList[index];
    setChoices(shuffleArray([w.correct_definition, ...w.distractors]));
    setSelectedAnswer(null);
    setIsCorrect(null);
    setTimeLeft(timerSecondsRef.current);
    hasAnsweredRef.current = false;
    setPhase('playing');
  }, []);

  // ── Fetch config + words from Supabase ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchAll() {
      try {
        // Load config first so we can filter words correctly
        let resolvedConfig = DEFAULT_GAME_CONFIG;
        try {
          const { data: cfgData } = await supabase
            .from('game_config')
            .select('*')
            .eq('id', 1)
            .single();
          if (cfgData) {
            resolvedConfig = { ...DEFAULT_GAME_CONFIG, ...cfgData } as GameConfig;
          }
        } catch {
          // Config read failing is non-fatal — fall back to defaults
        }
        setConfig(resolvedConfig);
        timerSecondsRef.current = resolvedConfig.timer_seconds;

        // Fetch all words, filter by difficulty range, shuffle, then slice to word_count
        const { data: allWords, error } = await supabase
          .from('words')
          .select('*');

        if (error) throw error;
        if (!allWords || allWords.length === 0) {
          setFetchError('No words found. Ask an admin to add some first.');
          return;
        }

        const eligible = (allWords as Word[]).filter(
          (w) => w.difficulty >= resolvedConfig.difficulty_min && w.difficulty <= resolvedConfig.difficulty_max,
        );

        // If eligible pool is smaller than word_count, use all eligible words
        const pool = eligible.length > 0 ? eligible : (allWords as Word[]);
        const shuffled = shuffleArray(pool);
        const selected = shuffled.slice(0, resolvedConfig.word_count);

        setWords(selected);
      } catch (err) {
        console.error('Supabase fetch error:', err);
        setFetchError('Could not load words. Check your Supabase config.');
      }
    }
    fetchAll();
  }, [user, restartKey]);

  // ── Start game once words are loaded (also handles restart) ────────────────
  useEffect(() => {
    if (words.length > 0) {
      setCurrentIndex(0);
      startWord(0, words);
    }
  }, [words, startWord]);

  // ── handleAnswer ───────────────────────────────────────────────────────────
  const handleAnswer = useCallback(
    (choice: string | null) => {
      if (phase !== 'playing' || hasAnsweredRef.current) return;
      hasAnsweredRef.current = true;

      const currentWord = words[currentIndex];
      const correct = choice !== null && choice === currentWord.correct_definition;

      // Record this answer so we can persist stats at game end
      wordResultsRef.current.push({ word_id: currentWord.id, correct });

      setSelectedAnswer(choice ?? '__timeout__');
      setIsCorrect(correct);
      setPhase('feedback');

      if (correct) {
        setScore((s) => s + 100 + timeLeft * 10);
      }

      // Advance to next word after feedback pause
      const nextIndex = currentIndex + 1;
      setTimeout(() => {
        if (nextIndex >= words.length) {
          setPhase('finished');
        } else {
          setCurrentIndex(nextIndex);
          startWord(nextIndex, words);
        }
      }, 1600);
    },
    [phase, words, currentIndex, timeLeft, startWord],
  );

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      handleAnswer(null); // timeout → treat as wrong
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase, handleAnswer]);

  // ── Save score + word stats to Supabase ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'finished' || scoreSaved || !user) return;
    async function saveResults() {
      setSavingScore(true);
      try {
        const userName  = (user!.user_metadata?.full_name as string) ?? user!.email ?? 'Anonymous';
        const userPhoto = (user!.user_metadata?.avatar_url as string) ?? '';

        const [{ error: scoreError }, { error: statsError }] = await Promise.all([
          // Upsert leaderboard – keeps the player's personal best per type
          supabase.rpc('submit_score', {
            p_user_id:    user!.id,
            p_user_name:  userName,
            p_user_photo: userPhoto,
            p_score:      score,
            p_type:       'global',
          }),
          // Batch-increment per-word correct/incorrect counters
          supabase.rpc('record_word_results', {
            p_user_id: user!.id,
            p_results: wordResultsRef.current,
          }),
        ]);

        if (scoreError) throw scoreError;
        if (statsError) console.warn('Word stats save failed:', statsError);
        setScoreSaved(true);
      } catch (err) {
        console.error('Failed to save results:', err);
      } finally {
        setSavingScore(false);
      }
    }
    saveResults();
  }, [phase, scoreSaved, user, score]);

  function restart() {
    wordResultsRef.current = [];
    setScore(0);
    setScoreSaved(false);
    setPhase('loading');
    setWords([]);
    setRestartKey((k) => k + 1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return <Spinner />;
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] gap-4 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400 font-semibold max-w-md">{fetchError}</p>
      </div>
    );
  }

  if (phase === 'loading') {
    return <Spinner />;
  }

  if (phase === 'finished') {
    const maxScore = words.length * (100 + config.timer_seconds * 10);
    const pct = Math.round((score / maxScore) * 100);
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] gap-6 px-4 text-center">
        <div className="text-7xl">{pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪'}</div>
        <h2 className="text-3xl font-extrabold">Game Over!</h2>

        <div className="bg-gray-800 border border-gray-700 rounded-3xl px-16 py-8 space-y-1">
          <p className="text-xs uppercase tracking-widest text-gray-400">Final Score</p>
          <p className="text-7xl font-black text-violet-400">{score}</p>
          <p className="text-sm text-gray-500">
            {pct}% — out of {maxScore} possible
          </p>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={restart}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
          <button
            onClick={() => router.push('/leaderboard')}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            <Trophy className="w-4 h-4 text-yellow-400" />
            Leaderboard
          </button>
        </div>

        {savingScore && (
          <p className="text-sm text-gray-500 animate-pulse">Saving your score…</p>
        )}
        {scoreSaved && (
          <p className="text-sm text-emerald-500">✓ Score saved to leaderboard!</p>
        )}
      </div>
    );
  }

  const currentWord = words[currentIndex];
  if (!currentWord) return <Spinner />;

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 py-8">
      {/* HUD: score + timer */}
      <div className="w-full max-w-2xl mb-6 flex items-center justify-between gap-4">
        <div className="text-sm text-gray-400 shrink-0">
          Score:{' '}
          <span className="text-white font-bold text-lg tabular-nums">{score}</span>
        </div>
        <CountdownTimer timeLeft={timeLeft} totalTime={config.timer_seconds} />
      </div>

      <GameBoard
        word={currentWord}
        choices={choices}
        selectedAnswer={selectedAnswer}
        isCorrect={isCorrect}
        onSelect={handleAnswer}
        currentIndex={currentIndex}
        totalWords={words.length}
      />

      {/* Feedback banner */}
      {phase === 'feedback' && (
        <div
          className={`mt-6 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            isCorrect
              ? 'bg-emerald-950 border border-emerald-600 text-emerald-300'
              : 'bg-red-950 border border-red-700 text-red-300'
          }`}
        >
          {isCorrect ? (
            <>✓ Correct! +{100 + timeLeft * 10} pts</>
          ) : selectedAnswer === '__timeout__' ? (
            <>⏰ Time&apos;s up! &quot;{currentWord.correct_definition}&quot;</>
          ) : (
            <>✗ Incorrect. &quot;{currentWord.correct_definition}&quot;</>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
