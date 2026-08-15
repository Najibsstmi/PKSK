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

type DecodedPdfStream = {
  objectNumber: number | null;
  dictionary: string;
  content: string;
};

type PdfObject = {
  objectNumber: number;
  body: string;
};

type UnicodeMap = {
  objectNumber: number | null;
  codeSize: number;
  values: Map<number, string>;
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

  const fallbackQuestions = questions.length > 0 ? questions : parseObjectiveQuestions(inferFallbackSection(lines), linesUntilAnswerKey(lines), {});
  const limitedQuestions = fallbackQuestions.slice(0, MAX_EXTRACTED_QUESTIONS);
  const warning = buildWarning(limitedQuestions, text, input.sourceTitle || input.fileName);

  return {
    questions: limitedQuestions,
    warning,
  };
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const binary = bytesToBinaryString(pdfBytes);
  const streams = await decodePdfStreams(binary);
  const unicodeMaps = extractUnicodeMaps(streams);
  const fontMaps = extractFontMaps(binary, unicodeMaps);
  const chunks: string[] = [];

  for (const stream of streams) {
    if (/begincmap|beginbfchar|beginbfrange/i.test(stream.content)) {
      continue;
    }

    const chunk = extractTextOperators(stream.content, unicodeMaps, fontMaps);
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    chunks.push(extractTextOperators(binary, unicodeMaps, fontMaps));
  }

  return chunks.join("\n");
}

async function decodePdfStreams(binary: string): Promise<DecodedPdfStream[]> {
  const streams: DecodedPdfStream[] = [];

  for (const object of parsePdfObjects(binary)) {
    const streamStart = object.body.indexOf("stream");
    const streamEnd = object.body.indexOf("endstream", streamStart);
    if (streamStart < 0 || streamEnd < streamStart) {
      continue;
    }

    const dictionary = object.body.slice(0, streamStart);
    const streamData = object.body.slice(streamStart + "stream".length, streamEnd);
    const rawBytes = binaryStringToBytes(streamData.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
    const decodedBytes = dictionary.includes("/FlateDecode") ? await inflateDeflate(rawBytes) : rawBytes;
    streams.push({
      objectNumber: object.objectNumber,
      dictionary,
      content: bytesToBinaryString(decodedBytes),
    });
  }

  return streams;
}

function parsePdfObjects(binary: string): PdfObject[] {
  const objects: PdfObject[] = [];
  const objectRegex = /(\d+)\s+0\s+obj\b([\s\S]*?)\bendobj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objectRegex.exec(binary))) {
    const objectNumber = Number(match[1]);
    if (!Number.isFinite(objectNumber)) {
      continue;
    }
    objects.push({
      objectNumber,
      body: match[2] ?? "",
    });
  }

  return objects;
}

async function inflateDeflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (!("DecompressionStream" in globalThis)) {
    return bytes;
  }

  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return bytes;
  }
}

function extractUnicodeMaps(streams: DecodedPdfStream[]): UnicodeMap[] {
  const maps: UnicodeMap[] = [];

  for (const stream of streams) {
    if (!/begincmap|beginbfchar|beginbfrange/i.test(stream.content)) {
      continue;
    }

    const values = new Map<number, string>();
    let codeSize = inferCodeSize(stream.content);

    for (const block of stream.content.matchAll(/beginbfchar\s+([\s\S]*?)\s+endbfchar/g)) {
      for (const line of (block[1] ?? "").split(/\r?\n/)) {
        const match = line.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
        if (!match) {
          continue;
        }
        codeSize = Math.max(codeSize, Math.ceil(match[1].length / 2));
        values.set(parseInt(match[1], 16), decodeUnicodeHex(match[2]));
      }
    }

    for (const block of stream.content.matchAll(/beginbfrange\s+([\s\S]*?)\s+endbfrange/g)) {
      for (const line of (block[1] ?? "").split(/\r?\n/)) {
        const arrayMatch = line.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.+)\]/);
        if (arrayMatch) {
          const start = parseInt(arrayMatch[1], 16);
          const destinations = [...arrayMatch[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => match[1]);
          codeSize = Math.max(codeSize, Math.ceil(arrayMatch[1].length / 2));
          destinations.forEach((destination, index) => values.set(start + index, decodeUnicodeHex(destination)));
          continue;
        }

        const rangeMatch = line.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
        if (!rangeMatch) {
          continue;
        }

        const start = parseInt(rangeMatch[1], 16);
        const end = parseInt(rangeMatch[2], 16);
        const destinationStart = parseInt(rangeMatch[3], 16);
        codeSize = Math.max(codeSize, Math.ceil(rangeMatch[1].length / 2));

        for (let code = start; code <= end; code += 1) {
          values.set(code, String.fromCodePoint(destinationStart + code - start));
        }
      }
    }

    if (values.size > 0) {
      maps.push({ objectNumber: stream.objectNumber, codeSize, values });
    }
  }

  return maps;
}

