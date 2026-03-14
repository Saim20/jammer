'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
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

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build common morphological variants of a word (base, -ing, -ed, -s/-es forms)
 * so that inflected forms used in example sentences are matched correctly.
 *
 * For words matching a CVC (consonant-vowel-consonant) pattern we include BOTH
 * the consonant-doubled form (run → running) and the simple form (happen →
 * happening). Detecting syllable stress accurately would require a dictionary,
 * so emitting both ensures coverage for single-syllable words (run/stop) and
 * multi-syllable words with an unstressed final syllable (happen/open). The
 * simple form for a single-syllable word (e.g. "runing") never appears in real
 * sentences, so the extra pattern is completely harmless.
 */
function buildWordForms(word: string): string[] {
  const lower = word.toLowerCase();
  const forms = new Set<string>([lower]);
  const vowels = 'aeiou';
  const len = lower.length;
  const last = len >= 1 ? lower[len - 1] : '';
  const penult = len >= 2 ? lower[len - 2] : '';
  const antepenult = len >= 3 ? lower[len - 3] : '';

  // ─── -ing forms (gerund / present participle) ───
  if (lower.endsWith('ie')) {
    // tie → tying
    forms.add(lower.slice(0, -2) + 'ying');
  } else if (
    lower.endsWith('e') &&
    !lower.endsWith('ee') &&
    !lower.endsWith('oe') &&
    !lower.endsWith('ye')
  ) {
    // dance → dancing, make → making (drop silent -e)
    forms.add(lower.slice(0, -1) + 'ing');
  } else if (
    len >= 3 &&
    !vowels.includes(last) &&
    vowels.includes(penult) &&
    !vowels.includes(antepenult) &&
    !['w', 'x', 'y'].includes(last)
  ) {
    // CVC pattern: doubled form for stressed-final-syllable words (run → running,
    // begin → beginning) plus simple form for multi-syllable unstressed words
    // (happen → happening). Both are emitted; invalid forms never match sentences.
    forms.add(lower + last + 'ing');
    forms.add(lower + 'ing');
  } else {
    // walk → walking
    forms.add(lower + 'ing');
  }

  // ─── -ed forms (simple past / past participle) ───
  if (lower.endsWith('e')) {
    // dance → danced (add only -d)
    forms.add(lower + 'd');
  } else if (
    len >= 3 &&
    !vowels.includes(last) &&
    vowels.includes(penult) &&
    !vowels.includes(antepenult) &&
    !['w', 'x', 'y'].includes(last)
  ) {
    // CVC pattern: doubled form (stop → stopped) plus simple form (happen →
    // happened). Invalid forms never match real sentences.
    forms.add(lower + last + 'ed');
    forms.add(lower + 'ed');
  } else if (lower.endsWith('y') && penult && !vowels.includes(penult)) {
    // carry → carried (y → ied when preceded by a consonant)
    forms.add(lower.slice(0, -1) + 'ied');
  } else {
    forms.add(lower + 'ed');
  }

  // ─── -s / -es forms (plural / 3rd-person singular) ───
  if (lower.endsWith('y') && penult && !vowels.includes(penult)) {
    // carry → carries
    forms.add(lower.slice(0, -1) + 'ies');
  } else if (
    lower.endsWith('s') ||
    lower.endsWith('x') ||
    lower.endsWith('z') ||
    lower.endsWith('ch') ||
    lower.endsWith('sh')
  ) {
    forms.add(lower + 'es');
  } else {
    forms.add(lower + 's');
  }

  return Array.from(forms);
}

/**
 * Build a regex that matches the word or any of its common inflected forms,
 * case-insensitively. Uses a single capture group so `$1` refers to the
 * matched text (preserving the original inflected form).
 */
