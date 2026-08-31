import type { Json, ProfileRow } from "./database";
import type { DraftAsset, DraftOption } from "./imports";
import type { QuizQuestion } from "./quiz";

export type UserRole = "user" | "admin" | "super_admin";
export type SubscriptionStatus = "free" | "premium" | "expired" | "blocked";
export type SubscriptionPlan = "monthly" | "6_months" | "yearly" | "lifetime";

export type AccessStatus = {
  is_guest: boolean;
  role: UserRole;
  subscription_status: SubscriptionStatus;
  subscription_plan?: SubscriptionPlan | null;
  subscription_started_at?: string | null;
  subscription_ends_at?: string | null;
  is_premium: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  is_blocked: boolean;
  is_expired: boolean;
};

export type AccessFlags = {
  isGuest: boolean;
  isLoggedIn: boolean;
  isPremium: boolean;
  isExpired: boolean;
  isBlocked: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canUsePremiumFeature: () => boolean;
};

export type AdminKpis = {
  total_registered_users: number;
  premium_users: number;
  free_users: number;
  expired_users: number;
  blocked_users: number;
  active_users_today: number;
  total_quiz_attempts: number;
  attempts_today: number;
};

export type AdminUserRow = Pick<
  ProfileRow,
  | "id"
  | "full_name"
  | "display_name"
  | "school"
  | "state"
  | "role"
  | "subscription_status"
  | "subscription_plan"
  | "subscription_started_at"
  | "subscription_ends_at"
  | "created_at"
  | "last_login_at"
  | "is_blocked"
> & {
  email: string;
  email_confirmed_at: string | null;
  total_count: number;
};

export type AdminQuestionRow = {
  id: string;
  section: "A" | "B" | "C";
  category: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  question_type: "objective" | "essay";
  question_text: string;
  question_image_url: string | null;
  is_active: boolean;
  archived_at: string | null;
  source_title: string | null;
  created_at: string;
  total_count: number;
};

export type AdminQuestionDetail = AdminQuestionRow & {
  explanation: string | null;
  correct_option_label: string | null;
  essay_min_words: number | null;
  essay_time_limit: number | null;
  options: DraftOption[];
  assets: DraftAsset[];
};

export type QuestionBankCounts = {
  section_a: number;
  section_b: number;
  section_c: number;
  total: number;
};

export type PublicSocialProofStats = {
  registered_users: number;
  display_users: number;
};

export type SubscriptionHistory = {
  id: string;
  user_id: string;
  previous_status: SubscriptionStatus | null;
  new_status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  started_at: string | null;
  ends_at: string | null;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};

export type AppSettings = {
  free_preview_section_a_limit: number;
  free_preview_section_b_limit: number;
  free_preview_section_c_enabled: boolean;
  payment_provider: string;
  payment_price: number;
  payment_currency: string;
  payment_plan_code: SubscriptionPlan;
  payment_whatsapp_number: string;
  payment_account_name: string;
  payment_bank_name: string;
  payment_account_number: string;
  payment_qr_image_url: string;
};

export type GuestPreviewPayload = {
  section: "A" | "B";
  limit: number;
  questions: QuizQuestion[];
};

export type GuestPreviewResult = {
  correct_answers: number;
  total_questions: number;
  percentage: number;
};

export type GuestAnswerInput = {
  question_id: string;
  selected_option_id: string;
};

export type JsonRecord = Record<string, Json>;
