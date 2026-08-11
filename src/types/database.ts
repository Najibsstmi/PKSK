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

export type QuestionImportRow = {
  id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  source_title: string | null;
  status: "uploaded" | "processing" | "review" | "completed" | "failed";
  processing_stage: string | null;
  total_detected: number;
  total_imported: number;
  processing_error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ImportedQuestionDraftRow = {
  id: string;
  import_id: string;
  imported_question_id: string | null;
  source_question_number: string | null;
  question_type: "objective" | "essay";
  section: "A" | "B" | "C" | null;
  category: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_text: string;
  question_image_url: string | null;
  correct_option_label: string | null;
  explanation: string | null;
  confidence: number | null;
  review_status: "pending" | "approved" | "rejected" | "needs_review";
  essay_min_words: number | null;
  essay_time_limit: number | null;
  created_at: string;
  updated_at: string;
};

export type ImportedQuestionDraftOptionRow = {
  id: string;
  draft_question_id: string;
  option_label: string | null;
  option_text: string | null;
  option_image_url: string | null;
  is_correct: boolean | null;
  sort_order: number;
  created_at: string;
};

export type QuestionAssetRow = {
  id: string;
  question_id: string | null;
  draft_question_id: string | null;
  asset_type: "question_image" | "diagram" | "graph" | "table" | "reference_image" | "option_image";
  file_url: string;
  sort_order: number;
  created_at: string;
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

export type PaymentRequestRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected" | "expired" | "paid" | "failed" | "cancelled";
  provider: string;
  payment_method: string;
  provider_bill_code: string | null;
  provider_reference: string | null;
  external_reference: string | null;
  paid_at: string | null;
  provider_response: Json;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
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
      question_imports: {
        Row: QuestionImportRow;
        Insert: Partial<QuestionImportRow>;
        Update: Partial<QuestionImportRow>;
        Relationships: [];
      };
      imported_question_drafts: {
        Row: ImportedQuestionDraftRow;
        Insert: Partial<ImportedQuestionDraftRow>;
        Update: Partial<ImportedQuestionDraftRow>;
        Relationships: [];
      };
      imported_question_draft_options: {
        Row: ImportedQuestionDraftOptionRow;
        Insert: Partial<ImportedQuestionDraftOptionRow>;
        Update: Partial<ImportedQuestionDraftOptionRow>;
        Relationships: [];
      };
      question_assets: {
        Row: QuestionAssetRow;
        Insert: Partial<QuestionAssetRow>;
        Update: Partial<QuestionAssetRow>;
        Relationships: [];
      };
      payment_requests: {
        Row: PaymentRequestRow;
        Insert: Partial<PaymentRequestRow>;
        Update: Partial<PaymentRequestRow>;
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
      skip_answer: {
        Args: {
          p_attempt_id: string;
          p_question_id: string;
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
      get_public_question_counts: {
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
      create_manual_payment_request: {
        Args: {
          p_email?: string | null;
        };
        Returns: Json;
      };
      get_my_pending_payment_request: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_my_latest_payment_request: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_list_payment_requests: {
        Args: {
          search_text?: string | null;
          status_filter?: string | null;
          page_number?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      admin_update_payment_request: {
        Args: {
          p_request_id: string;
          p_status: string;
          p_notes?: string | null;
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
          section_filter?: string | null;
          status_filter?: string | null;
          source_filter?: string | null;
          page_number?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      admin_get_question_detail: {
        Args: {
          p_question_id: string;
        };
        Returns: Json;
      };
      admin_update_question: {
        Args: {
          question_payload: Json;
          options_payload?: Json | null;
        };
        Returns: Json;
      };
      admin_create_question_import: {
        Args: {
          file_name: string;
          storage_path: string;
          source_title?: string | null;
        };
        Returns: string;
      };
      admin_get_question_import: {
        Args: {
          p_import_id: string;
        };
        Returns: Json;
      };
      admin_list_question_imports: {
        Args: {
          status_filter?: string | null;
          page_number?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      admin_list_import_drafts: {
        Args: {
          p_import_id: string;
        };
        Returns: Json;
      };
      admin_update_import_draft: {
        Args: {
          draft_id: string;
          draft_payload: Json;
          options_payload?: Json | null;
        };
        Returns: Json;
      };
      admin_set_import_draft_status: {
        Args: {
          draft_ids: string[];
          next_status: string;
        };
        Returns: Json;
      };
      admin_import_approved_questions: {
        Args: {
          p_import_id: string;
        };
        Returns: Json;
      };
      admin_create_manual_question: {
        Args: {
          question_payload: Json;
        };
        Returns: string;
      };
      admin_update_question_status: {
        Args: {
          p_question_id: string;
          next_is_active: boolean;
          archive_question?: boolean;
        };
        Returns: Json;
      };
      start_essay_attempt: {
        Args: Record<string, never>;
        Returns: string;
      };
      fetch_active_essay_attempt: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_essay_attempt_payload: {
        Args: {
          p_attempt_id: string;
        };
        Returns: Json;
      };
      autosave_essay_response: {
        Args: {
          p_attempt_id: string;
          p_response_text: string;
        };
        Returns: Json;
      };
      submit_essay_response: {
        Args: {
          p_attempt_id: string;
          p_response_text: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
