import { AI_DISCLAIMER, callOpenAI, extractOutputText, handleApiError, publicError, readJsonBody, sendJson } from "./_essay-ai.js";

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILES = 8;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const instructions = `Anda ialah pembaca tulisan tangan Bahasa Melayu untuk latihan Artikulasi Penulisan PKSK.
Tugas anda hanya menyalin teks asal murid.
Jangan betulkan ejaan, tatabahasa, tanda baca atau gaya bahasa.
Jangan tambah isi dan jangan karang semula.
Kekalkan kesalahan asal murid kerana ia akan digunakan untuk pemarkahan.
Kekalkan perenggan jika dapat dikenal pasti.
Jika perkataan tidak dapat dibaca, tulis [tidak jelas].
Kembalikan teks transkripsi sahaja tanpa komen tambahan.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Kaedah permintaan tidak disokong." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const files = validateFiles(body?.files);

    const content = [
      {
        type: "input_text",
        text: "Transkripsikan semua halaman mengikut susunan fail. Jika terdapat PDF, baca semua halaman yang boleh dikenal pasti.",
      },
      ...files.map(toOpenAIFileContent),
    ];

    const data = await callOpenAI({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions,
      input: [{ role: "user", content }],
      max_output_tokens: 2500,
    });

    const transcription = extractOutputText(data).trim();
    if (!transcription || transcription.length < 3) {
      throw publicError(422, "AI tidak dapat membaca tulisan ini dengan jelas. Cuba ambil gambar semula di tempat yang lebih terang.");
    }

    sendJson(res, 200, {
      transcription,
      pages: files.length,
      warnings: transcription.includes("[tidak jelas]") ? ["Ada bahagian yang tidak jelas. Sila semak dan betulkan sebelum pemarkahan."] : [],
      disclaimer: AI_DISCLAIMER,
    });
  } catch (error) {
    handleApiError(res, error, "AI tidak dapat membaca tulisan ini. Sila cuba semula.");
  }
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw publicError(400, "Pilih gambar atau PDF jawapan dahulu.");
  }

  if (files.length > MAX_FILES) {
    throw publicError(400, `Maksimum ${MAX_FILES} fail sahaja untuk satu semakan.`);
  }

  return files.map((file) => {
    const normalized = {
      name: typeof file?.name === "string" ? file.name : "jawapan",
      type: typeof file?.type === "string" && file.type ? file.type : inferMimeType(file?.name),
      size: Number(file?.size) || 0,
      dataUrl: typeof file?.dataUrl === "string" ? file.dataUrl : "",
    };

    if (!SUPPORTED_TYPES.includes(normalized.type)) {
      throw publicError(400, "Format fail tidak disokong. Gunakan JPG, JPEG, PNG, WEBP atau PDF.");
    }
    if (!normalized.dataUrl.startsWith("data:")) {
      throw publicError(400, "Fail tidak dapat diproses. Cuba pilih fail semula.");
    }
    if (normalized.size > MAX_FILE_SIZE) {
      throw publicError(400, "Fail terlalu besar. Sila gunakan fail bawah 8MB.");
    }

    return normalized;
  });
}

function toOpenAIFileContent(file) {
  if (file.type === "application/pdf") {
    return {
      type: "input_file",
      filename: file.name,
      file_data: file.dataUrl,
    };
  }

  return {
    type: "input_image",
    image_url: file.dataUrl,
  };
}

function inferMimeType(name = "") {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.png$/i.test(name)) return "image/png";
  return "image/jpeg";
}

