'use client';

import { useState, useEffect } from 'react';
import type { Word } from '@/types';
import { CATEGORY_META, difficultyToCategory } from '@/types';

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

interface Props {
  word: Word;
  currentIndex: number;
  totalWords: number;
  /** Called after the user rates the card. Parent handles navigation. */
  onRate: (quality: ReviewQuality) => void;
  /** Optional: skip (no rating) to next card. */
  onSkip?: () => void;
  /** Optional: show context label (e.g. "Review" or "New"). */
  mode?: 'learn' | 'review' | 'missed';
  /** SM-2 quality from the last review session (0–5), if available. */
  lastQuality?: number | null;
}

const RATINGS: { quality: ReviewQuality; label: string; sublabel: string; key: string; color: string }[] = [
  { quality: 1, label: 'Again',  sublabel: 'forgot',        key: '1', color: 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30' },
  { quality: 3, label: 'Hard',   sublabel: 'struggled',     key: '2', color: 'bg-orange-500/20 border-orange-500/50 text-orange-300 hover:bg-orange-500/30' },
  { quality: 4, label: 'Good',   sublabel: 'hesitated',     key: '3', color: 'bg-blue-500/20 border-blue-500/50 text-blue-300 hover:bg-blue-500/30' },
  { quality: 5, label: 'Easy',   sublabel: 'instant',       key: '4', color: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30' },
];

export default function FlashCard({ word, currentIndex, totalWords, onRate, onSkip, mode, lastQuality }: Props) {
  const [flipped, setFlipped] = useState(false);

  const categoryMeta = CATEGORY_META[difficultyToCategory(word.difficulty)];

  // Keyboard shortcuts: Space/Enter = toggle flip, 1–4 = rate when showing back
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore when focus is inside an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped) {
        const rating = RATINGS.find((r) => r.key === e.key);
        if (rating) {
          e.preventDefault();
          handleRate(rating.quality);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  function handleRate(quality: ReviewQuality) {
    setFlipped(false);
    // Small delay so the flip-back animation plays before parent removes the card
    setTimeout(() => onRate(quality), 150);
  }

  function handleFlipBack(e: React.MouseEvent) {
    e.stopPropagation();
    setFlipped(false);
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalWords) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 shrink-0 tabular-nums">
          {currentIndex + 1} / {totalWords}
        </span>
      </div>

      {/* Flip card */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: '1200px' }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '280px',
          }}
        >
          {/* ── Front (word) ─────────────────────────────────────── */}
          <div
            className="absolute inset-0 rounded-2xl border border-gray-700 bg-gray-900 flex flex-col items-center justify-center p-8 gap-4 backface-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {mode && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  mode === 'review' ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' :
                  mode === 'missed' ? 'border-red-500/50 text-red-300 bg-red-500/10' :
                  'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                }`}>
                  {mode === 'review' ? '🔄 Review' : mode === 'missed' ? '🎯 Practice' : '✨ New'}
                </span>
              )}
              {categoryMeta && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-gray-600 text-gray-400 bg-gray-800">
                  {categoryMeta.emoji} {categoryMeta.label} ({categoryMeta.difficultyRange})
                </span>
              )}
              {/* Difficulty dots */}
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < word.difficulty
                        ? word.difficulty <= 3 ? 'bg-emerald-400' :
                          word.difficulty <= 6 ? 'bg-yellow-400' : 'bg-red-400'
                        : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Word */}
            <h2 className="text-4xl sm:text-5xl font-extrabold text-center bg-linear-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent leading-tight">
              {word.word}
            </h2>

            {/* Tap hint + last quality */}
            <div className="flex items-center gap-3 mt-2">
              <p className="text-sm text-gray-600 animate-pulse">tap to reveal →</p>
              {lastQuality != null && (
                <span
                  title={`Previous rating: ${lastQuality >= 5 ? 'Easy' : lastQuality >= 4 ? 'Good' : lastQuality >= 3 ? 'Hard' : 'Again'}`}
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    lastQuality >= 5 ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10' :
                    lastQuality >= 4 ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' :
                    lastQuality >= 3 ? 'border-orange-500/50 text-orange-300 bg-orange-500/10' :
                    'border-red-500/50 text-red-300 bg-red-500/10'
                  }`}
                >
                  Last: {lastQuality >= 5 ? 'Easy' : lastQuality >= 4 ? 'Good' : lastQuality >= 3 ? 'Hard' : 'Again'}
                </span>
              )}
            </div>
          </div>

          {/* ── Back (definition) ────────────────────────────────── */}
          <div
            className="absolute inset-0 rounded-2xl border border-violet-700/50 bg-gray-900 flex flex-col items-start justify-center p-8 gap-5 backface-hidden overflow-y-auto"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div>
              <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-2">Definition</p>
              <p className="text-xl text-gray-100 font-medium leading-relaxed">{word.correct_definition}</p>
            </div>

            <div>
              <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest mb-2">Distractors</p>
              <ul className="flex flex-col gap-1.5">
                {word.distractors.map((d, i) => (
                  <li key={i} className="text-sm text-gray-500 flex items-start gap-2">
                    <span className="text-gray-700 shrink-0">✗</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-gray-600 mt-1 animate-pulse self-center">tap to flip back ↩</p>
          </div>
        </div>
      </div>

      {/* Rating buttons (visible only after flip) */}
      {flipped ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            {RATINGS.map(({ quality, label, sublabel, key, color }) => (
              <button
                key={quality}
                onClick={() => handleRate(quality)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-sm font-semibold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-violet-500 ${color}`}
              >
                <span>{label}</span>
                <span className="text-xs font-normal opacity-70">{sublabel}</span>
                <span className="text-[10px] font-mono opacity-40 mt-0.5">[{key}]</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFlipBack}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-750 text-gray-400 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              ↩ Flip back <span className="font-mono text-gray-600">[Space]</span>
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="flex-1 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1"
              >
                skip →
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setFlipped(true)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-750 text-gray-300 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Show Answer <span className="text-xs font-mono text-gray-600 ml-1">[Space]</span>
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors py-1"
            >
              skip →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
