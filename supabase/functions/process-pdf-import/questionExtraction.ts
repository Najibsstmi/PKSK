export type ExtractedOption = {
  option_label: string | null;
  option_text: string | null;
  option_image_url: string | null;
  is_correct: boolean | null;
  sort_order: number;
};

export type ExtractedAsset = {
  asset_type: "question_image" | "diagram" | "graph" | "table" | "reference_image" | "option_image";
  file_url: string;
  sort_order: number;
};

export type ExtractedQuestion = {
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
  options: ExtractedOption[];
  assets: ExtractedAsset[];
};

export type PdfExtractionResult = {
  questions: ExtractedQuestion[];
  warning: string | null;
};

export async function extractQuestionsFromPdf(input: {
  pdfBytes: Uint8Array;
  fileName: string;
  sourceTitle: string | null;
}): Promise<PdfExtractionResult> {
  await Promise.resolve(input);

  throw new Error(
    "External AI PDF extraction is not enabled. The PDF remains in Supabase Storage and was not sent to any external AI provider.",
  );
}
