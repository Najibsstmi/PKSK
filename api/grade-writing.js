import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  AI_DISCLAIMER,
  callOpenAIChatCompletion,
  extractChatCompletionText,
  handleApiError,
  normalizeGrading,
  parseJsonOutput,
  publicError,
  rawGradingJsonSchema,
  readJsonBody,
  sendJson,
} from "./_essay-ai.js";

const systemPrompt = `Anda ialah pemeriksa latihan Artikulasi Penulisan PKSK untuk murid sekolah Malaysia.
Nilai jawapan berdasarkan rubrik yang diberikan sahaja.
Jangan mereka-reka rubrik sendiri.
Jangan beri markah tinggi hanya kerana karangan panjang, peribahasa, atau bahasa berbunga.
Utamakan kehendak tugasan, kualiti isi, KBAT, huraian, contoh, organisasi, bahasa dan kejelasan.
Nilai pada tahap umur calon. Jangan bandingkan murid sekolah dengan standard universiti.
Berikan penilaian yang membina tetapi jujur.
Jangan tulis semula keseluruhan karangan.
Kenal pasti I-H-C-P bagi setiap perenggan isi jika dapat dikenal pasti.
Output mesti JSON sahaja mengikut format yang diminta.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Kaedah permintaan tidak disokong." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const attemptId = sanitizeText(body?.attemptId);
    const attemptContext = attemptId ? await resolveEssayAttemptContext(req, attemptId) : null;
    const level = sanitizeText(body?.level) || "Tahun 6";
    const question = attemptContext?.questionText ?? sanitizeText(body?.question);
    const instruction = sanitizeText(body?.instruction);
    const minimumWords = attemptContext?.minimumWords ?? (Number(body?.minimumWords) || 100);
    const studentAnswer = sanitizeText(body?.studentAnswer);

    if (!question) {
      throw publicError(400, "Soalan Bahagian C tidak lengkap untuk pemarkahan.");
    }
    if (!studentAnswer) {
      throw publicError(400, "Tulis atau sahkan jawapan dahulu sebelum semakan AI.");
    }

    const data = await callOpenAIChatCompletion({
      model: process.env.OPENAI_GRADING_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt({ level, question, instruction, minimumWords, studentAnswer }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pksk_essay_grading",
          strict: true,
          schema: rawGradingJsonSchema,
        },
      },
    });

    const output = extractChatCompletionText(data);
    const raw = parseJsonOutput(output);
    const result = normalizeGrading(raw, { minimumWords, studentAnswer });
    if (attemptContext) {
      await persistEssayGradingResult(attemptContext, studentAnswer, result);
    }
    sendJson(res, 200, result);
  } catch (error) {
    handleApiError(res, error, "Semakan markah AI belum berjaya. Sila cuba semula, atau semak transkripsi dan hantar semula.");
  }
}

async function resolveEssayAttemptContext(req, attemptId) {
  const token = getBearerToken(req);
  if (!token) {
    throw publicError(401, "Sesi log masuk diperlukan untuk menyimpan markah Bahagian C.");
  }

  const client = createSupabaseAdminClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser(token);

  if (authError || !user) {
    throw publicError(401, "Sesi log masuk tamat. Sila log masuk semula dan hantar jawapan sekali lagi.");
  }

  const { data: attempt, error: attemptError } = await client
    .from("quiz_attempts")
    .select("id,user_id,status,section,mode")
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptError) {
    throwDatabaseError("load essay attempt", attemptError);
  }
  if (!attempt || attempt.user_id !== user.id || attempt.section !== "C" || attempt.mode !== "section") {
    throw publicError(404, "Cubaan Bahagian C tidak ditemui untuk akaun ini.");
  }

  const { data: attemptQuestion, error: attemptQuestionError } = await client
    .from("attempt_questions")
    .select("question_id")
    .eq("attempt_id", attemptId)
    .limit(1)
    .maybeSingle();

  if (attemptQuestionError) {
    throwDatabaseError("load essay attempt question", attemptQuestionError);
  }
  if (!attemptQuestion?.question_id) {
    throw publicError(404, "Soalan Bahagian C tidak ditemui untuk cubaan ini.");
  }

  const { data: question, error: questionError } = await client
    .from("questions")
    .select("id,section,question_type,question_text,essay_min_words")
    .eq("id", attemptQuestion.question_id)
    .maybeSingle();

  if (questionError) {
    throwDatabaseError("load essay question", questionError);
  }
  if (!question || question.section !== "C" || question.question_type !== "essay") {
    throw publicError(404, "Soalan Bahagian C tidak sah untuk cubaan ini.");
  }

  return {
    client,
    attemptId,
    questionId: question.id,
    userId: user.id,
    questionText: question.question_text,
    minimumWords: Number(question.essay_min_words) || 100,
  };
}

async function persistEssayGradingResult(context, studentAnswer, result) {
  const { error } = await context.client.from("essay_grading_results").upsert(
    {
      attempt_id: context.attemptId,
      question_id: context.questionId,
      user_id: context.userId,
      answer_hash: hashEssayAnswer(studentAnswer),
      total_score: result.totalScore,
      pksk_estimated_score: result.pkskEstimatedScore,
      grading_level: result.level,
      word_count: result.wordCount,
      grading_result: result,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id" },
  );

  if (error) {
    throwDatabaseError("save essay grading result", error);
  }
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw publicError(503, "Penyimpanan markah Bahagian C belum dikonfigurasi pada server.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== "string") {
    return "";
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function hashEssayAnswer(answer) {
  return createHash("md5").update(normalizeEssayAnswer(answer), "utf8").digest("hex");
}

function normalizeEssayAnswer(answer) {
  return String(answer || "").trim().replace(/\s+/g, " ");
}

function throwDatabaseError(action, error) {
  console.error(`Supabase ${action} error`, error?.message || error);
  throw publicError(502, "Markah AI belum dapat disimpan. Sila cuba hantar semula sebentar lagi.");
}

function buildUserPrompt({ level, question, instruction, minimumWords, studentAnswer }) {
  return `Tahap calon: ${level}
