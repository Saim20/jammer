'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Pencil,
  Upload,
  BookOpen,
  X,
  Check,
  AlertCircle,
  Download,
  Search,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
  Timer,
  Hash,
  Gauge,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Word, GameConfig, FlashcardSet, WordCategory } from '@/types';
import { DEFAULT_GAME_CONFIG, CATEGORY_META, WORD_CATEGORIES } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'words' | 'add' | 'csv' | 'sets' | 'settings';

interface WordDraft {
  word: string;
  correctDefinition: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  difficulty: number;
  category: WordCategory | '';
  set_id: string;
}

const EMPTY_DRAFT: WordDraft = {
  word: '',
  correctDefinition: '',
  distractor1: '',
  distractor2: '',
  distractor3: '',
  difficulty: 5,
  category: '',
  set_id: '',
};

interface CSVRow {
  word: string;
  correctDefinition: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  difficulty: number;
  category: WordCategory | '';
  set_name: string;
  _valid: boolean;
  _error?: string;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): CSVRow[] {
  const lines = text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  // Accept headers case-insensitively, ignore header row
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const [word, correctDefinition, distractor1, distractor2, distractor3, diffStr, categoryStr, setNameStr] = cols;
    const difficulty = parseInt(diffStr ?? '', 10);
    const category = (categoryStr ?? '').trim().toLowerCase() as WordCategory | '';

    const missing: string[] = [];
    if (!word) missing.push('word');
    if (!correctDefinition) missing.push('correctDefinition');
    if (!distractor1) missing.push('distractor1');
    if (!distractor2) missing.push('distractor2');
    if (!distractor3) missing.push('distractor3');

    const diffValid = !isNaN(difficulty) && difficulty >= 1 && difficulty <= 10;
    if (!diffValid) missing.push('difficulty (1–10)');

    // category is optional but must be valid if provided
    if (category && !(WORD_CATEGORIES as string[]).includes(category)) {
      missing.push(`category must be one of: ${WORD_CATEGORIES.join(', ')}`);
    }

    const _valid = missing.length === 0;
    return {
      word: word ?? '',
      correctDefinition: correctDefinition ?? '',
      distractor1: distractor1 ?? '',
      distractor2: distractor2 ?? '',
      distractor3: distractor3 ?? '',
      difficulty: diffValid ? difficulty : 5,
      category: (category && (WORD_CATEGORIES as string[]).includes(category) ? category : '') as WordCategory | '',
      set_name: (setNameStr ?? '').trim(),
      _valid,
      _error: _valid ? undefined : `Missing/invalid: ${missing.join(', ')}`,
    };
  });
}

function draftToRow(d: WordDraft) {
  return {
    word: d.word.trim(),
    correct_definition: d.correctDefinition.trim(),
    distractors: [d.distractor1.trim(), d.distractor2.trim(), d.distractor3.trim()],
    difficulty: d.difficulty,
    category: d.category || null,
    set_id: d.set_id || null,
  };
}

const CSV_TEMPLATE =
  'word,correctDefinition,distractor1,distractor2,distractor3,difficulty,category,set_name\n' +
  'Ephemeral,"Lasting for a very short time","Having a glowing quality","A deep philosophical thought","Showing warlike attitude",6,eloquent,"Literary Devices"\n';

// ── Embedding helpers ─────────────────────────────────────────────────────────
// These are module-level (no component state) so they can be called anywhere.

const EMBED_BATCH_SIZE = 100; // Gemini batchEmbedContents maximum

function embedText(word: string, definition: string): string {
  return `word: ${word}. definition: ${definition}`;
}

/**
 * Calls the /api/embed server proxy (keeps GEMINI_API_KEY out of the browser).
 * Returns null if the key isn't configured (503) or on any error — callers
 * should treat null as "skip silently" rather than surfacing an error.
 */
async function fetchEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (res.status === 503) return null; // key not configured — silent skip
    if (!res.ok) return null;
    const { embeddings } = await res.json() as { embeddings: number[][] };
    return embeddings ?? null;
  } catch {
    return null;
  }
}

