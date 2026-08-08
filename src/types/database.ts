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
  role: "user" | "admin" | "super_admin";
  subscription_status: "free" | "premium" | "expired" | "blocked";
  subscription_plan: "monthly" | "6_months" | "yearly" | "lifetime" | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  access_granted_at: string | null;
  access_granted_by: string | null;
  last_login_at: string | null;
  is_blocked: boolean;
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

export type SubscriptionPlanRow = {
  id: string;
  code: "monthly" | "6_months" | "yearly" | "lifetime";
  name: string;
  description: string | null;
  duration_days: number | null;
  price: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AppSettingRow = {
  key: string;
  value: Json;
  description: string | null;
  updated_at: string;
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
          role?: "user" | "admin" | "super_admin";
          subscription_status?: "free" | "premium" | "expired" | "blocked";
          subscription_plan?: "monthly" | "6_months" | "yearly" | "lifetime" | null;
          subscription_started_at?: string | null;
          subscription_ends_at?: string | null;
          access_granted_at?: string | null;
          access_granted_by?: string | null;
          last_login_at?: string | null;
          is_blocked?: boolean;
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
      subscription_plans: {
        Row: SubscriptionPlanRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
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
      get_my_access_status: {
        Args: Record<string, never>;
        Returns: Json;
      };
      record_last_login: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_public_app_settings: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_guest_preview_questions: {
        Args: {
          p_section: "A" | "B";
          p_limit?: number | null;
        };
        Returns: Json;
      };
      score_guest_preview: {
        Args: {
          p_answers: Json;
        };
        Returns: Json;
      };
      admin_get_kpis: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_list_users: {
        Args: {
          search_text?: string | null;
          status_filter?: string | null;
          page_number?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      admin_grant_premium: {
        Args: {
          target_user_id: string;
          plan?: string;
        };
        Returns: Json;
      };
      admin_extend_premium: {
        Args: {
          target_user_id: string;
          plan?: string;
        };
        Returns: Json;
      };
      admin_revoke_premium: {
        Args: {
          target_user_id: string;
        };
        Returns: Json;
      };
      admin_block_user: {
        Args: {
          target_user_id: string;
        };
        Returns: Json;
      };
      admin_unblock_user: {
        Args: {
          target_user_id: string;
        };
        Returns: Json;
      };
      super_admin_set_role: {
        Args: {
          target_user_id: string;
          new_role: "user" | "admin" | "super_admin";
        };
        Returns: Json;
      };
      admin_list_questions: {
        Args: {
          search_text?: string | null;
          page_number?: number;
          page_size?: number;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
