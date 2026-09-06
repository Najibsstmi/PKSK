export type QuizMode = "full" | "section" | "quick";
export type PkskSectionCode = "A" | "B" | "C";

export type QuizOption = {
  id: string;
  option_text: string | null;
  option_image_url?: string | null;
  option_order: number;
};

export type QuizQuestion = {
  id: string;
  section: PkskSectionCode;
  category: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  question_text: string;
  question_image_url?: string | null;
  question_order: number;
  options: QuizOption[];
  selected_option_id: string | null;
  answer_status?: "unanswered" | "answered" | "skipped";
  answer_revealed_at?: string | null;
  correct_option_id?: string | null;
  answer_explanation?: string | null;
};

export type AttemptSummary = {
  id: string;
  mode: QuizMode;
  section: PkskSectionCode | null;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  total_questions: number;
  correct_answers: number;
  percentage: number;
  xp_earned: number;
};

export type AttemptPayload = {
  attempt: AttemptSummary;
  questions: QuizQuestion[];
};

export type PrintableSimulationSet = {
  generated_at: string;
  total_questions: number;
  sections: {
    A: number;
    B: number;
    C: number;
  };
  questions: QuizQuestion[];
};

export type RevealedQuizAnswer = {
  question_id: string;
  selected_option_id: string | null;
  correct_option_id: string;
  correct_option_text: string | null;
  correct_option_image_url: string | null;
  correct_option_order: number | null;
  is_correct: boolean;
  answer_status: "answered" | "skipped";
  answer_revealed_at: string;
  explanation: string | null;
};

export type CompleteAttemptResult = {
  attempt_id: string;
  correct_answers: number;
  total_questions: number;
  score?: number;
  percentage: number;
  duration_seconds: number;
  xp_earned: number;
  total_xp: number;
  level: number;
  section_a_score: number | null;
  section_b_score: number | null;
  section_c_score: number | null;
  section_a_weighted_score?: number | null;
  section_b_weighted_score?: number | null;
  skipped_answers?: number;
  already_completed?: boolean;
};

export type PerformanceStats = {
  totalAttempts: number;
  bestScore: number;
  averageScore: number;
  totalXp: number;
  level: number;
  badgeCount: number;
  sectionA: number | null;
  sectionB: number | null;
  sectionC: number | null;
  bestSectionA: number | null;
  bestSectionB: number | null;
  bestSectionC: number | null;
  completedSections: number;
  overallBestAverage: number | null;
};
