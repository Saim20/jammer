'use client';

import React from 'react';
import { BookOpen, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';

// ── Tab type ──────────────────────────────────────────────────────────────────

export type Tab = 'words' | 'add' | 'csv' | 'sets' | 'settings' | 'users' | 'agent';

// ── Word draft ────────────────────────────────────────────────────────────────

export interface WordDraft {
  word: string;
  correctDefinition: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  exampleSentence1: string;
  exampleSentence2: string;
  exampleSentence3: string;
  difficulty: number;
  set_id: string;
}

export const EMPTY_DRAFT: WordDraft = {
  word: '',
  correctDefinition: '',
  distractor1: '',
  distractor2: '',
  distractor3: '',
  exampleSentence1: '',
  exampleSentence2: '',
  exampleSentence3: '',
  difficulty: 5,
  set_id: '',
};

// ── CSV row ───────────────────────────────────────────────────────────────────

export interface CSVRow {
  word: string;
  correctDefinition: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  exampleSentence1: string;
  exampleSentence2: string;
  exampleSentence3: string;
  difficulty: number;
  set_name: string;
  _valid: boolean;
  _error?: string;
}

// ── Pure utilities ────────────────────────────────────────────────────────────

export function validateDraft(d: WordDraft): string | null {
  if (!d.word.trim()) return 'Word is required.';
  if (!d.correctDefinition.trim()) return 'Correct definition is required.';
  if (!d.distractor1.trim() || !d.distractor2.trim() || !d.distractor3.trim())
    return 'All three distractors are required.';
  if (d.difficulty < 1 || d.difficulty > 10) return 'Difficulty must be between 1 and 10.';
  return null;
}

export function draftToRow(d: WordDraft) {
  return {
    word: d.word.trim(),
    correct_definition: d.correctDefinition.trim(),
    distractors: [d.distractor1.trim(), d.distractor2.trim(), d.distractor3.trim()],
    example_sentences: [d.exampleSentence1, d.exampleSentence2, d.exampleSentence3]
      .map((s) => s.trim())
      .filter(Boolean),
    difficulty: d.difficulty,
    set_id: d.set_id || null,
  };
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

export const inputCls =
  'w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 mt-1';

// ── Shared React components ───────────────────────────────────────────────────

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-400 mb-0.5">{children}</label>;
}

export function DifficultyBadge({ value, small }: { value: number; small?: boolean }) {
  const color =
    value <= 3
      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
      : value <= 6
        ? 'bg-yellow-900/60 text-yellow-300 border-yellow-700'
        : 'bg-red-900/60 text-red-300 border-red-700';
  return (
    <span
      className={`inline-flex items-center border rounded-lg font-medium ${small ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2.5 py-1'} ${color}`}
    >
      {value}
    </span>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    free: 'bg-gray-800 text-gray-400 border-gray-700',
    student: 'bg-blue-950 text-blue-300 border-blue-700',
    pro: 'bg-violet-950 text-violet-300 border-violet-700',
  };
  return (
    <span
      className={`inline-flex items-center border rounded-md text-xs px-2 py-0.5 font-medium ${styles[plan] ?? styles.free}`}
    >
      {plan}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role !== 'admin') return null;
  return (
    <span className="inline-flex items-center border rounded-md text-xs px-2 py-0.5 font-medium bg-amber-950 text-amber-300 border-amber-700">
      admin
    </span>
  );
}

export function SortHeader<F extends string>({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: F;
  current: F;
  dir: 'asc' | 'desc';
  onSort: (f: F) => void;
}) {
  const active = current === field;
  return (
    <th
      className="px-4 py-3 text-left text-gray-400 font-medium cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="flex flex-col">
          <ChevronUp className={`w-3 h-3 -mb-0.5 ${active && dir === 'asc' ? 'text-violet-400' : 'text-gray-700'}`} />
          <ChevronDown className={`w-3 h-3 ${active && dir === 'desc' ? 'text-violet-400' : 'text-gray-700'}`} />
        </span>
      </span>
    </th>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-gray-500 border border-dashed border-gray-800 rounded-2xl">
      <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-700" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function TabSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
    </div>
  );
}
