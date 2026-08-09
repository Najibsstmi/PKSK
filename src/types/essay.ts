import type { PkskSectionCode } from "./quiz";

export type EssayQuestion = {
  id: string;
  section: PkskSectionCode;
  category: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  question_text: string;
  question_image_url: string | null;
  essay_min_words: number | null;
  essay_time_limit: number | null;
};

export type EssayAttemptSummary = {
  id: string;
  mode: "section";
  section: "C";
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
};

export type EssayResponse = {
  response_text: string;
  word_count: number;
  autosaved_at: string | null;
  submitted_at: string | null;
};

export type EssayAttemptPayload = {
  attempt: EssayAttemptSummary;
  question: EssayQuestion;
  response: EssayResponse;
};

export type EssaySubmitResult = {
  attempt_id: string;
  word_count: number;
  duration_seconds: number;
  message: string;
  ai_note: string;
  already_submitted?: boolean;
};
