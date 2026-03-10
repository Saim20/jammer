export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      flashcard_reviews: {
        Row: {
          ease_factor: number
          interval_days: number
          last_quality: number | null
          last_reviewed_at: string | null
          next_review_at: string
          repetitions: number
          user_id: string
          word_id: string
        }
        Insert: {
          ease_factor?: number
          interval_days?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          user_id: string
          word_id: string
        }
        Update: {
          ease_factor?: number
          interval_days?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          user_id?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_reviews_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_sets: {
        Row: {
          category: Database["public"]["Enums"]["word_category"]
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["word_category"]
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["word_category"]
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      game_config: {
        Row: {
          difficulty_max: number
          difficulty_min: number
          id: number
          timer_seconds: number
          word_count: number
        }
        Insert: {
          difficulty_max?: number
          difficulty_min?: number
          id?: number
          timer_seconds?: number
          word_count?: number
        }
        Update: {
          difficulty_max?: number
          difficulty_min?: number
          id?: number
          timer_seconds?: number
          word_count?: number
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          created_at: string
          id: string
          max_score: number
          score: number
          type: string
          user_id: string
          word_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_score: number
          score: number
          type?: string
          user_id: string
          word_count: number
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number
          score?: number
          type?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard: {
        Row: {
          created_at: string
          id: string
          score: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          score: number
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          score?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_words: {
        Row: {
          answer_index: number | null
          correct: boolean
          session_id: string
          time_taken: number | null
          word_id: string
        }
        Insert: {
          answer_index?: number | null
          correct?: boolean
          session_id: string
          time_taken?: number | null
          word_id: string
        }
        Update: {
          answer_index?: number | null
          correct?: boolean
          session_id?: string
          time_taken?: number | null
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_words_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_words_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      user_category_progress: {
        Row: {
          category: Database["public"]["Enums"]["word_category"]
          last_studied_at: string | null
          user_id: string
          words_mastered: number
          words_seen: number
        }
        Insert: {
          category: Database["public"]["Enums"]["word_category"]
          last_studied_at?: string | null
          user_id: string
          words_mastered?: number
          words_seen?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["word_category"]
          last_studied_at?: string | null
          user_id?: string
          words_mastered?: number
          words_seen?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_category_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_word_stats: {
        Row: {
          correct_count: number
          incorrect_count: number
          last_correct: boolean | null
          last_seen_at: string
          user_id: string
          word_id: string
        }
        Insert: {
          correct_count?: number
          incorrect_count?: number
          last_correct?: boolean | null
          last_seen_at?: string
          user_id: string
          word_id: string
        }
        Update: {
          correct_count?: number
          incorrect_count?: number
          last_correct?: boolean | null
          last_seen_at?: string
          user_id?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_word_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_word_stats_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      words: {
        Row: {
          correct_definition: string
          created_at: string
          difficulty: number
          distractors: string[]
          example_sentences: string[]
          embedding: string | null
          id: string
          set_id: string | null
          updated_at: string
          word: string
        }
        Insert: {
          correct_definition: string
          created_at?: string
          difficulty: number
          distractors?: string[]
          example_sentences?: string[]
          embedding?: string | null
          id?: string
          set_id?: string | null
          updated_at?: string
          word: string
        }
        Update: {
          correct_definition?: string
          created_at?: string
          difficulty?: number
          distractors?: string[]
          example_sentences?: string[]
          embedding?: string | null
          id?: string
          set_id?: string | null
          updated_at?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "words_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "flashcard_sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_ranked: {
        Row: {
          created_at: string | null
          id: string | null
          score: number | null
          type: string | null
          user_id: string | null
          user_name: string | null
          user_photo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      difficulty_to_category: {
        Args: { p_difficulty: number }
        Returns: Database["public"]["Enums"]["word_category"]
      }
      get_weak_words: {
        Args: { p_limit?: number; p_threshold?: number; p_user_id: string }
        Returns: {
          correct_definition: string
          difficulty: number
          distractors: string[]
          id: string
          incorrect_count: number
          word: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      match_words: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          correct_definition: string
          difficulty: number
          id: string
          similarity: number
          word: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_game_session: {
        Args: {
          p_max_score: number
          p_score: number
          p_type?: string
          p_user_id: string
          p_words: Json
        }
        Returns: string
      }
    }
    Enums: {
      word_category: "survival" | "social" | "professional" | "eloquent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      word_category: ["survival", "social", "professional", "eloquent"],
    },
  },
} as const
