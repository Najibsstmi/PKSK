import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  PenLine,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Sparkles,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { gradeWritingAnswer, transcribeWritingFiles } from "../services/essayService";
import type {
  EssayAnswerMethod,
  EssayAttemptPayload,
  EssayFilePreview,
  EssayGradingResult,
  EssayIHCPStatus,
  EssayParagraphAnalysis,
  EssayRubricKey,
  EssaySubmitResult,
} from "../types/essay";

const AI_DISCLAIMER = "Markah Anggaran AI – Untuk Tujuan Latihan";

const RUBRIC_LABELS: Record<EssayRubricKey, string> = {
  taskFulfilment: "Kehendak Tugasan",
  ideasAndKBAT: "Isi & KBAT",
  ihcp: "I-H-C-P",
  organisation: "Organisasi",
  language: "Bahasa",
  vocabulary: "Kosa Kata",
  clarity: "Kejelasan",
};

const RUBRIC_KEYS = Object.keys(RUBRIC_LABELS) as EssayRubricKey[];

const METHOD_META: Record<EssayAnswerMethod, { title: string; text: string; icon: LucideIcon }> = {
  typed: {
    title: "Taip",
    text: "Editor + autosave",
    icon: PenLine,
  },
  scan: {
    title: "Imbas",
    text: "Kamera telefon",
    icon: ScanLine,
  },
  upload: {
    title: "Muat Naik",
    text: "Gambar / PDF",
    icon: UploadCloud,
  },
};

type AppRoute = "/app/simulasi" | "/app/sejarah";

type EssayAiPageProps = {
  payload: EssayAttemptPayload | null;
  result: EssaySubmitResult | null;
  busy: boolean;
  onAutosave: (responseText: string) => Promise<{ word_count: number; autosaved_at: string } | null>;
  onSubmit: (responseText: string) => Promise<EssaySubmitResult | null>;
  onNavigate: (route: AppRoute) => void;
  onStartEssay: () => void;
};

