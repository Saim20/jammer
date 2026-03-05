/** Vocabulary word stored in Firestore `words` collection. */
export interface Word {
  id: string;
  word: string;
  correctDefinition: string;
  /** Exactly 3 wrong answer choices. */
  distractors: string[];
  /** Difficulty rating 1–10. */
  difficulty: number;
}

/** Score entry stored in Firestore `leaderboard` collection. */
export interface LeaderboardEntry {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  score: number;
  timestamp: Date;
}

/**
 * Game configuration stored in Firestore `config/game`.
 * Written exclusively by admins; read by all authenticated players.
 */
export interface GameConfig {
  /** Number of words per round. */
  wordCount: number;
  /** Seconds per word countdown. */
  timerSeconds: number;
  /** Only include words with difficulty >= this value. */
  difficultyMin: number;
  /** Only include words with difficulty <= this value. */
  difficultyMax: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  wordCount: 10,
  timerSeconds: 10,
  difficultyMin: 1,
  difficultyMax: 10,
};