function extractFontMaps(binary: string, unicodeMaps: UnicodeMap[]): Map<string, UnicodeMap> {
  const fontObjectToUnicodeObject = new Map<number, number>();
  const unicodeMapByObject = new Map<number, UnicodeMap>();
  const fontMaps = new Map<string, UnicodeMap>();

  for (const unicodeMap of unicodeMaps) {
    if (unicodeMap.objectNumber !== null) {
      unicodeMapByObject.set(unicodeMap.objectNumber, unicodeMap);
    }
  }

  for (const object of parsePdfObjects(binary)) {
    const objectNumber = object.objectNumber;
    const body = object.body;
    const toUnicodeMatch = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (/\/Type\s*\/Font\b/.test(body) && toUnicodeMatch) {
      fontObjectToUnicodeObject.set(objectNumber, Number(toUnicodeMatch[1]));
    }
  }

  const resourceFontRegex = /\/Font\s*<<([\s\S]*?)>>/g;
  let resourceMatch: RegExpExecArray | null;
  while ((resourceMatch = resourceFontRegex.exec(binary))) {
    const fontBlock = resourceMatch[1] ?? "";
    for (const fontMatch of fontBlock.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const fontName = fontMatch[1];
      const fontObjectNumber = Number(fontMatch[2]);
      const unicodeObjectNumber = fontObjectToUnicodeObject.get(fontObjectNumber);
      const unicodeMap = unicodeObjectNumber ? unicodeMapByObject.get(unicodeObjectNumber) : null;
      if (unicodeMap) {
        fontMaps.set(fontName, unicodeMap);
      }
    }
  }

  return fontMaps;
}

function inferCodeSize(content: string): number {
  const match = content.match(/begincodespacerange\s+([\s\S]*?)\s+endcodespacerange/);
  if (!match) {
    return 1;
  }

  const firstRange = match[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
  return firstRange ? Math.max(1, Math.ceil(firstRange[1].length / 2)) : 1;
}

function extractTextOperators(content: string, unicodeMaps: UnicodeMap[], fontMaps: Map<string, UnicodeMap>): string {
  const output: string[] = [];
  const operatorRegex = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|\[(.*?)\]\s*TJ|(\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>)\s*(?:Tj|'|")/gs;
  let match: RegExpExecArray | null;
  let activeFont: string | null = null;

  while ((match = operatorRegex.exec(content))) {
    if (match[1]) {
      activeFont = match[1];
      continue;
    }

    const activeMap = activeFont ? fontMaps.get(activeFont) ?? null : null;

    if (match[2] !== undefined) {
      const parts = extractPdfStrings(match[2] ?? "", unicodeMaps, activeMap);
      if (parts.length > 0) {
        output.push(parts.join(""));
      }
      continue;
    }

    if (match[3]) {
      const part = decodePdfToken(match[3], unicodeMaps, activeMap);
      if (part) {
        output.push(part);
      }
    }
  }

  return output.join("\n");
}

function extractPdfStrings(arrayContent: string, unicodeMaps: UnicodeMap[], activeMap: UnicodeMap | null): string[] {
  const parts: string[] = [];
  const tokenRegex = /\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(arrayContent))) {
    const decoded = decodePdfToken(match[0], unicodeMaps, activeMap);
    if (decoded) {
      parts.push(decoded);
    }
  }
  return parts;
}

function decodePdfToken(token: string, unicodeMaps: UnicodeMap[], activeMap: UnicodeMap | null): string {
  const bytes = token.startsWith("<") ? hexTokenToBytes(token) : literalTokenToBytes(token);
  const fallback = token.startsWith("<") ? decodeHexBytes(bytes) : normalizeText(new TextDecoder("windows-1252").decode(bytes));

  if (activeMap) {
    const decoded = decodeBytesWithUnicodeMap(bytes, activeMap);
    if (decoded && decoded.mappedCount > 0) {
      return normalizeText(decoded.text);
    }
  }

  const mapped = decodeWithBestUnicodeMap(bytes, unicodeMaps, fallback);
  return mapped ?? fallback;
}

function decodeWithBestUnicodeMap(bytes: Uint8Array, unicodeMaps: UnicodeMap[], fallback: string): string | null {
  let bestText: string | null = null;
  let bestScore = scoreDecodedText(fallback);

  for (const unicodeMap of unicodeMaps) {
    const candidate = decodeBytesWithUnicodeMap(bytes, unicodeMap);
    if (!candidate || candidate.mappedCount === 0) {
      continue;
    }

    const score = scoreDecodedText(candidate.text) + candidate.mappedCount * 0.15 - candidate.missingCount * 2;
    if (score > bestScore + 1) {
      bestScore = score;
      bestText = candidate.text;
    }
  }

  return bestText ? normalizeText(bestText) : null;
}