export function EssayAiPage({ payload, result, busy, onAutosave, onSubmit, onNavigate, onStartEssay }: EssayAiPageProps) {
  const [answerMethod, setAnswerMethod] = useState<EssayAnswerMethod>("typed");
  const [responseText, setResponseText] = useState(payload?.response.response_text ?? "");
  const [lastSavedText, setLastSavedText] = useState(payload?.response.response_text ?? "");
  const [saveStatus, setSaveStatus] = useState(payload?.response.autosaved_at ? `Disimpan ${formatTimeOnly(payload.response.autosaved_at)}` : "Belum disimpan");
  const [remainingSeconds, setRemainingSeconds] = useState(() => essayRemainingSeconds(payload));
  const [files, setFiles] = useState<EssayFilePreview[]>([]);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [transcriptionWarnings, setTranscriptionWarnings] = useState<string[]>([]);
  const [aiResult, setAiResult] = useState<EssayGradingResult | null>(null);
  const [submittedResult, setSubmittedResult] = useState<EssaySubmitResult | null>(result);
  const [completedQuestion, setCompletedQuestion] = useState(payload?.question ?? null);
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const activeQuestion = payload?.question ?? completedQuestion;
  const activeAttemptId = payload?.attempt.id ?? null;
  const minWords = activeQuestion?.essay_min_words ?? 100;
  const currentAnswerText = answerMethod === "typed" ? responseText : transcriptionText;
  const wordCount = useMemo(() => countWords(currentAnswerText), [currentAnswerText]);
  const progressPercent = Math.min(100, Math.round((wordCount / Math.max(1, minWords)) * 100));
  const finalSubmittedResult = submittedResult ?? result;
  const isReviewingExistingAnswer = isRevisionMode && Boolean(activeQuestion) && !payload;

  useEffect(() => {
    if (!payload) return;
    setCompletedQuestion(payload.question);
    setResponseText(payload.response.response_text ?? "");
    setLastSavedText(payload.response.response_text ?? "");
    setSaveStatus(payload.response.autosaved_at ? `Disimpan ${formatTimeOnly(payload.response.autosaved_at)}` : "Belum disimpan");
    setRemainingSeconds(essayRemainingSeconds(payload));
    setAnswerMethod("typed");
    setFiles([]);
    setTranscriptionText("");
    setTranscriptionWarnings([]);
    setAiResult(null);
    setSubmittedResult(null);
    setIsRevisionMode(false);
    setError(null);
    setStage(null);
  }, [activeAttemptId, payload]);

  useEffect(() => {
    if (result) {
      setSubmittedResult(result);
    }
  }, [result]);

  useEffect(() => {
    if (!payload || finalSubmittedResult) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds(essayRemainingSeconds(payload));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [payload, finalSubmittedResult]);

  useEffect(() => {
    if (!payload || finalSubmittedResult || answerMethod !== "typed" || responseText === lastSavedText) {
      return;
    }

    setSaveStatus("Menyimpan...");
    const timeout = window.setTimeout(async () => {
      try {
        const saved = await onAutosave(responseText);
        if (saved) {
          setLastSavedText(responseText);
          setSaveStatus(`Disimpan ${formatTimeOnly(saved.autosaved_at)}`);
        }
      } catch {
        setSaveStatus("Autosave gagal. Cuba submit semula.");
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [answerMethod, finalSubmittedResult, lastSavedText, onAutosave, payload, responseText]);

  if (aiResult && finalSubmittedResult && !isRevisionMode) {
    return (
      <EssayAiResultPanel
        result={aiResult}
        submitted={finalSubmittedResult}
        onImprove={() => {
          setAnswerMethod("typed");
          setResponseText(currentAnswerText || responseText);
          setTranscriptionText("");
          setTranscriptionWarnings([]);
          setFiles([]);
          setSubmittedResult(null);
          setIsRevisionMode(true);
          setError(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onStartEssay={onStartEssay}
        onNavigate={onNavigate}
      />
    );
  }

  if (finalSubmittedResult && !isRevisionMode) {
    return <LegacyEssayResultPanel result={finalSubmittedResult} onNavigate={onNavigate} onStartEssay={onStartEssay} />;
  }

  if (!activeQuestion) {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-soft sm:p-8">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <PenLine size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-black">Bahagian C belum dimulakan</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">Klik mula untuk dapatkan tajuk karangan rawak daripada bank soalan.</p>
        <button type="button" className="primary-button mx-auto mt-6" onClick={onStartEssay}>
          Mula Bahagian C
        </button>
      </section>
    );
  }

  async function handleTranscription() {
    setError(null);
    setStage("Membaca jawapan...");
    setProcessing(true);
    try {
      const transcription = await transcribeWritingFiles(files.map((item) => item.file));
      setTranscriptionText(transcription.transcription);
      setTranscriptionWarnings(transcription.warnings ?? []);
      setResponseText(transcription.transcription);
      setStage(null);
    } catch (caught) {
      setError(toMessage(caught));
      setStage(null);
    } finally {
      setProcessing(false);
    }
  }

  async function handleGrade(answer: string, shouldSaveToSupabase: boolean) {
    const questionForGrading = activeQuestion;
    if (!questionForGrading) {
      setError("Tajuk Bahagian C tidak ditemui. Sila mula semula Bahagian C.");
      return;
    }
    const cleanAnswer = answer.trim();
    if (!cleanAnswer) {
      setError("Tulis jawapan atau sahkan transkripsi dahulu sebelum semakan AI.");
      return;
    }
    if (countWords(cleanAnswer) < 20 || cleanAnswer.includes("[tidak jelas]")) {
      setError("Transkripsi belum cukup jelas untuk disemak. Sila betulkan teks transkripsi dahulu, atau ambil gambar semula dengan kertas memenuhi skrin.");
      return;
    }

    setError(null);
    setProcessing(true);
    setStage("Mengenal pasti struktur penulisan...");

    try {
      setStage("Menilai berdasarkan rubrik...");
      const grading = await gradeWritingAnswer({
        level: "Tahun 6",
        question: questionForGrading.question_text,
        instruction: "Artikulasi Penulisan Bahagian C PKSK. Beri maklum balas latihan yang membina untuk murid.",
        minimumWords: minWords,
        studentAnswer: cleanAnswer,
      });

      setStage("Menyediakan maklum balas...");
      setAiResult(grading);
      setCompletedQuestion(questionForGrading);
      setResponseText(cleanAnswer);

      if (shouldSaveToSupabase && payload) {
        setStage("Menyimpan jawapan...");
        const saved = await onSubmit(cleanAnswer);
        setSubmittedResult(
          saved ?? {
            attempt_id: payload.attempt.id,
            word_count: grading.wordCount,
            duration_seconds: 0,
            message: "Karangan berjaya dihantar.",
            ai_note: AI_DISCLAIMER,
          },
        );
      } else {
        setSubmittedResult(
          finalSubmittedResult ?? {
            attempt_id: payload?.attempt.id ?? "revision",
            word_count: grading.wordCount,
            duration_seconds: 0,
            message: "Semakan AI selesai.",
            ai_note: AI_DISCLAIMER,
          },
        );
      }

      setIsRevisionMode(false);
      setStage(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(toMessage(caught));
      setStage(null);
    } finally {
      setProcessing(false);
    }
  }

  function handleMethodChange(method: EssayAnswerMethod) {
    setAnswerMethod(method);
    setError(null);
    setStage(null);
    setTranscriptionWarnings([]);
    if (method === "typed") {
      setTranscriptionText("");
    }
  }

  function handleFilesSelected(selectedFiles: FileList | null) {
    if (!selectedFiles?.length) return;
    const nextFiles = Array.from(selectedFiles).map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}-${Date.now()}`,
      file,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setFiles((current) => [...current, ...nextFiles]);
    setTranscriptionText("");
    setTranscriptionWarnings([]);
    setError(null);
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Bahagian C / {activeQuestion.topic ?? "Artikulasi Penulisan"}</p>
            <h1 className="mt-2 text-2xl font-black leading-snug text-slate-950 sm:text-3xl">{activeQuestion.question_text}</h1>
          </div>
          <span className="w-fit rounded-xl bg-sun-50 px-4 py-2 text-sm font-black text-amber-700">{AI_DISCLAIMER}</span>
        </div>

        {activeQuestion.question_image_url ? <QuestionImage src={activeQuestion.question_image_url} /> : null}

        <AnswerMethodSelector method={answerMethod} onChange={handleMethodChange} />
      </section>

      {error ? <Notice tone="danger" text={error} onClose={() => setError(null)} /> : null}
      {stage ? <ProcessingNotice stage={stage} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.68fr)_minmax(300px,0.32fr)]">
        <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
          {answerMethod === "typed" ? (
            <TypedAnswerEditor value={responseText} onChange={setResponseText} isRevisionMode={isReviewingExistingAnswer} />
          ) : (
            <FileAnswerPanel
              method={answerMethod}
              files={files}
              transcriptionText={transcriptionText}
              transcriptionWarnings={transcriptionWarnings}
              processing={processing}
              onFilesSelected={handleFilesSelected}
              onRemoveFile={removeFile}
              onTranscribe={handleTranscription}
              onTranscriptionChange={setTranscriptionText}
              onUseTranscription={() => {
                setResponseText(transcriptionText);
                void handleGrade(transcriptionText, !isRevisionMode);
              }}
            />
          )}

          {wordCount < minWords ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
              Jawapan anda kini {wordCount} patah perkataan. Sasaran minimum ialah {minWords} patah perkataan. AI masih boleh menyemak, tetapi cap markah panjang mungkin digunakan.
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-500">{answerMethod === "typed" && payload ? saveStatus : "Imej/PDF tidak disimpan kekal selepas transkripsi."}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="secondary-button" onClick={() => onNavigate("/app/simulasi")}>
                Kembali
              </button>
              {answerMethod === "typed" ? (
                <button type="button" className="primary-button" disabled={busy || processing} onClick={() => void handleGrade(responseText, !isRevisionMode)}>
                  {busy || processing ? "Menyemak..." : isRevisionMode ? "Semak Semula dengan AI" : "Semak dengan AI & Submit"}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <EssayStatusPanel remainingSeconds={remainingSeconds} wordCount={wordCount} minWords={minWords} saveStatus={saveStatus} progressPercent={progressPercent} method={answerMethod} />
      </div>
    </div>
  );
}

function AnswerMethodSelector({ method, onChange }: { method: EssayAnswerMethod; onChange: (method: EssayAnswerMethod) => void }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
      {(Object.keys(METHOD_META) as EssayAnswerMethod[]).map((key) => {
        const meta = METHOD_META[key];
        const Icon = meta.icon;
        const active = method === key;
        return (
          <button
            key={key}
            type="button"
            className={`min-h-[118px] rounded-2xl border px-2 py-3 text-center transition hover:-translate-y-0.5 hover:shadow-soft sm:min-h-[132px] sm:p-4 ${active ? "border-ocean-300 bg-ocean-50 text-ocean-900 shadow-soft" : "border-slate-200 bg-white text-slate-700"}`}
            onClick={() => onChange(key)}
          >
            <span className={`mx-auto grid h-10 w-10 place-items-center rounded-2xl sm:h-12 sm:w-12 ${active ? "bg-ocean-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="mt-2 block text-sm font-black leading-tight sm:text-base">{meta.title}</span>
            <span className="mt-1 block text-[11px] font-bold leading-4 text-slate-500 sm:text-xs">{meta.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypedAnswerEditor({ value, onChange, isRevisionMode }: { value: string; onChange: (value: string) => void; isRevisionMode: boolean }) {
  return (
    <label className="grid gap-3">
      <span className="flex flex-col gap-1 text-sm font-black text-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <span>{isRevisionMode ? "Baiki jawapan anda" : "Karangan anda"}</span>
        <span className="font-bold text-ocean-700">AI akan semak berdasarkan rubrik latihan PKSK</span>
      </span>
      <textarea
        className="field min-h-[360px] text-base leading-8 sm:min-h-[460px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Tulis karangan di sini. Untuk markah lebih baik, susun isi dengan huraian, contoh dan penegas."
      />
    </label>
  );
}

function FileAnswerPanel({
  method,
  files,
  transcriptionText,
  transcriptionWarnings,
  processing,
  onFilesSelected,
  onRemoveFile,
  onTranscribe,
  onTranscriptionChange,
  onUseTranscription,
}: {
  method: EssayAnswerMethod;
  files: EssayFilePreview[];
  transcriptionText: string;
  transcriptionWarnings: string[];
  processing: boolean;
  onFilesSelected: (files: FileList | null) => void;
  onRemoveFile: (id: string) => void;
  onTranscribe: () => void;
  onTranscriptionChange: (value: string) => void;
  onUseTranscription: () => void;
}) {
  const accept = method === "scan" ? "image/*" : "image/jpeg,image/png,image/webp,application/pdf";
  const inputLabel = method === "scan" ? "Ambil / tambah gambar jawapan" : "Upload gambar atau PDF";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dashed border-ocean-300 bg-ocean-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black">{method === "scan" ? "Imbas jawapan bertulis" : "Upload jawapan bertulis"}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Tambah satu atau beberapa halaman. Susunan fail akan dibaca mengikut susunan pilihan.</p>
          </div>
          <label className="primary-button cursor-pointer text-center">
            <Camera size={18} aria-hidden="true" />
            {inputLabel}
            <input
              className="sr-only"
              type="file"
              accept={accept}
              capture={method === "scan" ? "environment" : undefined}
              multiple={method === "upload"}
              onChange={(event) => {
                onFilesSelected(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {files.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map((item, index) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-ocean-700">Halaman {index + 1}</p>
                  <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
                  <p className="text-xs font-bold text-slate-500">{formatFileSize(item.size)}</p>
                </div>
                <button type="button" className="rounded-xl bg-slate-100 p-2 text-slate-600" onClick={() => onRemoveFile(item.id)} aria-label={`Buang ${item.name}`}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              {item.previewUrl ? (
                <img className="mt-3 aspect-[4/3] w-full rounded-xl object-cover" src={item.previewUrl} alt={`Preview ${item.name}`} />
              ) : (
                <div className="mt-3 grid aspect-[4/3] place-items-center rounded-xl bg-slate-100 text-slate-500">
                  <FileText size={34} aria-hidden="true" />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}

      <button type="button" className="primary-button w-full justify-center" disabled={processing || files.length === 0} onClick={onTranscribe}>
        {processing ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
        {processing ? "Memproses tulisan..." : "Proses Tulisan Saya"}
      </button>

      {transcriptionText ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-xl font-black">Semak Transkripsi</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">Pastikan teks di bawah sama dengan tulisan asal anda sebelum meneruskan penilaian.</p>
          {transcriptionWarnings.length ? (
            <div className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-amber-800">
              {transcriptionWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <textarea className="field mt-4 min-h-[280px] bg-white text-base leading-8" value={transcriptionText} onChange={(event) => onTranscriptionChange(event.target.value)} />
          <button type="button" className="primary-button mt-4 w-full justify-center" disabled={processing} onClick={onUseTranscription}>
            <Check size={18} aria-hidden="true" />
            Sahkan & Semak Markah
          </button>
        </section>
      ) : null}
    </div>
  );
}

function EssayStatusPanel({
  remainingSeconds,
  wordCount,
  minWords,
  saveStatus,
  progressPercent,
  method,
}: {
  remainingSeconds: number;
  wordCount: number;
  minWords: number;
  saveStatus: string;
  progressPercent: number;
  method: EssayAnswerMethod;
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Status Penulisan</h2>
          <span className="rounded-xl bg-ocean-50 px-3 py-2 text-sm font-black text-ocean-700">{formatTimer(remainingSeconds)}</span>
        </div>
        <div className="mt-5 grid gap-3">
          <SummaryRow label="Kaedah" value={METHOD_META[method].title} />
          <SummaryRow label="Patah perkataan" value={`${wordCount}`} />
          <SummaryRow label="Sasaran" value={`${minWords}+ perkataan`} />
          <SummaryRow label="Autosave" value={method === "typed" ? saveStatus.replace("Disimpan ", "") : "Selepas transkripsi"} />
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-ocean-600 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <section className="rounded-2xl border border-ocean-100 bg-ocean-50 p-5 sm:p-6">
        <h2 className="text-lg font-black text-ocean-900">Tip I-H-C-P</h2>
        <div className="mt-4 grid gap-3 text-sm font-semibold leading-6 text-slate-700">
          <p><strong>I:</strong> Isi utama yang menjawab tajuk.</p>
          <p><strong>H:</strong> Huraian sebab atau cara.</p>
          <p><strong>C:</strong> Contoh situasi yang sesuai.</p>
          <p><strong>P:</strong> Penegas untuk menguatkan isi.</p>
        </div>
      </section>
    </aside>
  );
}

function EssayAiResultPanel({ result, submitted, onImprove, onNavigate, onStartEssay }: { result: EssayGradingResult; submitted: EssaySubmitResult; onImprove: () => void; onNavigate: (route: AppRoute) => void; onStartEssay: () => void }) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-5 shadow-soft sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[0.34fr_0.66fr]">
          <div className="rounded-3xl bg-gradient-to-br from-ocean-600 to-teal-500 p-6 text-white shadow-soft">
            <p className="text-sm font-black uppercase text-white/80">Markah Anggaran AI</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-6xl font-black leading-none">{result.totalScore}</span>
              <span className="pb-2 text-xl font-black text-white/80">/ 100</span>
            </div>
            <p className="mt-4 rounded-2xl bg-white/15 px-4 py-3 text-lg font-black">{result.level}</p>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/90">Anggaran Bahagian C: <strong>{result.pkskEstimatedScore.toFixed(1)} / 10</strong></p>
            <p className="mt-2 text-xs font-bold leading-5 text-white/75">{result.disclaimer}</p>
          </div>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-black sm:text-3xl">Keputusan Semakan Bahagian C</h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Penilaian ini dijana menggunakan kecerdasan buatan berdasarkan rubrik latihan PKSK Academy. Ia bukan skema pemarkahan rasmi dan tidak mewakili markah sebenar Kementerian Pendidikan Malaysia.</p>
              </div>
              <span className="w-fit rounded-xl bg-leaf-50 px-4 py-2 text-sm font-black text-leaf-700">{submitted.word_count ?? result.wordCount} patah perkataan</span>
            </div>

            {result.lengthPenalty.applied ? <Notice tone="warning" text={result.lengthPenalty.reason} /> : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {RUBRIC_KEYS.map((key) => (
                <RubricScoreCard key={key} label={RUBRIC_LABELS[key]} score={result.scores[key].score} maxScore={result.scores[key].maxScore} feedback={result.scores[key].feedback} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <FeedbackCard title="Kekuatan Saya" icon={CheckCircle2} items={result.strengths} tone="good" />
        <FeedbackCard title="Saya Boleh Baiki" icon={AlertTriangle} items={result.improvements} tone="warning" />
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-xl font-black">Fokus Latihan Seterusnya</h2>
        <p className="mt-2 text-base font-semibold leading-7 text-slate-700">{result.nextAction}</p>
      </section>

      <IHCPAnalysis paragraphs={result.paragraphAnalysis} />

      {result.languageIssues.length ? (
        <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
          <h2 className="text-xl font-black">Isu Bahasa Yang Boleh Disemak</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Ayat asal ialah petikan daripada jawapan murid. Cadangan AI menunjukkan cara ayat itu boleh dibaiki.
          </p>
          <div className="mt-4 grid gap-3">
            {result.languageIssues.map((issue, index) => (
              <article key={`${issue.original}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-ocean-700">{issue.type.replace("_", " ")}</p>
                <p className="mt-2 text-sm font-bold text-slate-600">Ayat asal murid: <span className="text-slate-950">{issue.original || "-"}</span></p>
                <p className="mt-1 text-sm font-bold text-leaf-700">Cadangan AI: {issue.suggestion || "Semak semula ayat ini."}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" className="primary-button" onClick={onImprove}>
          <RefreshCw size={18} aria-hidden="true" />
          Baiki Jawapan Saya
        </button>
        <button type="button" className="secondary-button" onClick={onStartEssay}>
          <RotateCcw size={18} aria-hidden="true" />
          Cuba Tajuk Lain
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate("/app/sejarah")}>
          Sejarah Cubaan
        </button>
      </div>
    </div>
  );
}

function RubricScoreCard({ label, score, maxScore, feedback }: { label: string; score: number; maxScore: number; feedback: string }) {
  const percent = Math.round((score / Math.max(1, maxScore)) * 100);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-900">{label}</h3>
        <span className="rounded-xl bg-ocean-50 px-3 py-1 text-sm font-black text-ocean-700">{score} / {maxScore}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-ocean-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{feedback}</p>
    </article>
  );
}

function FeedbackCard({ title, icon: Icon, items, tone }: { title: string; icon: LucideIcon; items: string[]; tone: "good" | "warning" }) {
  const toneClass = tone === "good" ? "bg-leaf-50 text-leaf-700" : "bg-amber-50 text-amber-700";
  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-center gap-3">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${toneClass}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function IHCPAnalysis({ paragraphs }: { paragraphs: EssayParagraphAnalysis[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft sm:p-6">
      <h2 className="text-xl font-black">Peta I-H-C-P</h2>
      <div className="mt-4 grid gap-4">
        {paragraphs.map((paragraph) => (
          <article key={`${paragraph.paragraph}-${paragraph.type}`} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-black">Perenggan {paragraph.paragraph} - {paragraph.type}</h3>
              <p className="text-sm font-semibold text-slate-600">{paragraph.feedback}</p>
            </div>
            {paragraph.ihcp ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(["I", "H", "C", "P"] as const).map((key) => (
                  <IhcpStatus key={key} label={key} status={paragraph.ihcp?.[key].status ?? "partial"} feedback={paragraph.ihcp?.[key].feedback ?? "Semak semula."} />
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function IhcpStatus({ label, status, feedback }: { label: "I" | "H" | "C" | "P"; status: EssayIHCPStatus; feedback: string }) {
  const meta = {
    good: { text: "Jelas", icon: CheckCircle2, className: "bg-leaf-50 text-leaf-700 border-leaf-100" },
    partial: { text: "Sebahagian", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 border-amber-100" },
    missing: { text: "Belum ada", icon: X, className: "bg-coral-50 text-coral-700 border-coral-100" },
  }[status];
  const Icon = meta.icon;
  return (
    <div className={`rounded-2xl border p-3 ${meta.className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black">{label}</p>
        <span className="flex items-center gap-1 text-xs font-black">
          <Icon size={15} aria-hidden="true" />
          {meta.text}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{feedback}</p>
    </div>
  );
}

function LegacyEssayResultPanel({ result, onNavigate, onStartEssay }: { result: EssaySubmitResult; onNavigate: (route: AppRoute) => void; onStartEssay: () => void }) {
  return (
    <section className="rounded-2xl bg-white p-6 text-center shadow-soft sm:p-8">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-leaf-50 text-leaf-600">
        <Save size={30} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-black">Karangan berjaya dihantar.</h1>
      <p className="mt-3 text-lg font-black text-ocean-700">AI marking akan ditambah pada versi akan datang.</p>
      <p className="mt-3 text-sm font-semibold text-slate-500">{result.word_count ?? 0} patah perkataan disimpan.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className="primary-button" onClick={onStartEssay}>
          Cuba Tajuk Lain
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate("/app/sejarah")}>
          Sejarah Cubaan
        </button>
      </div>
    </section>
  );
}

function QuestionImage({ src }: { src: string }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <img className="max-h-[420px] w-full object-contain" src={src} alt="Gambar sokongan soalan" />
    </figure>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="text-right text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function Notice({ tone, text, onClose }: { tone: "danger" | "warning"; text: string; onClose?: () => void }) {
  const className = tone === "danger" ? "border-coral-100 bg-coral-50 text-coral-700" : "border-amber-100 bg-amber-50 text-amber-800";
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm font-black leading-6 ${className}`}>
      <p>{text}</p>
      {onClose ? (
        <button type="button" className="rounded-xl bg-white/70 p-2" onClick={onClose} aria-label="Tutup mesej">
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ProcessingNotice({ stage }: { stage: string }) {
  const steps = ["Membaca jawapan...", "Mengenal pasti struktur penulisan...", "Menilai berdasarkan rubrik...", "Menyediakan maklum balas..."];
  return (
    <section className="rounded-2xl border border-ocean-100 bg-ocean-50 p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin text-ocean-700" size={22} aria-hidden="true" />
        <p className="text-sm font-black text-ocean-900">{stage}</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <div key={step} className={`rounded-xl px-3 py-2 text-xs font-black ${step === stage ? "bg-ocean-600 text-white" : "bg-white text-slate-500"}`}>
            {step}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatTimeOnly(value: string) {
  return new Date(value).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });
}

function essayRemainingSeconds(payload: EssayAttemptPayload | null) {
  if (!payload) return 0;
  const limitMinutes = payload.question.essay_time_limit ?? 45;
  const started = new Date(payload.attempt.started_at).getTime();
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, limitMinutes * 60 - elapsed);
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ralat tidak dijangka. Sila cuba semula.";
}


