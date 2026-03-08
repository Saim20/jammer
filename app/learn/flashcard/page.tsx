'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, CheckCircle2, BookOpen, RefreshCcw, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import FlashCard, { type ReviewQuality } from '@/components/FlashCard';
import { CATEGORY_META, WORD_CATEGORIES, CATEGORY_DIFFICULTY_RANGE, difficultyToCategory } from '@/types';
import type { Word, WordCategory } from '@/types';

type Mode = 'learn' | 'review' | 'missed';

interface WordResult {
  word_id: string;
  quality: ReviewQuality;
}

function FlashcardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setId = searchParams.get('set_id');
  const categoryParam = searchParams.get('category') as WordCategory | null;
  const modeParam = (searchParams.get('mode') ?? 'learn') as Mode;

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [phase, setPhase] = useState<'loading' | 'studying' | 'done'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  const loadWords = useCallback(async () => {
    if (!user) return;
    setPhase('loading');
    setError(null);
    setResults([]);
    setCurrentIndex(0);

    try {
      let loaded: Word[] = [];

      if (modeParam === 'review') {
        // Due spaced-repetition reviews
        const { data, error: rpcErr } = await supabase.rpc('get_due_reviews', {
          p_user_id: user.id,
          p_limit: 40,
        });
        if (rpcErr) throw rpcErr;
        let rows = (data ?? []) as Word[];
        if (setId) rows = rows.filter((w) => w.set_id === setId);
        // Filter by category = difficultyToCategory(difficulty)
        if (categoryParam) rows = rows.filter((w) => difficultyToCategory(w.difficulty) === categoryParam);
        loaded = rows;

      } else if (modeParam === 'missed') {
        // Words missed in game sessions — fetch via user_word_stats
        const { data: statsData, error: sErr } = await supabase
          .from('user_word_stats')
          .select('word_id, incorrect_count')
          .eq('user_id', user.id)
          .gt('incorrect_count', 0)
          .order('incorrect_count', { ascending: false })
          .limit(30);
        if (sErr) throw sErr;
        const missedIds = (statsData ?? []).map((r) => r.word_id);
        if (missedIds.length === 0) {
          setWords([]);
          setPhase('done');
          return;
        }
        const { data: missedWords, error: wErr } = await supabase
          .from('words')
          .select('*')
          .in('id', missedIds);
        if (wErr) throw wErr;
        // Sort by incorrect_count descending (most missed first)
        const countMap = new Map((statsData ?? []).map((r) => [r.word_id, r.incorrect_count]));
        loaded = (missedWords ?? []).sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0));

      } else {
        // 'learn' mode: fetch words for set/category, new ones first
        let wordQuery = supabase.from('words').select('*');
        if (setId) {
          wordQuery = wordQuery.eq('set_id', setId);
        } else if (categoryParam) {
          const [diffMin, diffMax] = CATEGORY_DIFFICULTY_RANGE[categoryParam];
          wordQuery = wordQuery.gte('difficulty', diffMin).lte('difficulty', diffMax);
        } else {
          // No filter — shouldn't normally happen; use a reasonable default
          wordQuery = wordQuery.limit(20);
        }
        const { data: allWords, error: wErr } = await wordQuery;
        if (wErr) throw wErr;

        const wordIds = (allWords ?? []).map((w) => w.id);
        if (wordIds.length === 0) {
          setWords([]);
          setPhase('done');
          return;
        }

        // Fetch existing reviews to sort (unseen first)
        const { data: reviews } = await supabase
          .from('flashcard_reviews')
          .select('word_id, next_review_at, repetitions')
          .eq('user_id', user.id)
          .in('word_id', wordIds);

        const reviewMap = new Map<string, { next_review_at: string; repetitions: number }>();
        for (const r of reviews ?? []) reviewMap.set(r.word_id, r);

        // Sort: unseen first (no review record), then by next_review_at ascending
        const sorted = (allWords ?? []).sort((a, b) => {
          const ra = reviewMap.get(a.id);
          const rb = reviewMap.get(b.id);
          if (!ra && !rb) return 0;
          if (!ra) return -1;
          if (!rb) return 1;
          return ra.next_review_at < rb.next_review_at ? -1 : 1;
        });
        loaded = sorted;
      }

      if (loaded.length === 0) {
        setPhase('done');
        return;
      }

      setWords(loaded);
      setPhase('studying');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load words');
      setPhase('loading');
    }
  }, [user, modeParam, setId, categoryParam]);

  useEffect(() => {
    if (user) loadWords();
  }, [user, loadWords]);

  async function handleRate(quality: ReviewQuality) {
    if (savingReview) return;
    const word = words[currentIndex];

    // Persist to DB (non-blocking for 'missed' mode — it's just practice)
    if (modeParam !== 'missed' || quality <= 2) {
      setSavingReview(true);
      try {
        await supabase.rpc('submit_flashcard_review', {
          p_user_id: user!.id,
          p_word_id: word.id,
          p_quality: quality,
        });
      } catch {
        // Non-fatal — continue
      } finally {
        setSavingReview(false);
      }
    }

    setResults((prev) => [...prev, { word_id: word.id, quality }]);

    if (currentIndex + 1 >= words.length) {
      setPhase('done');
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleSkip() {
    if (currentIndex + 1 >= words.length) {
      setPhase('done');
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  const modeLabel = modeParam === 'review' ? 'Review' : modeParam === 'missed' ? 'Practice' : 'Learn';
  const backHref = categoryParam ? `/learn/${categoryParam}` : '/learn';

  // ── Summary screen ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const again = results.filter((r) => r.quality <= 2).length;
    const good = results.filter((r) => r.quality >= 4).length;
    const hard = results.filter((r) => r.quality === 3).length;
    const total = results.length;

    return (
      <div className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Session Complete!</h1>
          <p className="text-gray-400 text-sm">
            {total > 0 ? `You reviewed ${total} card${total !== 1 ? 's' : ''}.` : 'No cards were available for this session.'}
          </p>
        </div>

        {total > 0 && (
          <div className="w-full grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-2xl font-bold text-emerald-300">{good}</p>
              <p className="text-xs text-gray-400 mt-0.5">Good / Easy</p>
            </div>
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
              <p className="text-2xl font-bold text-orange-300">{hard}</p>
              <p className="text-xs text-gray-400 mt-0.5">Hard</p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-2xl font-bold text-red-300">{again}</p>
              <p className="text-xs text-gray-400 mt-0.5">Again</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={loadWords}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Study Again
          </button>
          <Link
            href={backHref}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Back to Learning
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] gap-4">
        {error ? (
          <>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={loadWords}
              className="text-sm text-gray-400 hover:text-white underline"
            >
              Try again
            </button>
          </>
        ) : (
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        )}
      </div>
    );
  }

  // ── Study screen ─────────────────────────────────────────────────────────────
  const currentWord = words[currentIndex];
  const catMeta = currentWord ? CATEGORY_META[difficultyToCategory(currentWord.difficulty)] : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {categoryParam && WORD_CATEGORIES.includes(categoryParam)
            ? CATEGORY_META[categoryParam].label
            : 'Learning Hub'}
        </Link>
        <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 rounded-full px-3 py-1">
          {modeLabel} {catMeta ? `· ${catMeta.emoji} ${catMeta.label}` : ''}
        </span>
        <Link
          href={backHref}
          aria-label="End session"
          className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </Link>
      </div>

      {currentWord && (
        <FlashCard
          word={currentWord}
          currentIndex={currentIndex}
          totalWords={words.length}
          onRate={handleRate}
          onSkip={handleSkip}
          mode={modeParam}
        />
      )}

      {savingReview && (
        <p className="text-xs text-center text-gray-600 animate-pulse">Saving…</p>
      )}
    </div>
  );
}

export default function FlashcardPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      }
    >
      <FlashcardPage />
    </Suspense>
  );
}
