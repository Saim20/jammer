/**
 * The four vocabulary categories, derived from word difficulty:
 * survival (1–3) → social (4–6) → professional (7–8) → eloquent (9–10).
 * Category is NEVER stored on words; always computed via difficultyToCategory().
 */
export type WordCategory = 'survival' | 'social' | 'professional' | 'eloquent';

/** Maps a difficulty value (1–10) to its category. Mirrors difficulty_to_category() in SQL. */
export function difficultyToCategory(difficulty: number): WordCategory {
  if (difficulty <= 3) return 'survival';
  if (difficulty <= 6) return 'social';
  if (difficulty <= 8) return 'professional';
  return 'eloquent';
}

/** Human-readable labels and descriptions for each category. */
export const CATEGORY_META: Record<
  WordCategory,
  { label: string; emoji: string; description: string; color: string; difficultyRange: string }
> = {
  survival:     { label: 'Survival',     emoji: '🏕️',  description: 'Everyday essentials — the words you need to get by.',       color: 'emerald', difficultyRange: '1–3'  },
  social:       { label: 'Social',       emoji: '💬',  description: 'Communication & interpersonal vocabulary.',                   color: 'sky',     difficultyRange: '4–6'  },
  professional: { label: 'Professional', emoji: '💼',  description: 'Workplace, academic and formal register.',                    color: 'violet',  difficultyRange: '7–8'  },
  eloquent:     { label: 'Eloquent',     emoji: '📚',  description: 'Advanced literary, rhetorical and nuanced vocabulary.',       color: 'amber',   difficultyRange: '9–10' },
};

export const WORD_CATEGORIES: WordCategory[] = ['survival', 'social', 'professional', 'eloquent'];

/** Difficulty range bounds for each category — matches difficulty_to_category() in SQL. */
export const CATEGORY_DIFFICULTY_RANGE: Record<WordCategory, [number, number]> = {
  survival:     [1, 3],
  social:       [4, 6],
  professional: [7, 8],
  eloquent:     [9, 10],
};

/** Vocabulary word stored in Supabase `words` table.
 *  The `embedding` column is excluded from client fetches — use match_words() RPC instead.
 *  NOTE: category is NOT stored — derive it with difficultyToCategory(word.difficulty). */
export interface Word {
  id: string;
  word: string;
  correct_definition: string;
  /** Exactly 3 wrong answer choices. */
  distractors: string[];
  /** Difficulty rating 1–10. Category is inferred: 1-3=survival, 4-6=social, 7-8=professional, 9-10=eloquent */
  difficulty: number;
  /** Flashcard set this word belongs to. Null if not assigned to a set. */
  set_id: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A named group of words within a category (e.g. "Animals", "Travel"). */
export interface FlashcardSet {
  id: string;
  name: string;
  description: string | null;
  category: WordCategory;
  display_order: number;
  created_at: string;
}

/**
 * SM-2 spaced-repetition state for a (user, word) pair.
 * Written exclusively via submit_flashcard_review() RPC.
 */
export interface FlashcardReview {
  user_id: string;
  word_id: string;
  /** How easy the card is (starts 2.5, min 1.3). */
  ease_factor: number;
  /** Current review interval in days. */
  interval_days: number;
  /** UTC timestamp when this card is next due. */
  next_review_at: string;
  /** Consecutive successful reviews; resets to 0 on failure. */
  repetitions: number;
  /** 0–5 quality rating from the most recent review. */
  last_quality: number | null;
  last_reviewed_at: string | null;
}

/** Aggregated learning progress for one (user, category) pair. */
export interface UserCategoryProgress {
  user_id: string;
  category: WordCategory;
  /** Unique words seen at least once in flashcard sessions. */
  words_seen: number;
  /** Words with repetitions ≥ 3 (well-learned). */
  words_mastered: number;
  last_studied_at: string | null;
}

/** A word enriched with its current SM-2 review state (returned by get_due_reviews).
 *  category is computed by the RPC as difficulty_to_category(difficulty). */
export interface WordWithReview extends Word {
  category: WordCategory;
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string;
}

/** User profile stored in `public.users`.
 *  Single source of truth for display data — never replicated to other tables. */
export interface UserProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  /** 'player' (default) or 'admin'. Granted via SQL: update users set role='admin'. */
  role: 'player' | 'admin';
  created_at: string;
  updated_at: string;
}

/** Row returned by the `leaderboard_ranked` view.
 *  user_name / user_photo come from the join with `public.users` — not stored redundantly. */
export interface LeaderboardEntry {
  id: string;
  user_id: string;
  /** Joined from public.users.name */
  user_name: string | null;
  /** Joined from public.users.avatar_url */
  user_photo: string | null;
  score: number;
  /** Leaderboard category, e.g. 'global', 'weekly', 'hard-mode'. */
  type: string;
  created_at: string;
}

/** Analytics record for a completed game round, stored in `game_sessions`. */
export interface GameSession {
  id: string;
  user_id: string;
  score: number;
  word_count: number;
  max_score: number;
  type: string;
  created_at: string;
}

/** Per-word result within a game session, stored in `session_words`. */
export interface SessionWord {
  session_id: string;
  word_id: string;
  /**
   * Canonical slot the player chose, independent of shuffle order.
   * 0 = correct_definition, 1–3 = distractors[0..2], null = timed out.
   */
  answer_index: number | null;
  /** Seconds elapsed when the player answered (timer_seconds - time_left). */
  time_taken: number | null;
  /** Generated by the DB from answer_index — always consistent, not stored by the client. */
  correct: boolean;
}

/** Per-user performance for a single word, stored in `user_word_stats`. */
export interface UserWordStat {
  user_id: string;
  word_id: string;
  correct_count: number;
  incorrect_count: number;
  last_seen_at: string;
  last_correct: boolean | null;
}

/**
 * Game configuration stored in Supabase `game_config` table (single row, id=1).
 * Written exclusively by admins; read by all authenticated players.
 */
export interface GameConfig {
  /** Number of words per round. */
  word_count: number;
  /** Seconds per word countdown. */
  timer_seconds: number;
  /** Only include words with difficulty >= this value. */
  difficulty_min: number;
  /** Only include words with difficulty <= this value. */
  difficulty_max: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  word_count: 10,
  timer_seconds: 10,
  difficulty_min: 1,
  difficulty_max: 10,
};
