import type { PkskSectionCode } from "./quiz";

export type QuestionImportStatus = "uploaded" | "processing" | "review" | "completed" | "failed";
export type DraftReviewStatus = "pending" | "approved" | "rejected" | "needs_review";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionType = "objective" | "essay";
export type QuestionAssetType = "question_image" | "diagram" | "graph" | "table" | "reference_image" | "option_image";

export type QuestionImportRow = {
  id: string;
  uploaded_by?: string;
  file_name: string;
  storage_path?: string;
  source_title: string | null;
  status: QuestionImportStatus;
  processing_stage: string | null;
  total_detected: number;
  total_imported: number;
  processing_error: string | null;
  created_at: string;
  completed_at: string | null;
  uploaded_by_name?: string | null;
  total_count?: number;
};

export type DraftOption = {
  id?: string;
  option_label: string | null;
  option_text: string | null;
  option_image_url: string | null;
  is_correct: boolean | null;
  sort_order: number;
};

export type DraftAsset = {
  id: string;
  asset_type: QuestionAssetType;
  file_url: string;
  sort_order: number;
};

export type ImportedQuestionDraft = {
  id: string;
  import_id: string;
  imported_question_id: string | null;
  source_question_number: string | null;
  question_type: QuestionType;
  section: PkskSectionCode | null;
  category: string | null;
  topic: string | null;
  difficulty: QuestionDifficulty | null;
  question_text: string;
  question_image_url: string | null;
  correct_option_label: string | null;
  explanation: string | null;
  confidence: number | null;
  review_status: DraftReviewStatus;
  essay_min_words: number | null;
  essay_time_limit: number | null;
  created_at: string;
  options: DraftOption[];
  assets: DraftAsset[];
};

export type ManualQuestionInput = {
  question_type: QuestionType;
  section: PkskSectionCode;
  question_text: string;
  category?: string | null;
  topic?: string | null;
  difficulty: QuestionDifficulty;
  question_image_url?: string | null;
  explanation?: string | null;
  correct_option_label?: string | null;
  essay_min_words?: number | null;
  essay_time_limit?: number | null;
  options: DraftOption[];
};
