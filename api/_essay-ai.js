export const AI_DISCLAIMER = "Markah Anggaran AI – Untuk Tujuan Latihan";

export const RUBRIC_MAX = {
  taskFulfilment: 15,
  ideasAndKBAT: 25,
  ihcp: 20,
  organisation: 15,
  language: 15,
  vocabulary: 5,
  clarity: 5,
};

export const RUBRIC_KEYS = Object.keys(RUBRIC_MAX);

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw publicError(503, "Semakan AI belum dikonfigurasi. Sila tambah OPENAI_API_KEY dalam environment variable Vercel.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const openAiMessage = data?.error?.message || responseText;
      console.error("OpenAI API error", response.status, openAiMessage);
      if (response.status === 429) {
        throw publicError(429, "AI sedang sibuk. Sila cuba semula sebentar lagi.");
      }
      if (response.status === 401) {
        throw publicError(503, "OpenAI API key tidak sah. Sila semak environment variable OPENAI_API_KEY.");
      }
      if (response.status === 400) {
        throw publicError(502, "Konfigurasi semakan AI belum serasi. Sila semak model OpenAI dan format output JSON.");
      }
      if (response.status === 403 || response.status === 404) {
        throw publicError(503, "Model AI untuk semakan belum tersedia pada akaun OpenAI ini. Sila semak OPENAI_MODEL atau OPENAI_GRADING_MODEL.");
      }
      throw publicError(502, "AI belum dapat memproses jawapan ini. Sila cuba semula atau gunakan kaedah lain.");
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw publicError(504, "Semakan AI mengambil masa terlalu lama. Sila cuba semula dengan gambar yang lebih jelas atau teks yang lebih pendek.");
    }
    if (error instanceof TypeError) {
      throw publicError(502, "Sambungan ke OpenAI belum berjaya. Sila cuba semula sebentar lagi atau maklumkan pentadbir.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractOutputText(data) {
  if (data?.status === "incomplete") {
    const reason = data?.incomplete_details?.reason;
    if (reason === "max_output_tokens") {
      throw publicError(502, "AI berhenti sebelum semakan lengkap. Sila cuba semula dengan teks yang lebih jelas atau lebih pendek.");
    }
    throw publicError(502, "AI belum menyiapkan semakan penuh. Sila cuba semula sebentar lagi.");
  }

  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  const parts = [];
  collectText(data?.output, parts);
  return parts.join("\n").trim();
}

function collectText(value, parts) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, parts));
    return;
  }
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (typeof value !== "object") return;

  if (value.type === "output_text" && typeof value.text === "string") {
    parts.push(value.text);
  }
  if (typeof value.text === "string" && value.type !== "input_text") {
    parts.push(value.text);
  }
  if (value.content) collectText(value.content, parts);
  if (value.output) collectText(value.output, parts);
}

export function parseJsonOutput(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  if (!cleaned) {
    throw publicError(502, "AI tidak memulangkan keputusan semakan. Sila cuba semula.");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw publicError(502, "AI memberi format jawapan yang tidak lengkap. Sila cuba semula.");
      }
    }
    throw publicError(502, "AI memberi format jawapan yang tidak lengkap. Sila cuba semula.");
  }
}