function decodeBytesWithUnicodeMap(bytes: Uint8Array, unicodeMap: UnicodeMap): { text: string; mappedCount: number; missingCount: number } | null {
  if (bytes.length === 0) {
    return null;
  }

  let text = "";
  let mappedCount = 0;
  let missingCount = 0;
  const step = unicodeMap.codeSize;

  for (let index = 0; index < bytes.length; index += step) {
    if (index + step > bytes.length) {
      missingCount += 1;
      text += String.fromCharCode(bytes[index]);
      continue;
    }

    let code = 0;
    for (let offset = 0; offset < step; offset += 1) {
      code = (code << 8) | bytes[index + offset];
    }

    const mapped = unicodeMap.values.get(code);
    if (mapped) {
      text += mapped;
      mappedCount += 1;
    } else {
      missingCount += 1;
      text += step === 1 ? String.fromCharCode(code) : "";
    }
  }

  return { text, mappedCount, missingCount };
}

function scoreDecodedText(value: string): number {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }

  const readableChars = (normalized.match(/[A-Za-z0-9 .,;:?!'"()/%\-]/g) ?? []).length;
  const commonWords = (normalized.match(/\b(soalan|bahagian|kecerdasan|insaniah|intelek|anda|apa|guru|rakan|semasa|dalam|tindakan|jawapan|kelas|kumpulan|tahun|murid)\b/gi) ?? []).length;
  const noisyChars = (normalized.match(/[^\x20-\x7E\u00A0-\u024F]/g) ?? []).length;
  return readableChars / normalized.length + commonWords * 8 - noisyChars * 3;
}

function literalTokenToBytes(token: string): Uint8Array {
  const inner = token.slice(1, -1);
  const bytes: number[] = [];

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char !== "\\") {
      bytes.push(inner.charCodeAt(index) & 0xff);
      continue;
    }

    const next = inner[index + 1];
    if (next === "\r" || next === "\n") {
      index += next === "\r" && inner[index + 2] === "\n" ? 2 : 1;
      continue;
    }

    const octal = inner.slice(index + 1).match(/^[0-7]{1,3}/)?.[0];
    if (octal) {
      bytes.push(parseInt(octal, 8) & 0xff);
      index += octal.length;
      continue;
    }

    const escapes: Record<string, number> = {
      n: 10,
      r: 13,
      t: 9,
      b: 8,
      f: 12,
      "(": 40,
      ")": 41,
      "\\": 92,
    };
    bytes.push(escapes[next] ?? next.charCodeAt(0));
    index += 1;
  }

  return new Uint8Array(bytes);
}

function hexTokenToBytes(token: string): Uint8Array {
  const hex = token.slice(1, -1).replace(/\s+/g, "");
  if (!hex) {
    return new Uint8Array();
  }

  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2).padEnd(2, "0"), 16);
  }

  return bytes;
}

function decodeHexBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return normalizeText(decodeUtf16Be(bytes.slice(2)));
  }

  if (bytes.length > 3 && bytes.filter((_, index) => index % 2 === 0 && bytes[index] === 0).length > bytes.length / 4) {
    return normalizeText(decodeUtf16Be(bytes));
  }

  return normalizeText(new TextDecoder("windows-1252").decode(bytes));
}

function decodeUnicodeHex(hex: string): string {
  const bytes = hexTokenToBytes(`<${hex}>`);
  if (bytes.length <= 1) {
    return String.fromCharCode(bytes[0] ?? 0);
  }
  return decodeUtf16Be(bytes);
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
    const labelledQuestionMatch = line.match(/^soalan\s*(\d{1,3})(?:[\s:.-]+(.+))?$/i);
    const optionMatch = line.match(/^([A-D])[\.)]\s*(.+)$/i);

    if (questionMatch || labelledQuestionMatch) {
      flushQuestion();
      const number = questionMatch?.[1] ?? labelledQuestionMatch?.[1] ?? "";
      const text = questionMatch?.[2] ?? labelledQuestionMatch?.[2] ?? "";
      current = {
        number,
        section,
        questionParts: text ? [text] : [],
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

function inferFallbackSection(lines: string[]): "A" | "B" {
  const joined = lines.slice(0, 40).join("").replace(/\s+/g, "").toLowerCase();
  if (joined.includes("bahagiana") || joined.includes("kecerdasaninsaniah")) {
    return "A";
  }
  return "B";
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
  return (
    HEADER_PATTERNS.some((pattern) => pattern.test(line)) ||
    /soalan\s+objektif/i.test(line) ||
    /^\d+\s*\|\s*page$/i.test(line) ||
    /^t\.me\//i.test(line) ||
    /^page$/i.test(line) ||
    /^ukkm$/i.test(line) ||
    /^[|_=.-]$/.test(line) ||
    isNoisyPdfLine(line)
  );
}

function isNoisyPdfLine(line: string): boolean {
  const controlOrBinary = (line.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u00FE\u00FF]/g) ?? []).length;
  if (controlOrBinary >= 3) {
    return true;
  }

  if (line.length < 80) {
    return false;
  }

  const noisy = (line.match(/[^\x20-\x7E\u00A0-\u024F]/g) ?? []).length;
  return noisy / line.length > 0.12;
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