Soalan Bahagian C: ${question}
Arahan tambahan: ${instruction || "Tiada"}
Minimum sasaran: ${minimumWords} patah perkataan

Rubrik pemarkahan jumlah 100:
1. Menepati Kehendak Tugasan - 15
2. Isi & Kematangan Idea / KBAT - 25
3. Huraian Menggunakan I-H-C-P - 20
4. Organisasi & Struktur Penulisan - 15
5. Bahasa, Tatabahasa & Ejaan - 15
6. Kosa Kata & Gaya Artikulasi - 5
7. Kejelasan & Keyakinan Penulisan - 5

Gunakan cap panjang jika jawapan kurang daripada minimum:
- 100% minimum atau lebih: tiada cap
- 80-99%: maksimum 85/100
- 60-79%: maksimum 70/100
- bawah 60%: maksimum 55/100

Label keputusan mesti menggunakan disclaimer: ${AI_DISCLAIMER}

Kembalikan JSON sahaja tanpa markdown dan tanpa penjelasan luar JSON.
Pastikan setiap feedback ringkas, padat dan lengkap:
- feedback rubrik: maksimum 1 ayat setiap satu
- strengths: 2 hingga 3 item sahaja
- improvements: 2 hingga 3 item sahaja
- nextAction: 1 ayat sahaja
- paragraphAnalysis: maksimum 4 item
- languageIssues: maksimum 5 item
- languageIssues hanya untuk ayat yang benar-benar perlu dibaiki.
- Jangan masukkan languageIssues jika cadangan sama maksud dan hampir sama dengan ayat asal.
- Jika hanya mahu memuji ayat, letakkan dalam strengths, bukan languageIssues.
- Cadangan languageIssues mesti menunjukkan pembetulan yang jelas seperti ejaan, tatabahasa, ayat lebih lengkap atau gaya lebih tepat.

Ikut schema JSON yang diberikan oleh sistem.
Berikan skor bagi semua komponen rubrik walaupun jawapan lemah.
Status I-H-C-P hanya boleh guna: good, partial, missing.
Jenis languageIssues hanya boleh guna: ejaan, tatabahasa, tanda_baca, struktur_ayat, gaya, lain.

Jawapan murid:
${studentAnswer}`;
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

