import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { extractQuestionsFromPdf, type ExtractedQuestion } from "./questionExtraction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let requestedImportId: string | undefined;

  try {
    const { importId } = (await request.json()) as { importId?: string };
    requestedImportId = importId;
    if (!importId) {
      return json({ error: "importId is required" }, 400);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "LOGIN_REQUIRED" }, 401);
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role,is_blocked,subscription_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.is_blocked || profile.subscription_status === "blocked" || !["admin", "super_admin"].includes(profile.role)) {
      return json({ error: "ADMIN_REQUIRED" }, 403);
    }

    const { data: importRow, error: importError } = await serviceClient
      .from("question_imports")
      .select("*")
      .eq("id", importId)
      .single();

    if (importError || !importRow) {
      return json({ error: "IMPORT_NOT_FOUND" }, 404);
    }

    await markImport(serviceClient, importId, {
      status: "processing",
      processing_stage: "extracting_text",
      processing_error: null,
    });

    const { data: fileBlob, error: downloadError } = await serviceClient.storage
      .from("question-imports")
      .download(importRow.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(downloadError?.message ?? "PDF could not be downloaded from storage.");
    }

    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    await markImport(serviceClient, importId, { processing_stage: "extracting_questions" });

    const extraction = await extractQuestionsFromPdf({
      pdfBytes,
      fileName: importRow.file_name,
      sourceTitle: importRow.source_title,
    });

    await serviceClient.from("imported_question_drafts").delete().eq("import_id", importId).is("imported_question_id", null);
    await insertDrafts(serviceClient, importId, extraction.questions);

    await markImport(serviceClient, importId, {
      status: extraction.questions.length > 0 ? "review" : "failed",
      processing_stage: extraction.questions.length > 0 ? "ready_for_review" : "no_questions_detected",
      total_detected: extraction.questions.length,
      processing_error: extraction.questions.length > 0 ? extraction.warning : extraction.warning ?? "No questions were detected.",
      completed_at: extraction.questions.length > 0 ? null : new Date().toISOString(),
    });

    return json({ ok: true, detected: extraction.questions.length, warning: extraction.warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF processing failed.";
    try {
      if (requestedImportId) {
        const serviceClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
        await markImport(serviceClient, requestedImportId, {
          status: "failed",
          processing_stage: "failed",
          processing_error: message,
          completed_at: new Date().toISOString(),
        });
      }
    } catch {
      // Keep the original error response if status update also fails.
    }

    return json({ error: message }, 500);
  }
});

async function insertDrafts(serviceClient: ReturnType<typeof createClient>, importId: string, questions: ExtractedQuestion[]) {
  for (const [index, question] of questions.entries()) {
    const { data: draft, error: draftError } = await serviceClient
      .from("imported_question_drafts")
      .insert({
        import_id: importId,
        source_question_number: question.source_question_number ?? String(index + 1),
        question_type: question.question_type,
        section: question.section,
        category: question.category,
        topic: question.topic,
        difficulty: question.difficulty,
        question_text: question.question_text,
        question_image_url: question.question_image_url,
        correct_option_label: question.correct_option_label,
        explanation: question.explanation,
        confidence: question.confidence,
        review_status: question.review_status,
        essay_min_words: question.essay_min_words,
        essay_time_limit: question.essay_time_limit,
      })
      .select("id")
      .single();

    if (draftError || !draft) {
      throw new Error(draftError?.message ?? "Draft insert failed.");
    }

    if (question.options.length > 0) {
      const { error: optionError } = await serviceClient.from("imported_question_draft_options").insert(
        question.options.map((option) => ({
          draft_question_id: draft.id,
          option_label: option.option_label,
          option_text: option.option_text,
          option_image_url: option.option_image_url,
          is_correct: option.is_correct,
          sort_order: option.sort_order,
        })),
      );

      if (optionError) {
        throw new Error(optionError.message);
      }
    }

    if (question.assets.length > 0) {
      const { error: assetError } = await serviceClient.from("question_assets").insert(
        question.assets.map((asset) => ({
          draft_question_id: draft.id,
          asset_type: asset.asset_type,
          file_url: asset.file_url,
          sort_order: asset.sort_order,
        })),
      );

      if (assetError) {
        throw new Error(assetError.message);
      }
    }
  }
}

async function markImport(serviceClient: ReturnType<typeof createClient>, importId: string, values: Record<string, unknown>) {
  const { error } = await serviceClient.from("question_imports").update(values).eq("id", importId);
  if (error) {
    throw new Error(error.message);
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
