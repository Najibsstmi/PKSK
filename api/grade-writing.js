import { AI_DISCLAIMER, callOpenAI, extractOutputText, handleApiError, normalizeGrading, parseJsonOutput, publicError, rawGradingJsonSchema, readJsonBody, sendJson } from "./_essay-ai.js";

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
    const level = sanitizeText(body?.level) || "Tahun 6";
    const question = sanitizeText(body?.question);
    const instruction = sanitizeText(body?.instruction);
    const minimumWords = Number(body?.minimumWords) || 100;
    const studentAnswer = sanitizeText(body?.studentAnswer);

    if (!question) {
      throw publicError(400, "Soalan Bahagian C tidak lengkap untuk pemarkahan.");
    }
    if (!studentAnswer) {
      throw publicError(400, "Tulis atau sahkan jawapan dahulu sebelum semakan AI.");
    }

    const data = await callOpenAI({
      model: process.env.OPENAI_GRADING_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: systemPrompt,
      input: buildUserPrompt({ level, question, instruction, minimumWords, studentAnswer }),
      max_output_tokens: 3500,
      text: {
        format: {
          type: "json_schema",
          name: "pksk_essay_grading",
          strict: true,
          schema: rawGradingJsonSchema,
        },
      },
    });

    const output = extractOutputText(data);
    const raw = parseJsonOutput(output);
    const result = normalizeGrading(raw, { minimumWords, studentAnswer });
    sendJson(res, 200, result);
  } catch (error) {
    handleApiError(res, error, "Semakan markah AI belum berjaya. Sila cuba semula, atau semak transkripsi dan hantar semula.");
  }
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
Gunakan format ini:
{
  "scores": {
    "taskFulfilment": { "score": 0, "feedback": "" },
    "ideasAndKBAT": { "score": 0, "feedback": "" },
    "ihcp": { "score": 0, "feedback": "" },
    "organisation": { "score": 0, "feedback": "" },
    "language": { "score": 0, "feedback": "" },
    "vocabulary": { "score": 0, "feedback": "" },
    "clarity": { "score": 0, "feedback": "" }
  },
  "strengths": [],
  "improvements": [],
  "nextAction": "",
  "paragraphAnalysis": [
    {
      "paragraph": 1,
      "type": "Pendahuluan / Isi / Penutup / Keseluruhan",
      "feedback": "",
      "ihcp": {
        "I": { "status": "good", "feedback": "" },
        "H": { "status": "partial", "feedback": "" },
        "C": { "status": "missing", "feedback": "" },
        "P": { "status": "partial", "feedback": "" }
      }
    }
  ],
  "languageIssues": [
    { "original": "", "suggestion": "", "type": "ejaan" }
  ]
}

Status I-H-C-P hanya boleh guna: good, partial, missing.
Jenis languageIssues hanya boleh guna: ejaan, tatabahasa, tanda_baca, struktur_ayat, gaya, lain.

Jawapan murid:
${studentAnswer}`;
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

