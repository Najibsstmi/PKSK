export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  school: string | null;
  state: string | null;
  class_name: string | null;
  avatar: string | null;
  xp: number;
  level: number;
  created_at: string;
  updated_at: string;
};

export type QuizAttemptRow = {
  id: string;
  user_id: string;
  mode: "full" | "section" | "quick";
  section: "A" | "B" | "C" | null;
  started_at: string;
  completed_at: string | null;
  total_questions: number;
  correct_answers: number;
  score: number;
  percentage: number;
  section_a_score: number | null;
  section_b_score: number | null;
  section_c_score: number | null;
  duration_seconds: number | null;
  xp_earned: number;
  status: "in_progress" | "completed" | "abandoned";
};

export type BadgeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  xp_reward: number;
  requirement_type: string;
  requirement_value: number;
  is_active: boolean;
};

export type UserBadgeRow = {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
};

export type XpHistoryRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  attempt_id: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          full_name?: string | null;
          display_name?: string | null;
          school?: string | null;
          state?: string | null;
          class_name?: string | null;
          avatar?: string | null;
          xp?: number;
          level?: number;
        };
        Update: Partial<Omit<ProfileRow, "id" | "created_at">>;
        Relationships: [];
      };
      quiz_attempts: {
        Row: QuizAttemptRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      badges: {
        Row: BadgeRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      user_badges: {
        Row: UserBadgeRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      xp_history: {
        Row: XpHistoryRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      start_quiz: {
        Args: {
          p_mode: "full" | "section" | "quick";
          p_section?: "A" | "B" | "C" | null;
          p_number_of_questions?: number;
        };
        Returns: string;
      };
      get_attempt_payload: {
        Args: {
          p_attempt_id: string;
        };
        Returns: Json;
      };
      submit_answer: {
        Args: {
          p_attempt_id: string;
          p_question_id: string;
          p_selected_option_id: string;
        };
        Returns: Json;
      };
      complete_attempt: {
        Args: {
          p_attempt_id: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
