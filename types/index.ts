/** Vocabulary word stored in Supabase `words` table. */
export interface Word {
  id: string;
  word: string;
  correct_definition: string;
  /** Exactly 3 wrong answer choices. */
  distractors: string[];
  /** Difficulty rating 1–10. */
  difficulty: number;
}

/** Score entry stored in Supabase `leaderboard` table.
 *  One row per user per leaderboard `type` — the best score is kept. */
export interface LeaderboardEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_photo: string;
  score: number;
  /** Leaderboard category, e.g. 'global', 'weekly', 'hard-mode'. */
  type: string;
  created_at: string;
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
