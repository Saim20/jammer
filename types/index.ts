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
