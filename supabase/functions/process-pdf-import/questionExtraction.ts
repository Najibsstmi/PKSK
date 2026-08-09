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

type MutableQuestion = {
  number: string;
  section: "A" | "B" | "C";
  questionParts: string[];
  options: Array<{ label: string; parts: string[] }>;
};

const MAX_EXTRACTED_QUESTIONS = 500;
const HEADER_PATTERNS = [
  /^bahagian\s+[abc]\b/i,
  /^jawapan\b/i,
  /^masa\s*:/i,
  /^pilih\s+/i,
  /^menguji\s+/i,
  /^iq[,:\s]/i,
  /^ssq[,:\s]/i,
];

export async function extractQuestionsFromPdf(input: {
  pdfBytes: Uint8Array;
  fileName: string;
  sourceTitle: string | null;
}): Promise<PdfExtractionResult> {
  const text = await extractPdfText(input.pdfBytes);
  const lines = cleanLines(text);

  if (lines.length < 5) {
    throw new Error("PDF berjaya dimuat turun tetapi teks tidak dapat dibaca. Jika fail ini ialah scan/gambar, ia perlukan OCR atau AI extraction selepas diberi kebenaran.");
  }

  const answerKeys = {
    A: parseAnswerKey(lines, "A"),
    B: parseAnswerKey(lines, "B"),
  };

  const questions = [
    ...parseObjectiveQuestions("A", sectionLines(lines, "A"), answerKeys.A),
    ...parseObjectiveQuestions("B", sectionLines(lines, "B"), answerKeys.B),
    ...parseEssayQuestions(lines),
  ];

  const fallbackQuestions = questions.length > 0 ? questions : parseObjectiveQuestions("B", linesUntilAnswerKey(lines), {});
  const limitedQuestions = fallbackQuestions.slice(0, MAX_EXTRACTED_QUESTIONS);
  const warning = buildWarning(limitedQuestions, text, input.sourceTitle || input.fileName);

  return {
    questions: limitedQuestions,
    warning,
  };
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const binary = bytesToBinaryString(pdfBytes);
  const chunks: string[] = [];
  const streamRegex = /<<(?:.|\r|\n)*?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(binary))) {
    const fullMatch = match[0];
    const streamData = match[1] ?? "";
    const dictionary = fullMatch.slice(0, Math.max(0, fullMatch.indexOf("stream")));
    const rawBytes = binaryStringToBytes(streamData.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
    const decodedBytes = dictionary.includes("/FlateDecode") ? await inflateDeflate(rawBytes) : rawBytes;
    const chunk = extractTextOperators(bytesToBinaryString(decodedBytes));
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    chunks.push(extractTextOperators(binary));
  }

  return chunks.join("\n");
}

async function inflateDeflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (!("DecompressionStream" in globalThis)) {
    return bytes;
  }

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return bytes;
  }
}

function extractTextOperators(content: string): string {
  const output: string[] = [];
  const arrayTextRegex = /\[(.*?)\]\s*TJ/gs;
  const singleTextRegex = /(\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>)\s*(?:Tj|'|")/g;
  let match: RegExpExecArray | null;

  while ((match = arrayTextRegex.exec(content))) {
    const parts = extractPdfStrings(match[1] ?? "");
    if (parts.length > 0) {
      output.push(parts.join(""));
    }
  }

  while ((match = singleTextRegex.exec(content))) {
    const part = decodePdfToken(match[1] ?? "");
    if (part) {
      output.push(part);
    }
  }

  return output.join("\n");
}

function extractPdfStrings(arrayContent: string): string[] {
  const parts: string[] = [];
  const tokenRegex = /\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(arrayContent))) {
    const decoded = decodePdfToken(match[0]);
    if (decoded) {
      parts.push(decoded);
    }
  }
  return parts;
}

function decodePdfToken(token: string): string {
  if (token.startsWith("<")) {
    return decodeHexString(token);
  }
  return decodeLiteralString(token);
}

function decodeLiteralString(token: string): string {
  const inner = token.slice(1, -1);
  const decoded = inner
    .replace(/\\([nrtbf()\\])/g, (_, value: string) => {
      const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      return map[value] ?? value;
    })
    .replace(/\\(\d{1,3})/g, (_, value: string) => String.fromCharCode(parseInt(value, 8)))
    .replace(/\\\r?\n/g, "");

  return normalizeText(decoded);
}

