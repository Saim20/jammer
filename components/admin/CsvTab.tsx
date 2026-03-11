'use client';

import { useState, useRef } from 'react';
import { Upload, Download, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, FlashcardSet } from '@/types';
import { difficultyToCategory } from '@/types';
import { DifficultyBadge, CSVRow } from './shared';
import { fetchEmbeddings, storeEmbedding, embedText, EMBED_BATCH_SIZE } from './embedHelpers';

// ── CSV helpers (only used here) ──────────────────────────────────────────────

const CSV_TEMPLATE =
  'word,correctDefinition,distractor1,distractor2,distractor3,difficulty,set_name,exampleSentence1,exampleSentence2,exampleSentence3\n' +
  'Ephemeral,"Lasting for a very short time","Having a glowing quality","A deep philosophical thought","Showing warlike attitude",9,"Literary Devices","The ephemeral beauty of cherry blossoms makes them all the more precious.","Her fame proved ephemeral, fading within a year.",""\n';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const [word, correctDefinition, distractor1, distractor2, distractor3, diffStr, setNameStr, ex1, ex2, ex3] = cols;
    const difficulty = parseInt(diffStr ?? '', 10);
    const missing: string[] = [];
    if (!word) missing.push('word');
    if (!correctDefinition) missing.push('correctDefinition');
    if (!distractor1) missing.push('distractor1');
    if (!distractor2) missing.push('distractor2');
    if (!distractor3) missing.push('distractor3');
    const diffValid = !isNaN(difficulty) && difficulty >= 1 && difficulty <= 10;
    if (!diffValid) missing.push('difficulty (1–10)');
    const _valid = missing.length === 0;
    return {
      word: word ?? '', correctDefinition: correctDefinition ?? '',
      distractor1: distractor1 ?? '', distractor2: distractor2 ?? '', distractor3: distractor3 ?? '',
      exampleSentence1: (ex1 ?? '').trim(), exampleSentence2: (ex2 ?? '').trim(), exampleSentence3: (ex3 ?? '').trim(),
      difficulty: diffValid ? difficulty : 5,
      set_name: (setNameStr ?? '').trim(),
      _valid,
      _error: _valid ? undefined : `Missing/invalid: ${missing.join(', ')}`,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CsvTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sets = [] } = useQuery({
    queryKey: ['admin-sets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flashcard_sets').select('*').order('category').order('display_order');
      if (error) throw error;
      return (data ?? []) as FlashcardSet[];
    },
    enabled: !!user && !!isAdmin,
  });

  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ added: number; failed: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [embedStatus, setEmbedStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvResult(null);
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvError('No data rows found. Make sure the file has a header row and at least one data row.');
        setCsvRows([]);
      } else {
        setCsvRows(rows);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleCSVImport() {
    const validRows = csvRows.filter((r) => r._valid);
    if (validRows.length === 0) return;
    setCsvImporting(true);
    setCsvResult(null);
    setEmbedStatus('idle');
    setEmbedProgress(null);
    let added = 0;
    let failed = 0;
    const inserted: { id: string; word: string; correct_definition: string }[] = [];
    const setCache = new Map<string, string>(sets.map((s) => [s.name, s.id]));

    for (const row of validRows) {
      try {
        let resolvedSetId: string | null = null;
        if (row.set_name) {
          if (setCache.has(row.set_name)) {
            resolvedSetId = setCache.get(row.set_name)!;
          } else {
            const { data: existingSet } = await supabase.from('flashcard_sets').select('id').eq('name', row.set_name).maybeSingle();
            if (existingSet) {
              resolvedSetId = existingSet.id;
            } else {
              const inferredCat = difficultyToCategory(row.difficulty);
              const { data: newSet, error: setErr } = await supabase
                .from('flashcard_sets').insert({ name: row.set_name, category: inferredCat, display_order: 0 }).select().single();
              if (!setErr && newSet) {
                resolvedSetId = (newSet as FlashcardSet).id;
                queryClient.setQueryData(['admin-sets'], (prev: FlashcardSet[]) => [...(prev ?? []), newSet as FlashcardSet]);
              }
            }
            if (resolvedSetId) setCache.set(row.set_name, resolvedSetId);
          }
        }
        const { data, error } = await supabase.from('words').insert({
          word: row.word, correct_definition: row.correctDefinition,
          distractors: [row.distractor1, row.distractor2, row.distractor3],
          example_sentences: [row.exampleSentence1, row.exampleSentence2, row.exampleSentence3].filter(Boolean),
          difficulty: row.difficulty, set_id: resolvedSetId,
        }).select().single();
        if (error) throw error;
        queryClient.setQueryData(['admin-words'], (prev: Word[]) =>
          [...(prev ?? []), data as Word].sort((a, b) => a.word.localeCompare(b.word)),
        );
        inserted.push({ id: (data as Word).id, word: row.word, correct_definition: row.correctDefinition });
        added++;
      } catch { failed++; }
    }
    setCsvResult({ added, failed });
    setCsvImporting(false);
    setCsvRows([]);
    setCsvFileName('');

    if (inserted.length > 0) {
      setEmbedStatus('generating');
      setEmbedProgress({ done: 0, total: inserted.length });
      let embeddedCount = 0;
      for (let i = 0; i < inserted.length; i += EMBED_BATCH_SIZE) {
        const batch = inserted.slice(i, i + EMBED_BATCH_SIZE);
        const texts = batch.map((w) => embedText(w.word, w.correct_definition));
        const embeddings = await fetchEmbeddings(texts);
        if (embeddings) {
          for (let j = 0; j < batch.length; j++) {
            if (embeddings[j]) { await storeEmbedding(batch[j].id, embeddings[j]); embeddedCount++; }
          }
        }
        setEmbedProgress({ done: i + batch.length, total: inserted.length });
      }
      setEmbedStatus(embeddedCount > 0 ? 'done' : 'error');
      setTimeout(() => { setEmbedStatus('idle'); setEmbedProgress(null); }, 5000);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vocab-jam-words-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="text-sm text-gray-300 font-medium">Upload a CSV file to bulk-import words.</p>
          <p className="text-xs text-gray-500">
            Required: <code className="text-violet-400">word, correctDefinition, distractor1–3, difficulty</code><br />
            Optional: <code className="text-violet-400">set_name, exampleSentence1–3</code>
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Download className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-violet-500 rounded-2xl px-8 py-12 text-center cursor-pointer transition-colors group"
      >
        <Upload className="w-10 h-10 text-gray-600 group-hover:text-violet-400 mx-auto mb-3 transition-colors" />
        <p className="text-gray-400 text-sm">
          {csvFileName ? (
            <span className="text-violet-300 font-medium">{csvFileName}</span>
          ) : <>Click to select a <strong className="text-white">CSV file</strong></>}
        </p>
        <p className="text-gray-600 text-xs mt-1">UTF-8 encoded, .csv</p>
      </div>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />

      {csvError && (
        <div className="flex items-start gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{csvError}
        </div>
      )}
      {csvResult && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
          <Check className="w-4 h-4 shrink-0" />
          Import complete — {csvResult.added} added
          {csvResult.failed > 0 && <span className="text-red-400">, {csvResult.failed} failed</span>}
        </div>
      )}
      {embedStatus !== 'idle' && (
        <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${embedStatus === 'generating' ? 'text-violet-300 bg-violet-950/40 border-violet-800' : embedStatus === 'done' ? 'text-emerald-400 bg-emerald-950 border-emerald-800' : 'text-amber-400 bg-amber-950/40 border-amber-800'}`}>
          {embedStatus === 'generating' ? (
            <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Generating embeddings{embedProgress ? ` (${embedProgress.done}/${embedProgress.total})` : ''}&hellip;</>
          ) : embedStatus === 'done' ? (
            <><Check className="w-4 h-4 shrink-0" /> Embeddings stored — all words searchable via vector search.</>
          ) : (
            <><AlertCircle className="w-4 h-4 shrink-0" /> Embeddings skipped — words saved. Is <code className="text-amber-300">GEMINI_API_KEY</code> set?</>
          )}
        </div>
      )}

      {/* Preview */}
      {csvRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-white">
              Preview — <span className="text-emerald-400">{csvRows.filter((r) => r._valid).length} valid</span>
              {csvRows.some((r) => !r._valid) && (
                <span className="text-red-400">, {csvRows.filter((r) => !r._valid).length} invalid</span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setCsvRows([]); setCsvFileName(''); setCsvError(null); }}
                className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1 rounded-lg transition-colors"
              >Clear</button>
              <button
                onClick={handleCSVImport}
                disabled={csvImporting || csvRows.filter((r) => r._valid).length === 0}
                className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {csvImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Import {csvRows.filter((r) => r._valid).length} Words
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/60">
                  <th className="px-3 py-2.5 text-left text-gray-400 font-medium w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-gray-400 font-medium">Word</th>
                  <th className="px-3 py-2.5 text-left text-gray-400 font-medium hidden sm:table-cell">Definition</th>
                  <th className="px-3 py-2.5 text-left text-gray-400 font-medium">Diff.</th>
                  <th className="px-3 py-2.5 text-left text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {csvRows.map((row, i) => (
                  <tr key={i} className={row._valid ? '' : 'bg-red-950/20'}>
                    <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-white">{row.word || <span className="text-red-400 italic">empty</span>}</td>
                    <td className="px-3 py-2 text-gray-400 max-w-50 truncate hidden sm:table-cell">
                      {row.correctDefinition || <span className="text-red-400 italic">empty</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row._valid ? <DifficultyBadge value={row.difficulty} small /> : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row._valid ? (
                        <span className="flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> Valid</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400" title={row._error}><X className="w-3 h-3" /> {row._error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
