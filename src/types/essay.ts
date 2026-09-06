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

export type EssayAnswerMethod = "typed" | "scan" | "upload";

export type EssayFilePreview = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  previewUrl: string | null;
};

export type EssayFilePayload = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type EssayTranscriptionResult = {
  transcription: string;
  pages: number;
  warnings?: string[];
  disclaimer: string;
};

export type EssayRubricKey = "taskFulfilment" | "ideasAndKBAT" | "ihcp" | "organisation" | "language" | "vocabulary" | "clarity";

export type EssayRubricScore = {
  score: number;
  maxScore: number;
  feedback: string;
};

export type EssayIHCPStatus = "good" | "partial" | "missing";

export type EssayIHCPItem = {
  status: EssayIHCPStatus;
  feedback: string;
};

export type EssayParagraphAnalysis = {
  paragraph: number;
  type: string;
  feedback: string;
  ihcp?: {
    I: EssayIHCPItem;
    H: EssayIHCPItem;
    C: EssayIHCPItem;
    P: EssayIHCPItem;
  };
};

export type EssayLanguageIssue = {
  original: string;
  suggestion: string;
  type: "ejaan" | "tatabahasa" | "tanda_baca" | "struktur_ayat" | "gaya" | "lain";
};

export type EssayLengthPenalty = {
  applied: boolean;
  reason: string;
  scoreCap: number | null;
};

export type EssayGradingScores = Record<EssayRubricKey, EssayRubricScore>;

export type EssayGradingResult = {
  totalScore: number;
  pkskEstimatedScore: number;
  level: "Cemerlang" | "Sangat Baik" | "Baik" | "Memuaskan" | "Perlu Dipertingkatkan" | "Perlu Banyak Latihan";
  wordCount: number;
  scores: EssayGradingScores;
  strengths: string[];
  improvements: string[];
  nextAction: string;
  paragraphAnalysis: EssayParagraphAnalysis[];
  languageIssues: EssayLanguageIssue[];
  lengthPenalty: EssayLengthPenalty;
  disclaimer: "Markah Anggaran AI - Untuk Tujuan Latihan" | "Markah Anggaran AI – Untuk Tujuan Latihan";
};

export type EssayGradingRequest = {
  attemptId?: string;
  level: string;
  question: string;
  instruction?: string;
  minimumWords: number;
  studentAnswer: string;
};