function decodeHexString(token: string): string {
  const hex = token.slice(1, -1).replace(/\s+/g, "");
  if (!hex) {
    return "";
  }

  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2).padEnd(2, "0"), 16);
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return normalizeText(decodeUtf16Be(bytes.slice(2)));
  }

  if (bytes.length > 3 && bytes.filter((_, index) => index % 2 === 0 && bytes[index] === 0).length > bytes.length / 4) {
    return normalizeText(decodeUtf16Be(bytes));
  }

  return normalizeText(new TextDecoder("windows-1252").decode(bytes));
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return value;
}

function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeText)
    .filter((line) => line.length > 0)
    .filter((line) => !/^-+\s*page\s+\d+\s*-+$/i.test(line))
    .filter((line) => !/^\d+\s*$/.test(line));
}

function sectionLines(lines: string[], section: "A" | "B"): string[] {
  const start = lines.findIndex((line) => new RegExp(`bahagian\\s+${section}\\b`, "i").test(line));
  if (start < 0) {
    return [];
  }

  const nextSection = section === "A" ? "B" : "C";
  const end = lines.findIndex((line, index) => index > start && (new RegExp(`bahagian\\s+${nextSection}\\b`, "i").test(line) || /^jawapan\b/i.test(line)));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function linesUntilAnswerKey(lines: string[]): string[] {
  const end = lines.findIndex((line) => /^jawapan\b/i.test(line));
  return lines.slice(0, end > 0 ? end : undefined);
}

function parseAnswerKey(lines: string[], section: "A" | "B"): Record<string, string> {
  const answers: Record<string, string> = {};
  const marker = new RegExp(`jawapan.*bahagian\\s+${section}|bahagian\\s+${section}.*jawapan`, "i");
  const start = lines.findIndex((line) => marker.test(line));
  if (start < 0) {
    return answers;
  }

  for (const line of lines.slice(start + 1)) {
    if (/^jawapan\b/i.test(line) || /^bahagian\s+c\b/i.test(line)) {
      break;
    }
    for (const match of line.matchAll(/(\d+)\s*[-:.]\s*([A-D])/gi)) {
      answers[match[1]] = match[2].toUpperCase();
    }
  }

  return answers;
}

function parseObjectiveQuestions(section: "A" | "B", lines: string[], answers: Record<string, string>): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  let current: MutableQuestion | null = null;
  let activeOption: { label: string; parts: string[] } | null = null;

  function flushOption() {
    if (current && activeOption) {
      current.options.push(activeOption);
    }
    activeOption = null;
  }

  function flushQuestion() {
    if (!current) {
      return;
    }
    flushOption();
    const questionText = normalizeText(current.questionParts.join(" "));
    if (!questionText) {
      current = null;
      return;
    }

    const correctLabel = answers[current.number] ?? null;
    const options = current.options
      .map((option, index) => ({
        option_label: option.label,
        option_text: normalizeText(option.parts.join(" ")),
        option_image_url: null,
        is_correct: correctLabel ? option.label === correctLabel : null,
        sort_order: index + 1,
      }))
      .filter((option) => option.option_text.length > 0);
    const [category, topic] = categoryFor(section, Number(current.number), questionText);
    const confidence = options.length >= 2 ? (correctLabel ? 0.88 : 0.66) : 0.42;

    questions.push({
      source_question_number: current.number,
      question_type: "objective",
      section,
      category,
      topic,
      difficulty: "medium",
      question_text: questionText,
      question_image_url: null,
      correct_option_label: correctLabel,
      explanation: null,
      confidence,
      review_status: confidence >= 0.7 ? "pending" : "needs_review",
      essay_min_words: null,
      essay_time_limit: null,
      options,
      assets: [],
    });

    current = null;
  }

  for (const line of lines) {
    if (shouldIgnoreLine(line)) {
      continue;
    }

    const questionMatch = line.match(/^(\d{1,3})[\.)]\s*(.+)$/);
    const optionMatch = line.match(/^([A-D])[\.)]\s*(.+)$/i);

    if (questionMatch) {
      flushQuestion();
      current = {
        number: questionMatch[1],
        section,
        questionParts: [questionMatch[2]],
        options: [],
      };
      continue;
    }

    if (optionMatch && current) {
      flushOption();
      activeOption = {
        label: optionMatch[1].toUpperCase(),
        parts: [optionMatch[2]],
      };
      continue;
    }

    if (activeOption) {
      activeOption.parts.push(line);
    } else if (current) {
      current.questionParts.push(line);
    }
  }

  flushQuestion();
  return questions;
}

