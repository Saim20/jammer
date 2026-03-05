'use client';

import type { Word } from '@/types';

interface GameBoardProps {
  word: Word;
  choices: string[];
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  onSelect: (choice: string) => void;
  currentIndex: number;
  totalWords: number;
}

export default function GameBoard({
  word,
  choices,
  selectedAnswer,
  isCorrect,
  onSelect,
  currentIndex,
  totalWords,
}: GameBoardProps) {
  function getButtonClass(choice: string): string {
    const base =
      'w-full text-left px-5 py-4 rounded-2xl border-2 text-sm sm:text-base font-medium transition-all duration-200 ';

    // Before any answer: interactive hover styles
    if (selectedAnswer === null) {
      return (
        base +
        'border-gray-700 bg-gray-800 text-gray-200 ' +
        'hover:border-violet-500 hover:bg-gray-700 hover:scale-[1.01] ' +
        'active:scale-100 cursor-pointer'
      );
    }

    // Feedback: always highlight the correct answer green
    if (choice === word.correct_definition) {
      return base + 'border-emerald-500 bg-emerald-950 text-emerald-300 animate-pop';
    }

    // Highlight the wrong choice the user picked in red + shake
    if (choice === selectedAnswer && !isCorrect) {
      return base + 'border-red-500 bg-red-950 text-red-300 animate-shake';
    }

    // All other options: dim out
    return base + 'border-gray-800 bg-gray-900/50 text-gray-600 cursor-not-allowed';
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Progress pips */}
      <div className="flex items-center justify-between text-xs text-gray-500 uppercase tracking-wide">
        <span>
          Word {currentIndex + 1} / {totalWords}
        </span>
        <div className="flex gap-1.5">
          {Array.from({ length: totalWords }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-7 rounded-full transition-colors ${
                i < currentIndex
                  ? 'bg-violet-600'
                  : i === currentIndex
                    ? 'bg-violet-300'
                    : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Word card */}
      <div className="text-center py-10 px-6 bg-gray-800/60 border border-gray-700 rounded-3xl shadow-xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
          What does this word mean?
        </p>
        <h2 className="text-5xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
          {word.word}
        </h2>
        {/* Difficulty dots */}
        <div className="mt-4 flex justify-center gap-1" title={`Difficulty: ${word.difficulty}/10`}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i < word.difficulty ? 'bg-violet-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Answer options */}
      <div className="grid grid-cols-1 gap-3">
        {choices.map((choice, i) => (
          <button
            key={i}
            className={getButtonClass(choice)}
            onClick={() => selectedAnswer === null && onSelect(choice)}
            disabled={selectedAnswer !== null}
          >
            <span className="inline-flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 mt-0.5">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{choice}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