function buildWordRegex(word: string): RegExp {
  const forms = buildWordForms(word);
  // Sort longest-first so more specific patterns take priority over shorter
  // overlapping ones, then join into a single alternation capture group.
  const escaped = forms
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

/** Replace the target word (and its common inflected forms) in a sentence with blanks. */
function blankWord(sentence: string, word: string): string {
  return sentence.replace(buildWordRegex(word), '_____');
}

type Phase = 'loading' | 'playing' | 'feedback' | 'finished';

interface RoundData {
  word: Word;
  sentence: string;
  blankedSentence: string;
  /** Shuffled display choices (word strings). */
  choices: string[];
}

export default function SentenceBlankPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [restartKey, setRestartKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_GAME_CONFIG.timer_seconds);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [savingScore, setSavingScore] = useState(false);

  const hasAnsweredRef = useRef(false);
  const wordResultsRef = useRef<{ word_id: string; answer_index: number | null; time_taken: number }[]>([]);

  const { data: gameData, isLoading: isLoadingGame, error: gameError } = useQuery({
    queryKey: ['sentence-blank-data', restartKey],
    queryFn: async () => {
      let resolvedConfig = DEFAULT_GAME_CONFIG;
      try {
        const { data: cfgData } = await supabase.from('game_config').select('*').eq('id', 1).single();
        if (cfgData) resolvedConfig = { ...DEFAULT_GAME_CONFIG, ...cfgData } as GameConfig;
      } catch { /* fall through */ }

      // Fetch all words with example sentences
      const { data: allWords, error } = await supabase
        .from('words')
        .select('id, word, correct_definition, distractors, example_sentences, difficulty');
      if (error) throw error;

      const wordsWithSentences = (allWords as Word[]).filter(
        (w) => w.example_sentences && w.example_sentences.length > 0,
      );
      if (wordsWithSentences.length < 4) {
        throw new Error('Not enough words with example sentences yet. Add some via the admin panel.');
      }

      const eligible = wordsWithSentences.filter(
        (w) => w.difficulty >= resolvedConfig.difficulty_min && w.difficulty <= resolvedConfig.difficulty_max,
      );
      const pool = eligible.length >= 4 ? eligible : wordsWithSentences;
      const gameWords = shuffleArray(pool).slice(0, resolvedConfig.word_count);

      // For each game word, build round data
      const rounds: RoundData[] = gameWords.map((w) => {
        const sentence = w.example_sentences[Math.floor(Math.random() * w.example_sentences.length)];
        const blanked = blankWord(sentence, w.word);

        // Distractor words: pick 3 random words from the same difficulty band (±2), excluding this word
        const band = pool.filter(
          (other) => other.id !== w.id && Math.abs(other.difficulty - w.difficulty) <= 2,
        );
        const distractorWords = shuffleArray(band.length >= 3 ? band : pool.filter(o => o.id !== w.id))
          .slice(0, 3)
          .map((d) => d.word);

        return {
          word: w,
          sentence,
          blankedSentence: blanked,
          choices: shuffleArray([w.word, ...distractorWords]),
        };
      });

      return { config: resolvedConfig, rounds };
    },
    enabled: !!user,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const config = gameData?.config ?? DEFAULT_GAME_CONFIG;
  const rounds = gameData?.rounds ?? [];
  const currentRound = rounds[currentIndex];

  const timerSecondsRef = useRef(DEFAULT_GAME_CONFIG.timer_seconds);
  useEffect(() => { timerSecondsRef.current = config.timer_seconds; }, [config.timer_seconds]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  const startRound = useCallback((index: number) => {
    setSelectedAnswer(null);
    setIsCorrect(null);
    setTimeLeft(timerSecondsRef.current);
    hasAnsweredRef.current = false;
    setPhase('playing');
  }, []);

  useEffect(() => {
    if (rounds.length > 0) {
      wordResultsRef.current = [];
      setCurrentIndex(0);
      setScore(0);
      startRound(0);
    }
  }, [rounds, startRound]);

  const handleAnswer = useCallback(
    (choice: string | null) => {
      if (phase !== 'playing' || hasAnsweredRef.current || !currentRound) return;
      hasAnsweredRef.current = true;

      const correct = choice !== null && choice.toLowerCase() === currentRound.word.word.toLowerCase();
      const choiceIndex = choice === null ? -1 : currentRound.choices.indexOf(choice);
      // answer_index: 0 = correct word position, else 1 based on position in choices
      const correctChoiceIndex = currentRound.choices.indexOf(currentRound.word.word);
      const answer_index: number | null =
        choice === null
          ? null
          : choiceIndex === correctChoiceIndex
          ? 0
          : choiceIndex >= 0
          ? choiceIndex + (choiceIndex >= correctChoiceIndex ? 0 : 1)
          : null;

      wordResultsRef.current.push({
        word_id: currentRound.word.id,
        answer_index,
        time_taken: timerSecondsRef.current - timeLeft,
      });

      setSelectedAnswer(choice ?? '__timeout__');
      setIsCorrect(correct);
      setPhase('feedback');

      if (correct) setScore((s) => s + 100 + timeLeft * 10);

      setTimeout(() => {
        const next = currentIndex + 1;
        if (next >= rounds.length) {
          setPhase('finished');
        } else {
          setCurrentIndex(next);
          startRound(next);
        }
      }, 1800);
    },
    [phase, currentRound, currentIndex, rounds.length, timeLeft, startRound],
  );

  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) { handleAnswer(null); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase, handleAnswer]);

  useEffect(() => {
    if (phase !== 'finished' || scoreSaved || !user) return;
    async function save() {
      setSavingScore(true);
      try {
        const maxScore = rounds.length * (100 + timerSecondsRef.current * 10);
        await supabase.rpc('submit_game_session', {
          p_user_id:   user!.id,
          p_score:     score,
          p_max_score: maxScore,
          p_words:     wordResultsRef.current,
          p_type:      'global',
          p_mode:      'sentence_blank',
        });
        setScoreSaved(true);
      } catch (err) {
        console.error('Failed to save:', err);
      } finally {
        setSavingScore(false);
      }
    }
    save();
  }, [phase, scoreSaved, user, score, rounds.length]);

  function restart() {
    wordResultsRef.current = [];
    setScore(0);
    setScoreSaved(false);
    setSavingScore(false);
    setPhase('loading');
    setRestartKey((k) => k + 1);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (authLoading || (isLoadingGame && phase === 'loading')) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (gameError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] gap-4 px-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-red-400 text-center max-w-sm">
          {gameError instanceof Error ? gameError.message : 'Failed to load game.'}
        </p>
        <Link href="/learn" className="text-violet-400 hover:underline text-sm">← Back to Learn</Link>
      </div>
    );
  }

  if (phase === 'finished') {
    const maxScore = rounds.length * (100 + config.timer_seconds * 10);
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 py-12">
        <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-3xl p-8 text-center space-y-6">
          <Trophy className="w-14 h-14 text-yellow-400 mx-auto drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]" />
          <div>
            <h2 className="text-3xl font-extrabold text-white">{score.toLocaleString()}</h2>
            <p className="text-gray-400 text-sm mt-1">{pct}% of max • {rounds.length} sentences</p>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          {savingScore && <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>}
          {scoreSaved && <p className="text-xs text-emerald-400">Score saved ✓</p>}
          <div className="flex gap-3 justify-center">
            <button onClick={restart} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              <RotateCcw className="w-4 h-4" /> Play Again
            </button>
            <Link href="/learn" className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              ← Learn Hub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!currentRound || phase === 'loading') {
    return <div className="flex items-center justify-center min-h-[calc(100vh-64px)]"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center px-4 py-8">
      {/* Score + progress */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-4 text-sm">
        <span className="text-gray-400">
          {currentIndex + 1} / {rounds.length}
        </span>
        <span className="text-violet-300 font-bold tabular-nums">{score.toLocaleString()} pts</span>
      </div>

      {/* Timer */}
      <div className="w-full max-w-2xl mb-6">
        <CountdownTimer
          key={`${restartKey}-${currentIndex}`}
          totalTime={config.timer_seconds}
          timeLeft={timeLeft}
        />
      </div>

      {/* Sentence card */}
      <div className="w-full max-w-2xl space-y-5">
        <div className="text-center py-8 px-6 bg-gray-800/60 border border-gray-700 rounded-3xl shadow-xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
            Which word fills the blank?
          </p>
          <p className="text-xl sm:text-2xl font-semibold text-white leading-relaxed">
            {phase === 'feedback'
              ? currentRound.sentence.replace(
                  buildWordRegex(currentRound.word.word),
                  `**$1**`,
                ).split(/\*\*/).map((part, i) =>
                  i % 2 === 1
                    ? <span key={i} className="text-emerald-300 font-extrabold">{part}</span>
                    : <span key={i}>{part}</span>
                )
              : currentRound.blankedSentence}
          </p>
        </div>

        {/* Choices */}
        <div className="grid grid-cols-2 gap-3">
          {currentRound.choices.map((choice, i) => {
            const isSelected = selectedAnswer === choice;
            const isCorrectChoice = choice.toLowerCase() === currentRound.word.word.toLowerCase();
            let cls = 'w-full text-left px-5 py-4 rounded-2xl border-2 text-sm sm:text-base font-medium transition-all duration-200 ';
            if (selectedAnswer === null) {
              cls += 'border-gray-700 bg-gray-800 text-gray-200 hover:border-violet-500 hover:bg-gray-700 hover:scale-[1.01] active:scale-100 cursor-pointer';
            } else if (isCorrectChoice) {
              cls += 'border-emerald-500 bg-emerald-950 text-emerald-300 animate-pop';
            } else if (isSelected && !isCorrect) {
              cls += 'border-red-500 bg-red-950 text-red-300 animate-shake';
            } else {
              cls += 'border-gray-800 bg-gray-900/50 text-gray-600 cursor-not-allowed';
            }
            return (
              <button key={i} className={cls} onClick={() => selectedAnswer === null && handleAnswer(choice)} disabled={selectedAnswer !== null}>
                <span className="inline-flex items-center gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {choice}
                </span>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {phase === 'feedback' && (
          <div className={`rounded-2xl border px-5 py-3 text-sm font-medium ${isCorrect ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-red-700 bg-red-950/40 text-red-300'}`}>
            {isCorrect
              ? `✓ Correct! +${100 + timeLeft * 10} pts`
              : `✗ The answer was "${currentRound.word.word}" — ${currentRound.word.correct_definition}`}
          </div>
        )}
      </div>
    </div>
  );
}
