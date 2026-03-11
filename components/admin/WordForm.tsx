'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import type { FlashcardSet } from '@/types';
import { CATEGORY_META, difficultyToCategory } from '@/types';
import { WordDraft, Label, inputCls, DifficultyBadge } from './shared';

interface WordFormProps {
  draft: WordDraft;
  onChange: (d: WordDraft) => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  submitIcon: React.ReactNode;
  sets: FlashcardSet[];
}

export default function WordForm({
  draft,
  onChange,
  onSubmit,
  saving,
  error,
  submitLabel,
  submitIcon,
  sets,
}: WordFormProps) {
  function field(key: keyof WordDraft, value: string | number) {
    onChange({ ...draft, [key]: value });
  }

  const derivedCategory = difficultyToCategory(draft.difficulty);
  const filteredSets = sets.filter((s) => s.category === derivedCategory);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Word</Label>
          <input
            type="text"
            value={draft.word}
            onChange={(e) => field('word', e.target.value)}
            placeholder="e.g. Ephemeral"
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <Label>Correct Definition</Label>
          <textarea
            value={draft.correctDefinition}
            onChange={(e) => field('correctDefinition', e.target.value)}
            placeholder="The true meaning of the word…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>Distractor 1</Label>
          <textarea
            value={draft.distractor1}
            onChange={(e) => field('distractor1', e.target.value)}
            placeholder="Wrong answer option 1…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>Distractor 2</Label>
          <textarea
            value={draft.distractor2}
            onChange={(e) => field('distractor2', e.target.value)}
            placeholder="Wrong answer option 2…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>Distractor 3</Label>
          <textarea
            value={draft.distractor3}
            onChange={(e) => field('distractor3', e.target.value)}
            placeholder="Wrong answer option 3…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>
            Example Sentence 1{' '}
            <span className="text-gray-600 font-normal">(optional)</span>
          </Label>
          <textarea
            value={draft.exampleSentence1}
            onChange={(e) => field('exampleSentence1', e.target.value)}
            placeholder="e.g. The ephemeral beauty of cherry blossoms…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>
            Example Sentence 2{' '}
            <span className="text-gray-600 font-normal">(optional)</span>
          </Label>
          <textarea
            value={draft.exampleSentence2}
            onChange={(e) => field('exampleSentence2', e.target.value)}
            placeholder="e.g. Her fame proved ephemeral, fading within a year…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div className="col-span-2">
          <Label>
            Example Sentence 3{' '}
            <span className="text-gray-600 font-normal">(optional)</span>
          </Label>
          <textarea
            value={draft.exampleSentence3}
            onChange={(e) => field('exampleSentence3', e.target.value)}
            placeholder="A third example in context…"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <Label>Difficulty (1–10)</Label>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.difficulty}
            onChange={(e) => {
              const newDiff = Math.min(10, Math.max(1, Number(e.target.value)));
              const newCat = difficultyToCategory(newDiff);
              const oldCat = difficultyToCategory(draft.difficulty);
              onChange({ ...draft, difficulty: newDiff, set_id: newCat !== oldCat ? '' : draft.set_id });
            }}
            className={inputCls}
          />
        </div>
        <div className="flex pb-0.5 flex-col gap-1 items-start justify-end">
          <DifficultyBadge value={draft.difficulty} />
          <span className="text-xs text-gray-500">
            → {CATEGORY_META[derivedCategory].emoji} {CATEGORY_META[derivedCategory].label}
          </span>
        </div>
        <div className="col-span-2">
          <Label>
            Flashcard Set{' '}
            <span className="text-gray-600 font-normal">
              (optional — {CATEGORY_META[derivedCategory].label} sets shown)
            </span>
          </Label>
          <select value={draft.set_id} onChange={(e) => field('set_id', e.target.value)} className={inputCls}>
            <option value="">— none —</option>
            {filteredSets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={saving}
        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors w-full justify-center"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : submitIcon}
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}