export function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function normalizeGrading(raw, { minimumWords, studentAnswer }) {
  const wordCount = countWords(studentAnswer);
  const scores = {};

  for (const key of RUBRIC_KEYS) {
    const maxScore = RUBRIC_MAX[key];
    const item = raw?.scores?.[key] || {};
    scores[key] = {
      score: clampNumber(item.score, 0, maxScore),
      maxScore,
      feedback: sanitizeText(item.feedback) || "Belum ada maklum balas khusus.",
    };
  }

  const rawTotal = RUBRIC_KEYS.reduce((sum, key) => sum + scores[key].score, 0);
  const lengthPenalty = buildLengthPenalty(wordCount, minimumWords);
  const totalScore = lengthPenalty.scoreCap == null ? rawTotal : Math.min(rawTotal, lengthPenalty.scoreCap);
  const roundedTotal = Math.round(totalScore);

  return {
    totalScore: roundedTotal,
    pkskEstimatedScore: Number((roundedTotal / 10).toFixed(1)),
    level: levelForScore(roundedTotal),
    wordCount,
    scores,
    strengths: sanitizeList(raw?.strengths, ["Jawapan sudah menunjukkan usaha menjawab tajuk."]),
    improvements: sanitizeList(raw?.improvements, ["Tambah huraian dan contoh yang lebih jelas untuk menguatkan isi."]),
    nextAction: sanitizeText(raw?.nextAction) || "Cuba pastikan setiap isi mempunyai huraian dan contoh yang jelas.",
    paragraphAnalysis: normalizeParagraphs(raw?.paragraphAnalysis),
    languageIssues: normalizeLanguageIssues(raw?.languageIssues),
    lengthPenalty,
    disclaimer: AI_DISCLAIMER,
  };
}

function buildLengthPenalty(wordCount, minimumWords) {
  const target = Math.max(1, Number(minimumWords) || 100);
  const ratio = wordCount / target;
  let scoreCap = null;

  if (ratio < 0.6) scoreCap = 55;
  else if (ratio < 0.8) scoreCap = 70;
  else if (ratio < 1) scoreCap = 85;

  return {
    applied: scoreCap !== null,
    reason:
      scoreCap === null
        ? "Panjang karangan mencapai sasaran minimum. Tiada cap markah panjang digunakan."
        : `Karangan anda mempunyai ${wordCount} patah perkataan. Minimum sasaran ialah ${target} patah perkataan. Oleh itu, skor maksimum latihan bagi penulisan ini ialah ${scoreCap}/100.`,
    scoreCap,
  };
}

function normalizeParagraphs(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return [
      {
        paragraph: 1,
        type: "Keseluruhan",
        feedback: "AI belum dapat memecahkan karangan kepada perenggan yang jelas. Cuba gunakan perenggan berasingan untuk setiap isi.",
        ihcp: null,
      },
    ];
  }

  return paragraphs.slice(0, 8).map((item, index) => ({
    paragraph: Number(item?.paragraph) || index + 1,
    type: sanitizeText(item?.type) || "Perenggan",
    feedback: sanitizeText(item?.feedback) || "Perenggan ini telah disemak.",
    ihcp: normalizeIhcp(item?.ihcp),
  }));
}

function normalizeIhcp(ihcp) {
  if (!ihcp || typeof ihcp !== "object") return null;
  return {
    I: normalizeIhcpItem(ihcp.I),
    H: normalizeIhcpItem(ihcp.H),
    C: normalizeIhcpItem(ihcp.C),
    P: normalizeIhcpItem(ihcp.P),
  };
}

function normalizeIhcpItem(item) {
  const status = ["good", "partial", "missing"].includes(item?.status) ? item.status : "partial";
  return {
    status,
    feedback: sanitizeText(item?.feedback) || "Semak semula bahagian ini.",
  };
}

function normalizeLanguageIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.slice(0, 8).map((issue) => ({
    original: sanitizeText(issue?.original),
    suggestion: sanitizeText(issue?.suggestion),
    type: ["ejaan", "tatabahasa", "tanda_baca", "struktur_ayat", "gaya", "lain"].includes(issue?.type) ? issue.type : "lain",
  }));
}

function sanitizeList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, 5);
  return list.length ? list : fallback;
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function levelForScore(score) {
  if (score >= 90) return "Cemerlang";
  if (score >= 80) return "Sangat Baik";
  if (score >= 70) return "Baik";
  if (score >= 60) return "Memuaskan";
  if (score >= 50) return "Perlu Dipertingkatkan";
  return "Perlu Banyak Latihan";
}

export function publicError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

export function handleApiError(res, error, fallback = "Permintaan tidak berjaya. Sila cuba semula.") {
  console.error(error);
  sendJson(res, error?.statusCode || 500, { message: error?.publicMessage || fallback });
}