function parseEssayQuestions(lines: string[]): ExtractedQuestion[] {
  const start = lines.findIndex((line) => /^bahagian\s+c\b/i.test(line));
  if (start < 0) {
    return [];
  }

  const questions: ExtractedQuestion[] = [];
  let currentNumber: string | null = null;
  let currentTitle = "";
  let currentParts: string[] = [];

  function flushEssay() {
    if (!currentNumber || !currentTitle) {
      return;
    }
    const prompt = normalizeText(currentParts.join(" "));
    questions.push({
      source_question_number: currentNumber,
      question_type: "essay",
      section: "C",
      category: "Penulisan",
      topic: currentTitle,
      difficulty: "medium",
      question_text: prompt ? `${currentTitle}: ${prompt}` : currentTitle,
      question_image_url: null,
      correct_option_label: null,
      explanation: null,
      confidence: 0.76,
      review_status: "pending",
      essay_min_words: 100,
      essay_time_limit: 45,
      options: [],
      assets: [],
    });
    currentNumber = null;
    currentTitle = "";
    currentParts = [];
  }

  for (const line of lines.slice(start + 1)) {
    if (/^jawapan\b/i.test(line)) {
      break;
    }
    const match = line.match(/^(\d{1,3})[\.)]\s*(.+)$/);
    if (match) {
      flushEssay();
      currentNumber = match[1];
      currentTitle = normalizeText(match[2]);
      continue;
    }
    if (currentNumber) {
      currentParts.push(line);
    }
  }

  flushEssay();
  return questions;
}

function categoryFor(section: "A" | "B", number: number, questionText: string): [string, string] {
  const lowered = questionText.toLowerCase();
  if (section === "A") {
    if (containsAny(lowered, ["rakan", "kawan", "kumpulan", "kelas"])) {
      return ["SSQ", "Kemahiran Sosial"];
    }
    if (containsAny(lowered, ["guru", "ibu bapa", "tanggungjawab", "pengawas"])) {
      return ["SQ", "Nilai dan Tanggungjawab"];
    }
    return ["EQ", "Emosi dan Sahsiah"];
  }

  if (number >= 46 && number <= 55 || containsAny(lowered, ["choose", "opposite", "sentence", "plural", "synonym"])) {
    return ["English", "Bahasa Inggeris"];
  }
  if (number >= 11 && number <= 25 || /\d|pecahan|peratus|luas|sudut|purata|km|jam/i.test(lowered)) {
    return ["Matematik", "Matematik Logik"];
  }
  if (containsAny(lowered, ["planet", "vitamin", "air", "haiwan", "tumbuhan", "suhu", "lapisan", "ikan", "organ"])) {
    return ["Sains", "Sains dan Alam Sekitar"];
  }
  if (containsAny(lowered, ["peribahasa", "bahasa", "maksud"])) {
    return ["Bahasa Melayu", "Bahasa dan Peribahasa"];
  }
  if (number <= 10) {
    return ["Logik", "Penaakulan"];
  }
  return ["Pengetahuan Am", "Pengetahuan Am"];
}

function shouldIgnoreLine(line: string): boolean {
  return HEADER_PATTERNS.some((pattern) => pattern.test(line)) || /soalan\s+objektif/i.test(line);
}

function buildWarning(questions: ExtractedQuestion[], extractedText: string, sourceName: string): string | null {
  if (questions.length === 0) {
    return `Tiada draft soalan berjaya dikesan daripada ${sourceName}. PDF mungkin berbentuk scan/gambar atau susunan teksnya tidak standard.`;
  }

  const noAnswerKey = questions.filter((question) => question.question_type === "objective" && !question.correct_option_label).length;
  const weak = questions.filter((question) => question.review_status === "needs_review").length;
  const notes: string[] = [];

  if (noAnswerKey > 0) {
    notes.push(`${noAnswerKey} soalan objektif tiada jawapan betul yang jelas.`);
  }
  if (weak > 0) {
    notes.push(`${weak} draft perlukan semakan manual.`);
  }
  if (extractedText.length < 1000) {
    notes.push("Teks PDF yang dapat dibaca agak pendek; semak jika fail ialah scan/gambar.");
  }

  return notes.length > 0 ? notes.join(" ") : null;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([?.!,;:])/g, "$1")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let value = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    value += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return value;
}

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}