/** Stores a single L2-normalised embedding vector into the words table. */
async function storeEmbedding(id: string, embedding: number[]): Promise<void> {
  await supabase
    .from('words')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', id);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, profile, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('words');

  // ── words list state ──────────────────────────────────────────────────────
  const [words, setWords] = useState<Word[]>([]);
  const [loadingWords, setLoadingWords] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'word' | 'difficulty'>('word');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── edit modal state ──────────────────────────────────────────────────────
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editDraft, setEditDraft] = useState<WordDraft>(EMPTY_DRAFT);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── delete confirm state ──────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── add word state ────────────────────────────────────────────────────────
  const [addDraft, setAddDraft] = useState<WordDraft>(EMPTY_DRAFT);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // ── CSV state ─────────────────────────────────────────────────────────────
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ added: number; failed: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Embedding status ──────────────────────────────────────────────────────
  const [addEmbedStatus, setAddEmbedStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [csvEmbedStatus, setCsvEmbedStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [csvEmbedProgress, setCsvEmbedProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Game config state ─────────────────────────────────────────────────────
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // ── Sets state ────────────────────────────────────────────────────────────
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setDraft, setSetDraft] = useState<{ name: string; description: string; category: WordCategory | ''; display_order: number }>({
    name: '', description: '', category: '', display_order: 0,
  });
  const [setSaving, setSetSaving] = useState(false);
  const [setError, setSetError] = useState<string | null>(null);
  const [setSuccess, setSetSuccess] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) router.replace('/');
  }, [user, authLoading, isAdmin, router]);

  // ── Fetch words ───────────────────────────────────────────────────────────
  const fetchWords = useCallback(async () => {
    setLoadingWords(true);
    try {
      const { data, error } = await supabase
        .from('words')
        .select('id, word, correct_definition, distractors, difficulty, category, set_id, created_at, updated_at')
        .order('word');
      if (error) throw error;
      setWords((data ?? []) as Word[]);
    } catch (err) {
      console.error('Failed to fetch words:', err);
    } finally {
      setLoadingWords(false);
    }
  }, []);

  // ── Fetch sets ────────────────────────────────────────────────────────────
  const fetchSets = useCallback(async () => {
    setSetsLoading(true);
    try {
      const { data, error } = await supabase
        .from('flashcard_sets')
        .select('*')
        .order('category')
        .order('display_order');
      if (error) throw error;
      setSets((data ?? []) as FlashcardSet[]);
    } catch (err) {
      console.error('Failed to fetch sets:', err);
    } finally {
      setSetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchWords();
      fetchSets();
    }
  }, [user, isAdmin, fetchWords, fetchSets]);

  // ── Fetch game config ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isAdmin) return;
    async function fetchConfig() {
      setConfigLoading(true);
      try {
        const { data, error } = await supabase
          .from('game_config')
          .select('*')
          .eq('id', 1)
          .single();
        if (!error && data) {
          setConfig({ ...DEFAULT_GAME_CONFIG, ...(data as GameConfig) });
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setConfigLoading(false);
      }
    }
    fetchConfig();
  }, [user, isAdmin]);

  async function saveConfig() {
    setConfigSaving(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      const { error } = await supabase
        .from('game_config')
        .upsert({ id: 1, ...config });
      if (error) throw error;
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setConfigError('Failed to save settings. Check your connection.');
    } finally {
      setConfigSaving(false);
    }
  }

  // ── Filtered / sorted words ───────────────────────────────────────────────
  const displayedWords = words
    .filter((w) => w.word.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const valA = sortField === 'word' ? a.word.toLowerCase() : a.difficulty;
      const valB = sortField === 'word' ? b.word.toLowerCase() : b.difficulty;
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  function toggleSort(field: 'word' | 'difficulty') {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // ── Edit word ─────────────────────────────────────────────────────────────
  function openEdit(w: Word) {
    setEditingWord(w);
    setEditDraft({
      word: w.word,
      correctDefinition: w.correct_definition,
      distractor1: w.distractors[0] ?? '',
      distractor2: w.distractors[1] ?? '',
      distractor3: w.distractors[2] ?? '',
      difficulty: w.difficulty,
      category: w.category ?? '',
      set_id: w.set_id ?? '',
    });
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingWord) return;
    const err = validateDraft(editDraft);
    if (err) { setEditError(err); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const row = draftToRow(editDraft);
      const { error } = await supabase
        .from('words')
        .update(row)
        .eq('id', editingWord.id);
      if (error) throw error;
      setWords((prev) =>
        prev.map((w) =>
          w.id === editingWord.id
            ? { id: editingWord.id, ...row }
            : w,
        ),
      );
      setEditingWord(null);
    } catch (err) {
      console.error(err);
      setEditError('Failed to save. Check your connection and try again.');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete word ───────────────────────────────────────────────────────────
  async function confirmDelete(id: string) {
    try {
      const { error } = await supabase
        .from('words')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setWords((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Add word ──────────────────────────────────────────────────────────────
  async function handleAdd() {
    const err = validateDraft(addDraft);
    if (err) { setAddError(err); return; }
    setAddSaving(true);
    setAddError(null);
    setAddSuccess(false);
    setAddEmbedStatus('idle');

    let insertedId: string | null = null;
    let insertedWord: { word: string; correct_definition: string } | null = null;

    try {
      const row = draftToRow(addDraft);
      const { data, error } = await supabase
        .from('words')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      insertedId = (data as Word).id;
      insertedWord = { word: row.word, correct_definition: row.correct_definition };
      setWords((prev) =>
        [...prev, data as Word].sort((a, b) => a.word.localeCompare(b.word)),
      );
      setAddDraft(EMPTY_DRAFT);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setAddError('Failed to add word. Check your connection and try again.');
    } finally {
      setAddSaving(false);
    }

    // Generate embedding after insert — word is already saved regardless of outcome
    if (insertedId && insertedWord) {
      setAddEmbedStatus('generating');
      const embeddings = await fetchEmbeddings([
        embedText(insertedWord.word, insertedWord.correct_definition),
      ]);
      if (embeddings?.[0]) {
        await storeEmbedding(insertedId, embeddings[0]);
        setAddEmbedStatus('done');
      } else {
        setAddEmbedStatus('error');
      }
      setTimeout(() => setAddEmbedStatus('idle'), 5000);
    }
  }

  // ── Save set ──────────────────────────────────────────────────────────────
  async function handleSaveSet() {
    if (!setDraft.name.trim()) { setSetError('Name is required.'); return; }
    if (!setDraft.category) { setSetError('Category is required.'); return; }
    setSetSaving(true);
    setSetError(null);
    setSetSuccess(false);
    try {
      const { data, error } = await supabase
        .from('flashcard_sets')
        .insert({
          name: setDraft.name.trim(),
          description: setDraft.description.trim() || null,
          category: setDraft.category,
          display_order: setDraft.display_order,
        })
        .select()
        .single();
      if (error) throw error;
      setSets((prev) => [...prev, data as FlashcardSet].sort((a, b) => a.category.localeCompare(b.category) || a.display_order - b.display_order));
      setSetDraft({ name: '', description: '', category: '', display_order: 0 });
      setSetSuccess(true);
      setTimeout(() => setSetSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setSetError('Failed to save set.');
    } finally {
      setSetSaving(false);
    }
  }

  async function confirmDeleteSet(id: string) {
    try {
      const { error } = await supabase.from('flashcard_sets').delete().eq('id', id);
      if (error) throw error;
      setSets((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Delete set failed:', err);
    } finally {
      setDeletingSetId(null);
    }
  }

  // ── CSV upload ────────────────────────────────────────────────────────────
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
    // Reset input so the same file can be re-selected after clearing
    e.target.value = '';
  }

  async function handleCSVImport() {
    const validRows = csvRows.filter((r) => r._valid);
    if (validRows.length === 0) return;
    setCsvImporting(true);
    setCsvResult(null);
    setCsvEmbedStatus('idle');
    setCsvEmbedProgress(null);
    let added = 0;
    let failed = 0;
    const inserted: { id: string; word: string; correct_definition: string }[] = [];

    // Build a set-name → id cache to avoid duplicate lookups/creates
    const setCache = new Map<string, string>(sets.map((s) => [`${s.category}::${s.name}`, s.id]));

    for (const row of validRows) {
      try {
        // Resolve set_id from set_name + category (auto-create if needed)
        let resolvedSetId: string | null = null;
        if (row.set_name && row.category) {
          const cacheKey = `${row.category}::${row.set_name}`;
          if (setCache.has(cacheKey)) {
            resolvedSetId = setCache.get(cacheKey)!;
          } else {
            // Try to find existing set
            const { data: existingSet } = await supabase
              .from('flashcard_sets')
              .select('id')
              .eq('category', row.category)
              .eq('name', row.set_name)
              .maybeSingle();
            if (existingSet) {
              resolvedSetId = existingSet.id;
            } else {
              // Create new set
              const { data: newSet, error: setErr } = await supabase
                .from('flashcard_sets')
                .insert({ name: row.set_name, category: row.category, display_order: 0 })
                .select()
                .single();
              if (!setErr && newSet) {
                resolvedSetId = (newSet as FlashcardSet).id;
                setSets((prev) => [...prev, newSet as FlashcardSet]);
              }
            }
            if (resolvedSetId) setCache.set(cacheKey, resolvedSetId);
          }
        }

        const { data, error } = await supabase
          .from('words')
          .insert({
            word: row.word,
            correct_definition: row.correctDefinition,
            distractors: [row.distractor1, row.distractor2, row.distractor3],
            difficulty: row.difficulty,
            category: row.category || null,
            set_id: resolvedSetId,
          })
          .select()
          .single();
        if (error) throw error;
        setWords((prev) =>
          [...prev, data as Word].sort((a, b) => a.word.localeCompare(b.word)),
        );
        inserted.push({
          id: (data as Word).id,
          word: row.word,
          correct_definition: row.correctDefinition,
        });
        added++;
      } catch {
        failed++;
      }
    }
    setCsvResult({ added, failed });
    setCsvImporting(false);
    setCsvRows([]);
    setCsvFileName('');

    // Batch-embed all inserted words — words are already saved regardless
    if (inserted.length > 0) {
      setCsvEmbedStatus('generating');
      setCsvEmbedProgress({ done: 0, total: inserted.length });
      let embeddedCount = 0;

      for (let i = 0; i < inserted.length; i += EMBED_BATCH_SIZE) {
        const batch = inserted.slice(i, i + EMBED_BATCH_SIZE);
        const texts = batch.map((w) => embedText(w.word, w.correct_definition));
        const embeddings = await fetchEmbeddings(texts);
        if (embeddings) {
          for (let j = 0; j < batch.length; j++) {
            if (embeddings[j]) {
              await storeEmbedding(batch[j].id, embeddings[j]);
              embeddedCount++;
            }
          }
        }
        setCsvEmbedProgress({ done: i + batch.length, total: inserted.length });
      }

      setCsvEmbedStatus(embeddedCount > 0 ? 'done' : 'error');
      setTimeout(() => { setCsvEmbedStatus('idle'); setCsvEmbedProgress(null); }, 5000);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vocab-jam-words-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Loading / access states ───────────────────────────────────────────────
  if (authLoading) return <Spinner />;
  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-950 px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-violet-400 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-white">Admin Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage vocabulary words for Vocab Jam.</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">Signed in as</p>
            <p className="text-sm font-medium text-violet-300 truncate max-w-[160px]">
              {profile?.name ?? user.email}
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Total Words" value={words.length} icon={<BookOpen className="w-5 h-5 text-violet-400" />} />
          <StatCard label="Easy (1–3)" value={words.filter((w) => w.difficulty <= 3).length} icon={<span className="text-lg">🟢</span>} />
          <StatCard label="Hard (8–10)" value={words.filter((w) => w.difficulty >= 8).length} icon={<span className="text-lg">🔴</span>} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-gray-900 rounded-xl p-1 w-fit">
          {(['words', 'add', 'csv', 'sets', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'words' ? 'Words'
                : t === 'add' ? 'Add Word'
                : t === 'csv' ? 'CSV Upload'
                : t === 'sets' ? 'Flashcard Sets'
                : '⚙ Settings'}
            </button>
          ))}
        </div>

        {/* ── Tab: Words list ────────────────────────────────────────────────── */}
        {tab === 'words' && (
          <section className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search words…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button
                onClick={() => { setTab('add'); }}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" /> Add Word
              </button>
            </div>

            {loadingWords ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
            ) : displayedWords.length === 0 ? (
              <EmptyState message={search ? 'No words match your search.' : 'No words yet. Add some!'} />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <SortHeader label="Word" field="word" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-3 text-left text-gray-400 font-medium hidden md:table-cell">
                        Correct Definition
                      </th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium hidden lg:table-cell">
                        Distractors
                      </th>
                      <SortHeader label="Diff." field="difficulty" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-3 text-right text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {displayedWords.map((w) => (
                      <tr key={w.id} className="hover:bg-gray-900/40 transition-colors group">
                        <td className="px-4 py-3 font-semibold text-white">{w.word}</td>
                        <td className="px-4 py-3 text-gray-300 max-w-[240px] truncate hidden md:table-cell">
                          {w.correct_definition}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                          <span className="line-clamp-1">{w.distractors.join(' · ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <DifficultyBadge value={w.difficulty} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(w)}
                              title="Edit"
                              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingId(w.id)}
                              title="Delete"
                              className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-500">
                  {displayedWords.length} of {words.length} word{words.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Tab: Add Word ──────────────────────────────────────────────────── */}
        {tab === 'add' && (
          <section className="max-w-2xl space-y-6">
            <p className="text-sm text-gray-400">Fill in all fields to add a new vocabulary word.</p>
            <WordForm
              draft={addDraft}
              onChange={setAddDraft}
              onSubmit={handleAdd}
              saving={addSaving}
              error={addError}
              submitLabel="Add Word"
              submitIcon={<Plus className="w-4 h-4" />}
              sets={sets}
            />
            {addSuccess && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
                <Check className="w-4 h-4 shrink-0" />
                Word added successfully!
              </div>
            )}
            {addEmbedStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${
                addEmbedStatus === 'generating'
                  ? 'text-violet-300 bg-violet-950/40 border-violet-800'
                  : addEmbedStatus === 'done'
                    ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                    : 'text-amber-400 bg-amber-950/40 border-amber-800'
              }`}>
                {addEmbedStatus === 'generating' ? (
                  <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Generating embedding&hellip;</>
                ) : addEmbedStatus === 'done' ? (
                  <><Check className="w-4 h-4 shrink-0" /> Embedding stored &mdash; word is now searchable via vector search.</>
                ) : (
                  <><AlertCircle className="w-4 h-4 shrink-0" /> Embedding skipped &mdash; word saved, but won&apos;t appear in semantic search. Is <code className="text-amber-300">GEMINI_API_KEY</code> set?</>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Tab: CSV Upload ────────────────────────────────────────────────── */}
        {tab === 'csv' && (
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm text-gray-300 font-medium">Upload a CSV file to bulk-import words.</p>
                <p className="text-xs text-gray-500">
                  Required columns:{' '}
                  <code className="text-violet-400">word, correctDefinition, distractor1, distractor2, distractor3, difficulty</code>
                  <br />
                  Optional columns:{' '}
                  <code className="text-violet-400">category (survival/social/professional/eloquent), set_name</code>
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
                ) : (
                  <>Click to select a <strong className="text-white">CSV file</strong></>
                )}
              </p>
              <p className="text-gray-600 text-xs mt-1">UTF-8 encoded, .csv</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {csvError && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {csvError}
              </div>
            )}

            {csvResult && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
                <Check className="w-4 h-4 shrink-0" />
                Import complete &mdash; {csvResult.added} added
                {csvResult.failed > 0 && (
                  <span className="text-red-400">, {csvResult.failed} failed</span>
                )}
              </div>
            )}
            {csvEmbedStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${
                csvEmbedStatus === 'generating'
                  ? 'text-violet-300 bg-violet-950/40 border-violet-800'
                  : csvEmbedStatus === 'done'
                    ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                    : 'text-amber-400 bg-amber-950/40 border-amber-800'
              }`}>
                {csvEmbedStatus === 'generating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Generating embeddings{csvEmbedProgress ? ` (${csvEmbedProgress.done}/${csvEmbedProgress.total})` : ''}&hellip;
                  </>
                ) : csvEmbedStatus === 'done' ? (
                  <><Check className="w-4 h-4 shrink-0" /> Embeddings stored &mdash; all words are searchable via vector search.</>
                ) : (
                  <><AlertCircle className="w-4 h-4 shrink-0" /> Embeddings skipped &mdash; words saved, but won&apos;t appear in semantic search. Is <code className="text-amber-300">GEMINI_API_KEY</code> set?</>
                )}
              </div>
            )}

            {csvRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    Preview —{' '}
                    <span className="text-emerald-400">{csvRows.filter((r) => r._valid).length} valid</span>
                    {csvRows.some((r) => !r._valid) && (
                      <span className="text-red-400">
                        , {csvRows.filter((r) => !r._valid).length} invalid
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCsvRows([]); setCsvFileName(''); setCsvError(null); }}
                      className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleCSVImport}
                      disabled={csvImporting || csvRows.filter((r) => r._valid).length === 0}
                      className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors"
                    >
                      {csvImporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
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
                        <tr
                          key={i}
                          className={`${row._valid ? '' : 'bg-red-950/20'}`}
                        >
                          <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-white">{row.word || <span className="text-red-400 italic">empty</span>}</td>
                          <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate hidden sm:table-cell">
                            {row.correctDefinition || <span className="text-red-400 italic">empty</span>}
                          </td>
                          <td className="px-3 py-2">
                            {row._valid ? <DifficultyBadge value={row.difficulty} small /> : <span className="text-gray-600">–</span>}
                          </td>
                          <td className="px-3 py-2">
                            {row._valid ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Check className="w-3 h-3" /> Valid
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-400" title={row._error}>
                                <X className="w-3 h-3" /> {row._error}
                              </span>
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
        )}
        {/* ── Tab: Flashcard Sets ─────────────────────────────────────────────── */}
        {tab === 'sets' && (
          <section className="space-y-6">
            <p className="text-sm text-gray-400">
              Create named groups of words within each learning category. Words assigned to a set appear in the corresponding flashcard deck.
            </p>

            {/* Create new set form */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-white text-sm">New Set</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Set Name</Label>
                  <input
                    type="text"
                    value={setDraft.name}
                    onChange={(e) => setSetDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Travel & Transport"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <select
                    value={setDraft.category}
                    onChange={(e) => setSetDraft((d) => ({ ...d, category: e.target.value as WordCategory | '' }))}
                    className={inputCls}
                  >
                    <option value="">— choose —</option>
                    {WORD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Description (optional)</Label>
                  <input
                    type="text"
                    value={setDraft.description}
                    onChange={(e) => setSetDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Brief description of the set…"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Display Order</Label>
                  <input
                    type="number"
                    min={0}
                    value={setDraft.display_order}
                    onChange={(e) => setSetDraft((d) => ({ ...d, display_order: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </div>
              </div>
              {setError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />{setError}
                </div>
              )}
              {setSuccess && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
                  <Check className="w-4 h-4 shrink-0" />Set created!
                </div>
              )}
              <button
                onClick={handleSaveSet}
                disabled={setSaving}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {setSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {setSaving ? 'Creating…' : 'Create Set'}
              </button>
            </div>

            {/* Existing sets list */}
            {setsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
            ) : sets.length === 0 ? (
              <EmptyState message="No sets yet. Create your first set above." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Name</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Category</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium hidden md:table-cell">Description</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Order</th>
                      <th className="px-4 py-3 text-right text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {sets.map((s) => {
                      const meta = CATEGORY_META[s.category];
                      return (
                        <tr key={s.id} className="hover:bg-gray-900/40 transition-colors group">
                          <td className="px-4 py-3 font-semibold text-white">{s.name}</td>
                          <td className="px-4 py-3 text-gray-300">
                            <span className="text-sm">{meta.emoji} {meta.label}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate hidden md:table-cell">
                            {s.description ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.display_order}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setDeletingSetId(s.id)}
                                title="Delete"
                                className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-500">
                  {sets.length} set{sets.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Tab: Settings ─────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <section className="max-w-2xl space-y-8">
            <p className="text-sm text-gray-400">
              These settings apply globally to every new game session. Changes take effect immediately for all players.
            </p>

            {configLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              </div>
            ) : (
              <>
                {/* Word count */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-4 h-4 text-violet-400" />
                    <h3 className="font-semibold text-white text-sm">Words per Round</h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    How many words each player is quizzed on in a single game. Words are drawn randomly from the eligible pool (filtered by difficulty below).
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={3}
                      max={Math.max(50, words.length)}
                      step={1}
                      value={config.word_count}
                      onChange={(e) => setConfig((c) => ({ ...c, word_count: Number(e.target.value) }))}
                      className="flex-1 accent-violet-500"
                    />
                    <span className="text-2xl font-extrabold text-violet-300 tabular-nums w-12 text-right">
                      {config.word_count}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>3 (min)</span>
                    <span className="text-gray-500">
                      Pool size: {words.filter((w) => w.difficulty >= config.difficulty_min && w.difficulty <= config.difficulty_max).length} eligible words
                    </span>
                    <span>{Math.max(50, words.length)} (max)</span>
                  </div>
                  {config.word_count > words.filter((w) => w.difficulty >= config.difficulty_min && w.difficulty <= config.difficulty_max).length && (
                    <p className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
                      ⚠ Word count exceeds the eligible pool — all matching words will be used and the rest will be padded with repeats.
                    </p>
                  )}
                </div>

                {/* Timer */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Timer className="w-4 h-4 text-violet-400" />
                    <h3 className="font-semibold text-white text-sm">Timer per Word (seconds)</h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    How long players have to answer each word. Scoring formula: 100&nbsp;+&nbsp;(timeLeft&nbsp;×&nbsp;10) pts per correct answer, so max per word = 100&nbsp;+&nbsp;(timer&nbsp;×&nbsp;10).
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={3}
                      max={30}
                      step={1}
                      value={config.timer_seconds}
                      onChange={(e) => setConfig((c) => ({ ...c, timer_seconds: Number(e.target.value) }))}
                      className="flex-1 accent-violet-500"
                    />
                    <span className="text-2xl font-extrabold text-violet-300 tabular-nums w-16 text-right">
                      {config.timer_seconds}s
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>3s (fast)</span>
                    <span className="text-gray-500">Max score/word: {100 + config.timer_seconds * 10} pts</span>
                    <span>30s (relaxed)</span>
                  </div>
                </div>

                {/* Difficulty range */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-4 h-4 text-violet-400" />
                    <h3 className="font-semibold text-white text-sm">Difficulty Filter</h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    Only words within this difficulty band will appear in the game. Use this to create themed sessions (e.g. beginners: 1–4, advanced: 7–10).
                  </p>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Min */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Minimum</span>
                        <span className="text-sm font-bold text-emerald-400">{config.difficulty_min}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={config.difficulty_min}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setConfig((c) => ({
                            ...c,
                            difficulty_min: v,
                            difficulty_max: Math.max(c.difficulty_max, v),
                          }));
                        }}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    {/* Max */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Maximum</span>
                        <span className="text-sm font-bold text-red-400">{config.difficulty_max}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={config.difficulty_max}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setConfig((c) => ({
                            ...c,
                            difficulty_max: v,
                            difficulty_min: Math.min(c.difficulty_min, v),
                          }));
                        }}
                        className="w-full accent-red-500"
                      />
                    </div>
                  </div>

                  {/* Visual difficulty bar */}
                  <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-gradient-to-r from-emerald-500 to-red-500 rounded-full transition-all"
                      style={{
                        left: `${((config.difficulty_min - 1) / 9) * 100}%`,
                        right: `${((10 - config.difficulty_max) / 9) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                      <span
                        key={n}
                        className={n >= config.difficulty_min && n <= config.difficulty_max ? 'text-gray-300 font-medium' : ''}
                      >
                        {n}
                      </span>
                    ))}
                  </div>

                  {/* Per-difficulty breakdown */}
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 pt-1">
                    {[1,2,3,4,5,6,7,8,9,10].map((n) => {
                      const count = words.filter((w) => w.difficulty === n).length;
                      const active = n >= config.difficulty_min && n <= config.difficulty_max;
                      return (
                        <div key={n} className={`text-center rounded-lg p-1.5 text-xs border ${
                          active
                            ? 'bg-violet-900/40 border-violet-700 text-violet-200'
                            : 'bg-gray-800/40 border-gray-800 text-gray-600'
                        }`}>
                          <div className="font-bold">{count}</div>
                          <div className="text-[10px] opacity-60">d{n}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save button */}
                {configError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {configError}
                  </div>
                )}
                {configSaved && (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950 border border-emerald-800 rounded-xl px-4 py-3">
                    <Check className="w-4 h-4 shrink-0" />
                    Settings saved! New game sessions will use these values.
                  </div>
                )}
                <button
                  onClick={saveConfig}
                  disabled={configSaving}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {configSaving ? 'Saving…' : 'Save Settings'}
                </button>
              </>
            )}
          </section>
        )}
      </div>

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      {editingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">Edit Word</h2>
              <button
                onClick={() => setEditingWord(null)}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              <WordForm
                draft={editDraft}
                onChange={setEditDraft}
                onSubmit={saveEdit}
                saving={editSaving}
                error={editError}
                submitLabel="Save Changes"
                submitIcon={<Check className="w-4 h-4" />}
                sets={sets}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Word Confirm Modal ─────────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-950 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Delete word?</h2>
              <p className="text-sm text-gray-400 mt-1">
                {words.find((w) => w.id === deletingId)?.word} — this cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeletingId(null)}
                className="px-5 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deletingId)}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Set Confirm Modal ─────────────────────────────────────────── */}
      {deletingSetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-950 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Delete set?</h2>
              <p className="text-sm text-gray-400 mt-1">
                {sets.find((s) => s.id === deletingSetId)?.name} — words will keep their category but lose their set assignment.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeletingSetId(null)}
                className="px-5 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteSet(deletingSetId)}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function validateDraft(d: WordDraft): string | null {
  if (!d.word.trim()) return 'Word is required.';
  if (!d.correctDefinition.trim()) return 'Correct definition is required.';
  if (!d.distractor1.trim() || !d.distractor2.trim() || !d.distractor3.trim())
    return 'All three distractors are required.';
  if (d.difficulty < 1 || d.difficulty > 10) return 'Difficulty must be between 1 and 10.';
  return null;
}

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

function WordForm({ draft, onChange, onSubmit, saving, error, submitLabel, submitIcon, sets }: WordFormProps) {
  function field(key: keyof WordDraft, value: string | number) {
    onChange({ ...draft, [key]: value });
  }

  // Filter sets to those matching the selected category
  const filteredSets = draft.category ? sets.filter((s) => s.category === draft.category) : sets;

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
        <div>
          <Label>Difficulty (1–10)</Label>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.difficulty}
            onChange={(e) => field('difficulty', Math.min(10, Math.max(1, Number(e.target.value))))}
            className={inputCls}
          />
        </div>
        <div className="flex items-end pb-0.5">
          <DifficultyBadge value={draft.difficulty} />
        </div>
        <div>
          <Label>Category (optional)</Label>
          <select
            value={draft.category}
            onChange={(e) => {
              onChange({ ...draft, category: e.target.value as WordCategory | '', set_id: '' });
            }}
            className={inputCls}
          >
            <option value="">— none —</option>
            {WORD_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Flashcard Set (optional)</Label>
          <select
            value={draft.set_id}
            onChange={(e) => field('set_id', e.target.value)}
            disabled={!draft.category}
            className={inputCls + (draft.category ? '' : ' opacity-40')}
          >
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

const inputCls =
  'w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 mt-1';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-400 mb-0.5">{children}</label>;
}

function DifficultyBadge({ value, small }: { value: number; small?: boolean }) {
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

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-extrabold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: 'word' | 'difficulty';
  current: 'word' | 'difficulty';
  dir: 'asc' | 'desc';
  onSort: (f: 'word' | 'difficulty') => void;
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-gray-500 border border-dashed border-gray-800 rounded-2xl">
      <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-700" />
      <p className="text-sm">{message}</p>
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