export const gradingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "totalScore",
    "pkskEstimatedScore",
    "level",
    "wordCount",
    "scores",
    "strengths",
    "improvements",
    "nextAction",
    "paragraphAnalysis",
    "languageIssues",
    "lengthPenalty",
    "disclaimer",
  ],
  properties: {
    totalScore: { type: "number" },
    pkskEstimatedScore: { type: "number" },
    level: { type: "string" },
    wordCount: { type: "number" },
    scores: {
      type: "object",
      additionalProperties: false,
      required: RUBRIC_KEYS,
      properties: Object.fromEntries(
        RUBRIC_KEYS.map((key) => [
          key,
          {
            type: "object",
            additionalProperties: false,
            required: ["score", "maxScore", "feedback"],
            properties: {
              score: { type: "number" },
              maxScore: { type: "number" },
              feedback: { type: "string" },
            },
          },
        ]),
      ),
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    nextAction: { type: "string" },
    paragraphAnalysis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["paragraph", "type", "feedback", "ihcp"],
        properties: {
          paragraph: { type: "number" },
          type: { type: "string" },
          feedback: { type: "string" },
          ihcp: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["I", "H", "C", "P"],
                properties: {
                  I: { $ref: "#/$defs/ihcpItem" },
                  H: { $ref: "#/$defs/ihcpItem" },
                  C: { $ref: "#/$defs/ihcpItem" },
                  P: { $ref: "#/$defs/ihcpItem" },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
    languageIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "suggestion", "type"],
        properties: {
          original: { type: "string" },
          suggestion: { type: "string" },
          type: { type: "string", enum: ["ejaan", "tatabahasa", "tanda_baca", "struktur_ayat", "gaya", "lain"] },
        },
      },
    },
    lengthPenalty: {
      type: "object",
      additionalProperties: false,
      required: ["applied", "reason", "scoreCap"],
      properties: {
        applied: { type: "boolean" },
        reason: { type: "string" },
        scoreCap: { anyOf: [{ type: "number" }, { type: "null" }] },
      },
    },
    disclaimer: { type: "string" },
  },
  $defs: {
    ihcpItem: {
      type: "object",
      additionalProperties: false,
      required: ["status", "feedback"],
      properties: {
        status: { type: "string", enum: ["good", "partial", "missing"] },
        feedback: { type: "string" },
      },
    },
  },
};

export const rawGradingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "strengths", "improvements", "nextAction", "paragraphAnalysis", "languageIssues"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: RUBRIC_KEYS,
      properties: Object.fromEntries(
        RUBRIC_KEYS.map((key) => [
          key,
          {
            type: "object",
            additionalProperties: false,
            required: ["score", "feedback"],
            properties: {
              score: { type: "number" },
              feedback: { type: "string" },
            },
          },
        ]),
      ),
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    nextAction: { type: "string" },
    paragraphAnalysis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["paragraph", "type", "feedback", "ihcp"],
        properties: {
          paragraph: { type: "number" },
          type: { type: "string" },
          feedback: { type: "string" },
          ihcp: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["I", "H", "C", "P"],
                properties: {
                  I: { $ref: "#/$defs/ihcpItem" },
                  H: { $ref: "#/$defs/ihcpItem" },
                  C: { $ref: "#/$defs/ihcpItem" },
                  P: { $ref: "#/$defs/ihcpItem" },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
    languageIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "suggestion", "type"],
        properties: {
          original: { type: "string" },
          suggestion: { type: "string" },
          type: { type: "string", enum: ["ejaan", "tatabahasa", "tanda_baca", "struktur_ayat", "gaya", "lain"] },
        },
      },
    },
  },
  $defs: {
    ihcpItem: {
      type: "object",
      additionalProperties: false,
      required: ["status", "feedback"],
      properties: {
        status: { type: "string", enum: ["good", "partial", "missing"] },
        feedback: { type: "string" },
      },
    },
  },
};
