import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Crown,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  ExternalLink,
  FileSpreadsheet,
  FileUp,
  Footprints,
  Gift,
  Gem,
  GraduationCap,
  HeartHandshake,
  History,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Menu,
  PenLine,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  Share2,
  Sparkles,
  Star,
  Smartphone,
  Target,
  Trophy,
  Users,
  UserRound,
  X,
  Zap,
  Play,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { pkskInfoConfig, type PkskInfoEvent, type PkskInfoEventId } from "./data/pkskInfo";
import { pkskSections, states } from "./data/pksk";
import { useAccess } from "./hooks/useAccess";
import { useSocialProofNotifications } from "./hooks/useSocialProofNotifications";
import premiumHeroImage from "./assets/pksk-premium-hero.png";
import { EssayAiPage } from "./components/EssayAiPage";
import { SocialProofNotification } from "./components/SocialProofNotification";
import { SocialProofUserCard } from "./components/SocialProofUserCard";
import { fetchAccessStatus, fetchAppSettings, recordLastLogin } from "./services/accessService";
import {
  applyForDiamond,
  approveDiamondPartner,
  fetchAdminDiamondPartner,
  fetchAdminDiamondPartners,
  fetchDiamondDashboard,
  fetchMyDiamondProfile,
  markAgentCommissionPaid,
  reactivateDiamondPartner,
  rejectDiamondPartner,
  suspendDiamondPartner,
  trackReferralClick,
  updateMyDiamondBankInfo,
} from "./services/agentService";
import {
  blockUser,
  extendPremium,
  fetchAdminKpis,
  fetchAdminQuestionDetail,
  fetchAdminQuestions,
  fetchAdminUsers,
  grantPremium,
  revokePremium,
  createManualQuestion,
  setUserRole,
  unblockUser,
  updateQuestion,
  updateQuestionStatus,
  uploadQuestionImage,
} from "./services/adminService";
import { fetchBadgesWithProgress, calculatePerformance } from "./services/achievementService";
import { autosaveEssayResponse, fetchActiveEssayAttempt, getEssayAttemptPayload, startEssayAttempt, submitEssayResponse } from "./services/essayService";
import { fetchGuestPreview, scoreGuestPreview } from "./services/guestPreviewService";
import {
  approvePaymentRequest,
  captureReferralCodeFromUrl,
  fetchAdminPaymentRequests,
  fetchMyLatestPaymentRequest,
  fetchMyPendingPaymentRequest,
  ManualPaymentService,
  rejectPaymentRequest,
  rememberStoredReferralAttribution,
  ToyyibPayService,
} from "./services/paymentService";
import { fetchProfile, saveProfile, type ProfileInput } from "./services/profileService";
import {
  createCsvQuestionImport,
  createPdfQuestionImport,
  fetchImportDrafts,
  fetchQuestionImport,
  fetchQuestionImports,
  importApprovedQuestions,
  processPdfImport,
  setImportDraftStatus,
  updateImportDraft,
} from "./services/questionImportService";
import {
  completeAttempt,
  fetchActiveAttempt,
  fetchAttemptHistory,
  generateQuiz,
  getAttemptPayload,
  skipAnswer,
  submitAnswer,
} from "./services/questionService";
import { fetchQuestionBankCounts } from "./services/questionStatsService";
import type { AdminDiamondPartnerDetail, AdminDiamondPartnerRow, AgentCommissionSummary, AgentStatus, DiamondApplicationInput, DiamondDashboard, DiamondProfile } from "./types/agent";
import type { AccessStatus, AdminKpis, AdminQuestionDetail, AdminQuestionRow, AdminUserRow, AppSettings, GuestPreviewPayload, GuestPreviewResult, QuestionBankCounts, SubscriptionPlan } from "./types/access";
import type { BadgeWithProgress } from "./types/achievement";
import type { ProfileRow, QuizAttemptRow } from "./types/database";
import type { EssayAttemptPayload, EssaySubmitResult } from "./types/essay";
import type { DraftOption, DraftReviewStatus, ImportedQuestionDraft, ManualQuestionInput, QuestionDifficulty, QuestionImportRow, QuestionImportStatus, QuestionType } from "./types/imports";
import type { AdminPaymentRequestRow, PaymentRequest, ToyyibPayCustomerInput } from "./types/payment";
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, QuizMode, QuizQuestion } from "./types/quiz";
import { getLevelProgress } from "./utils/levelSystem";

type AppRoute =
  | "/"
  | "/preview"
  | "/premium"
  | "/login"
  | "/register"
  | "/checkout"
  | "/payment-result"
  | "/info-pksk"
  | "/app"
  | "/app/simulasi"
  | "/app/quiz"
  | "/app/essay"
  | "/app/profile"
  | "/app/pencapaian"
  | "/app/sejarah"
  | "/app/lencana"
  | "/app/bonus"
  | "/app/diamond"
  | "/app/panduan"
  | "/admin"
  | "/admin/users"
  | "/admin/subscriptions"
  | "/admin/payment-requests"
  | "/admin/agents"
  | "/admin/questions"
  | "/admin/questions/import"
  | "/admin/questions/import-history"
  | "/admin/settings";
type AuthMode = "login" | "register";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const navItems: Array<{ to: AppRoute; label: string; icon: LucideIcon; shortLabel?: string; authOnly?: boolean; premiumOnly?: boolean; adminOnly?: boolean; diamondOnly?: boolean }> = [
  { to: "/app", label: "Dashboard", shortLabel: "Utama", icon: LayoutDashboard, authOnly: true, premiumOnly: true },
  { to: "/info-pksk", label: "Info PKSK", shortLabel: "Info", icon: Info },
  { to: "/app/simulasi", label: "Simulasi", shortLabel: "Simulasi", icon: Target, authOnly: true, premiumOnly: true },
  { to: "/app/pencapaian", label: "Pencapaian", shortLabel: "Skor", icon: Award, authOnly: true, premiumOnly: true },
  { to: "/app/lencana", label: "Lencana", icon: Trophy, authOnly: true, premiumOnly: true },
  { to: "/app/bonus", label: "Bonus", icon: Gift, authOnly: true, premiumOnly: true },
  { to: "/app/diamond", label: "Diamond", icon: Gem, authOnly: true, premiumOnly: true, diamondOnly: true },
  { to: "/app/sejarah", label: "Sejarah", shortLabel: "Rekod", icon: History, authOnly: true, premiumOnly: true },
  { to: "/app/panduan", label: "Panduan", icon: BookOpen, authOnly: true, premiumOnly: true },
  { to: "/admin", label: "Admin Panel", shortLabel: "Admin", icon: Users, authOnly: true, adminOnly: true },
];

const bottomNavItems = navItems.filter((item) => ["/app", "/app/simulasi", "/app/bonus", "/app/pencapaian", "/app/lencana"].includes(item.to));
const adminRoutes: AppRoute[] = ["/admin", "/admin/users", "/admin/subscriptions", "/admin/payment-requests", "/admin/agents", "/admin/questions", "/admin/questions/import", "/admin/questions/import-history", "/admin/settings"];
const publicRoutes = new Set<AppRoute>(["/", "/preview", "/premium", "/login", "/register", "/checkout", "/payment-result", "/info-pksk"]);
const premiumRoutes = new Set<AppRoute>([
  "/app",
  "/app/simulasi",
  "/app/quiz",
  "/app/essay",
  "/app/profile",
  "/app/pencapaian",
  "/app/sejarah",
  "/app/lencana",
  "/app/bonus",
  "/app/diamond",
  "/app/panduan",
]);
const validRoutes = new Set<AppRoute>(
  navItems.map((item) => item.to).concat([
    "/preview",
    "/premium",
    "/login",
    "/register",
    "/checkout",
    "/payment-result",
    "/info-pksk",
    "/app/quiz",
    "/app/essay",
    "/app/profile",
    "/admin/users",
    "/admin/subscriptions",
    "/admin/payment-requests",
    "/admin/agents",
    "/admin/questions",
    "/admin/questions/import",
    "/admin/questions/import-history",
    "/admin/settings",
  ]),
);
const legacyRouteMap: Record<string, AppRoute> = {
  "/simulasi": "/app/simulasi",
  "/latihan": "/app/simulasi",
  "/app/latihan": "/app/simulasi",
  "/quiz": "/app/quiz",
  "/essay": "/app/essay",
  "/profile": "/app/profile",
  "/performance": "/app/pencapaian",
  "/history": "/app/sejarah",
  "/achievements": "/app/lencana",
  "/bonus": "/app/bonus",
  "/guide": "/app/panduan",
};

const avatars = ["Cemerlang", "Berani", "Bijak", "Tekun", "Kreatif"];
const appLogoPath = "/assets/pksk-academy-logo.png";
const appLogoMarkPath = "/assets/pksk-academy-mark.png";
const ieffaSupportAvatarPath = "/assets/ieffa-support-avatar.png";
const WHATSAPP_SUPPORT_NUMBER = "60197259548";
const WHATSAPP_SUPPORT_MESSAGE = "Hi, saya perlukan bantuan berkaitan PKSK Academy.";
const rememberedEmailKey = "pksk-remembered-email";
const spaRedirectStorageKey = "pksk-spa-redirect";
type BonusMaterial = {
  title: string;
  subject: string;
  level: string;
  description: string;
  filePath: string;
  coverPath: string;
  accent: string;
};
const bonusMaterials: BonusMaterial[] = [
  {
    title: "Peribahasa Mengikut Tema",
    subject: "Bahasa Melayu",
    level: "Tahun 4-6",
    description: "Koleksi peribahasa mengikut tema untuk bantu murid menulis dengan lebih menarik.",
    filePath: "/bonus/peribahasa-mengikut-tema.pdf",
    coverPath: "/assets/bonus-covers/peribahasa-mengikut-tema.svg",
    accent: "from-ocean-600 to-teal-500",
  },
  {
    title: "Latihan Tatabahasa Tahun 4-6",
    subject: "Bahasa Melayu",
    level: "Tahun 4-6",
    description: "Latihan tambahan untuk kukuhkan asas tatabahasa secara berperingkat.",
    filePath: "/bonus/latihan-tatabahasa-tahun-4-6.pdf",
    coverPath: "/assets/bonus-covers/latihan-tatabahasa-tahun-4-6.png",
    accent: "from-sky-600 to-ocean-500",
  },
  {
    title: "Matematik Tahun 4",
    subject: "Matematik",
    level: "Tahun 4",
    description: "Set latihan Matematik asas untuk bina keyakinan sebelum topik lebih mencabar.",
    filePath: "/bonus/matematik-tahun-4.pdf",
    coverPath: "/assets/bonus-covers/matematik-tahun-4.png",
    accent: "from-blue-600 to-ocean-500",
  },
  {
    title: "Matematik Tahun 5",
    subject: "Matematik",
    level: "Tahun 5",
    description: "Latihan pengukuhan Matematik bagi kemahiran numerasi dan penyelesaian masalah.",
    filePath: "/bonus/matematik-tahun-5.pdf",
    coverPath: "/assets/bonus-covers/matematik-tahun-5.png",
    accent: "from-indigo-600 to-sky-500",
  },
  {
    title: "Matematik Tahun 6",
    subject: "Matematik",
    level: "Tahun 6",
    description: "Bahan latih tubi Matematik Tahun 6 untuk persediaan yang lebih mantap.",
    filePath: "/bonus/matematik-tahun-6.pdf",
    coverPath: "/assets/bonus-covers/matematik-tahun-6.png",
    accent: "from-ocean-700 to-blue-500",
  },
  {
    title: "TN90 Sains Tahun 4",
    subject: "Sains",
    level: "Tahun 4",
    description: "Latihan Sains bergambar untuk kukuhkan pemahaman konsep asas.",
    filePath: "/bonus/tn90-sains-tahun-4.pdf",
    coverPath: "/assets/bonus-covers/tn90-sains-tahun-4.png",
    accent: "from-emerald-600 to-teal-500",
  },
  {
    title: "TN90 Sains Tahun 5",
    subject: "Sains",
    level: "Tahun 5",
    description: "Set latihan Sains untuk topik dan kemahiran proses sains peringkat pertengahan.",
    filePath: "/bonus/tn90-sains-tahun-5.pdf",
    coverPath: "/assets/bonus-covers/tn90-sains-tahun-5.png",
    accent: "from-green-600 to-ocean-500",
  },
  {
    title: "TN90 Sains Tahun 6",
    subject: "Sains",
    level: "Tahun 6",
    description: "Latihan Sains Tahun 6 untuk persediaan akhir dan pengukuhan konsep.",
    filePath: "/bonus/tn90-sains-tahun-6.pdf",
    coverPath: "/assets/bonus-covers/tn90-sains-tahun-6.png",
    accent: "from-teal-700 to-emerald-500",
  },
  {
    title: "TN91 English Tahun 6",
    subject: "English",
    level: "Tahun 6",
    description: "Bahan English tambahan untuk vocabulary, reading dan kemahiran bahasa.",
    filePath: "/bonus/tn91-english-tahun-6.pdf",
    coverPath: "/assets/bonus-covers/tn91-english-tahun-6.png",
    accent: "from-blue-700 to-cyan-500",
  },
];
const defaultAppSettings: AppSettings = {
  free_preview_section_a_limit: 15,
  free_preview_section_b_limit: 20,
  free_preview_section_c_enabled: false,
  payment_provider: "manual_qr_plus_toyyibpay",
  payment_price: 49,
  payment_currency: "MYR",
  payment_plan_code: "lifetime",
  payment_whatsapp_number: "60197259548",
  payment_account_name: "PESONA STORE",
  payment_bank_name: "Maybank",
  payment_account_number: "551146529325",
  payment_qr_image_url: "/assets/duitnow-qr-pesona-store.png",
};
const freePreviewLimits = {
  A: 15,
  B: 20,
} as const;
const fullPreviewTotals = {
  A: 30,
  B: 70,
  C: 1,
} as const;
const freePreviewDurationSeconds = 90 * 60;
const databaseSetupMessage = "Sistem akses premium sedang disiapkan. Sila cuba semula sebentar lagi.";
const pkskInfoQuickLinks = [
  { id: "apa-itu-pksk", label: "Apa Itu PKSK" },
  { id: "sekolah-khusus", label: "Sekolah Khusus" },
  { id: "tarikh-penting", label: "Tarikh Penting" },
  { id: "format-pksk", label: "Format PKSK" },
  { id: "persediaan", label: "Persediaan" },
  { id: "faq-pksk", label: "FAQ" },
];
const pkskAudienceCards: Array<{ title: string; text: string; icon: LucideIcon; tone: string }> = [
  {
    title: "Tingkatan 1",
    text: "Untuk calon yang memohon kemasukan ke sekolah khusus dan MRSM bagi kemasukan Tingkatan 1.",
    icon: GraduationCap,
    tone: "bg-ocean-50 text-ocean-700",
  },
  {
    title: "Tingkatan 4",
    text: "Untuk calon yang memohon kemasukan ke sekolah khusus dan MRSM bagi kemasukan Tingkatan 4.",
    icon: BookOpen,
    tone: "bg-leaf-50 text-leaf-600",
  },
  {
    title: "Tahun 1 SVM",
    text: "Hebahan KPM 2027 turut menyebut permohonan bagi Tahun 1 Sijil Vokasional Malaysia (SVM).",
    icon: ClipboardList,
    tone: "bg-sun-50 text-amber-700",
  },
];
const pkskFormatCards: Array<{
  title: string;
  label: string;
  text: string;
  icon: LucideIcon;
  tone: string;
  ctaLabel: string;
  route: AppRoute;
}> = [
  {
    title: "Bahagian A",
    label: "Kecerdasan Insaniah",
    text: "Latihan umum yang membantu calon membiasakan diri dengan situasi, nilai diri dan pilihan respons yang matang.",
    icon: HeartHandshake,
    tone: "bg-ocean-50 text-ocean-700",
    ctaLabel: "Cuba Bahagian A",
    route: "/app/simulasi",
  },
  {
    title: "Bahagian B",
    label: "Kecerdasan Intelek",
    text: "Latihan umum untuk mengasah pemikiran logik, kefahaman, penaakulan dan penyelesaian masalah.",
    icon: Brain,
    tone: "bg-leaf-50 text-leaf-600",
    ctaLabel: "Cuba Bahagian B",
    route: "/app/simulasi",
  },
  {
    title: "Bahagian C",
    label: "Artikulasi Penulisan",
    text: "Persediaan menulis secara tersusun dengan idea yang jelas, huraian ringkas dan bahasa yang kemas.",
    icon: PenLine,
    tone: "bg-sun-50 text-amber-700",
    ctaLabel: "Latihan Bahagian C",
    route: "/app/essay",
  },
];
const pkskPrepCards: Array<{ title: string; text: string; icon: LucideIcon }> = [
  { title: "Kenali format", text: "Fahami jenis latihan yang akan dihadapi tanpa menghafal satu bentuk soalan sahaja.", icon: BookOpen },
  { title: "Latih pengurusan masa", text: "Biasakan diri menjawab dengan tenang dan tersusun dalam tempoh latihan.", icon: Clock3 },
  { title: "Buat latihan pelbagai", text: "Gunakan set latihan berbeza supaya cara berfikir lebih fleksibel.", icon: ClipboardList },
  { title: "Kenal pasti kelemahan", text: "Semak rekod latihan untuk melihat bahagian yang perlu diberi perhatian.", icon: Target },
  { title: "Berlatih konsisten", text: "Latihan pendek tetapi kerap lebih mudah dijadikan rutin harian.", icon: CalendarCheck },
];
const pkskFaqItems = [
  {
    question: "Apa itu PKSK?",
    answer:
      "PKSK ialah pentaksiran yang digunakan dalam proses kemasukan ke Sekolah Khusus dan MRSM. Calon perlu merujuk portal rasmi KPM untuk maklumat permohonan dan pelaksanaan yang terkini.",
  },
  {
    question: "Siapa yang perlu menduduki PKSK?",
    answer:
      "Calon yang memohon kemasukan ke sekolah khusus dan MRSM bagi sesi yang diumumkan oleh KPM perlu mengikuti proses yang ditetapkan, termasuk PKSK jika dinyatakan dalam hebahan rasmi.",
  },
  {
    question: "Bilakah PKSK 2027 berlangsung?",
    answer:
      "Berdasarkan hebahan KPM, PKSK Tingkatan 4 berlangsung pada 21 September hingga 1 Oktober 2026, manakala PKSK Tingkatan 1 berlangsung pada 12 hingga 22 Oktober 2026.",
  },
  {
    question: "Bagaimana cara membuat persediaan?",
    answer:
      "Calon boleh mula dengan memahami format umum, membuat latihan berstruktur, menyemak kelemahan dan menjaga rutin belajar yang konsisten.",
  },
  {
    question: "Adakah PKSK Academy laman rasmi KPM?",
    answer:
      "Tidak. PKSK Academy oleh CikguSTEM ialah platform persediaan dan latihan bebas dan bukan laman rasmi Kementerian Pendidikan Malaysia.",
  },
];
const countdownUnits = [
  { key: "days", label: "HARI" },
  { key: "hours", label: "JAM" },
  { key: "minutes", label: "MINIT" },
  { key: "seconds", label: "SAAT" },
] as const;
const pkskCountdownHighlights: Array<{ icon: LucideIcon; title: string; text: string; tone: string }> = [
  { icon: CalendarCheck, title: "Persediaan hari ini", text: "kejayaan esok", tone: "bg-blue-50 text-blue-700 ring-blue-100" },
  { icon: Target, title: "Fokus, usaha", text: "dan doa", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  { icon: Trophy, title: "Lakukan yang terbaik", text: "serahkan selebihnya", tone: "bg-amber-50 text-amber-700 ring-amber-100" },
];
const pkskCountdownThemes: Partial<
  Record<
    PkskInfoEventId,
    {
      badge: string;
      message: string;
      background: string;
      glow: string;
      unitText: string;
      progress: string;
      leftIcon: LucideIcon;
      rightIcon: LucideIcon;
    }
  >
> = {
  form4: {
    badge: "Teruskan usaha!",
    message: "Setiap hari adalah satu langkah lebih dekat ke kejayaan!",
    background: "linear-gradient(135deg, #062B6F 0%, #0647A8 52%, #0891B2 100%)",
    glow: "bg-cyan-300/25",
    unitText: "text-cyan-200",
    progress: "linear-gradient(90deg, #38BDF8 0%, #22D3EE 48%, #14B8A6 100%)",
    leftIcon: Rocket,
    rightIcon: Trophy,
  },
  form1: {
    badge: "Jom bersiap!",
    message: "Fokus, konsisten dan yakin pada diri sendiri!",
    background: "linear-gradient(135deg, #064E3B 0%, #047857 48%, #0F766E 100%)",
    glow: "bg-emerald-300/25",
    unitText: "text-emerald-200",
    progress: "linear-gradient(90deg, #A7F3D0 0%, #6EE7B7 48%, #22C55E 100%)",
    leftIcon: Sparkles,
    rightIcon: Target,
  },
};
const pkskTimelineThemes: Partial<Record<PkskInfoEventId, { icon: LucideIcon; tone: string }>> = {
  application: { icon: ClipboardList, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  centreCheck: { icon: Search, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  form4: { icon: BookOpen, tone: "bg-blue-50 text-blue-700 ring-blue-100" },
  form1: { icon: Users, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
};
const oneSecondMs = 1000;
const oneMinuteMs = 60 * oneSecondMs;
const oneHourMs = 60 * oneMinuteMs;
const oneDayMs = 24 * oneHourMs;
const urgentCountdownMs = 7 * oneDayMs;

function accessStatusFromProfile(profile: ProfileRow | null): AccessStatus {
  const role = profile?.role ?? "user";
  const subscriptionStatus = profile?.is_blocked ? "blocked" : (profile?.subscription_status ?? "free");
  const endsAt = profile?.subscription_ends_at ?? null;
  const hasEnded = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
  const isExpired = subscriptionStatus === "expired" || (subscriptionStatus === "premium" && hasEnded);
  const isBlocked = subscriptionStatus === "blocked" || Boolean(profile?.is_blocked);
  const isPremium = subscriptionStatus === "premium" && !isExpired && !isBlocked;

  return {
    is_guest: !profile,
    role,
    subscription_status: isBlocked ? "blocked" : isExpired ? "expired" : subscriptionStatus,
    subscription_plan: profile?.subscription_plan ?? null,
    subscription_started_at: profile?.subscription_started_at ?? null,
    subscription_ends_at: endsAt,
    is_premium: isPremium,
    is_admin: (role === "admin" || role === "super_admin") && !isBlocked,
    is_super_admin: role === "super_admin" && !isBlocked,
    is_blocked: isBlocked,
    is_expired: isExpired,
  };
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => isRecoveryLink());
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [questionBankCounts, setQuestionBankCounts] = useState<QuestionBankCounts | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [badges, setBadges] = useState<BadgeWithProgress[]>([]);
  const [pendingPayment, setPendingPayment] = useState<PaymentRequest | null>(null);
  const [diamondProfile, setDiamondProfile] = useState<DiamondProfile | null>(null);
  const [activePayload, setActivePayload] = useState<AttemptPayload | null>(null);
  const [result, setResult] = useState<CompleteAttemptResult | null>(null);
  const [activeEssayPayload, setActiveEssayPayload] = useState<EssayAttemptPayload | null>(null);
  const [essayResult, setEssayResult] = useState<EssaySubmitResult | null>(null);
  const [guestPayload, setGuestPayload] = useState<GuestPreviewPayload | null>(null);
  const [guestResult, setGuestResult] = useState<GuestPreviewResult | null>(null);
  const [guestAnswers, setGuestAnswers] = useState<Record<string, string>>({});
  const [guestSkipped, setGuestSkipped] = useState<Record<string, boolean>>({});
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [autoOpenPayment, setAutoOpenPayment] = useState(false);

  const isLoggedIn = Boolean(session?.user);
  const access = useAccess(session, profile, accessStatus);
  const profileReady = Boolean(profile?.display_name && profile?.school && profile?.state && profile?.class_name);
  const earnedBadgeCount = badges.filter((badge) => badge.earned).length;
  const performance = useMemo(() => calculatePerformance(profile, attempts, earnedBadgeCount), [attempts, earnedBadgeCount, profile]);
  const canShowSocialProofNotification =
    isSupabaseConfigured && !loading && currentRoute === "/" && (!isLoggedIn || (Boolean(accessStatus) && !access.isPremium && !access.isBlocked));
  const { currentItem, dismissCurrentItem } = useSocialProofNotifications(canShowSocialProofNotification);

  useEffect(() => {
    const urlReferralCode = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
    captureReferralCodeFromUrl();
    trackReferralClick(urlReferralCode).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    fetchAppSettings().then(setAppSettings).catch(() => setAppSettings(defaultAppSettings));
    fetchQuestionBankCounts().then(setQuestionBankCounts).catch(() => setQuestionBankCounts(null));

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (isRecoveryLink()) {
        setAuthMode("login");
        setIsPasswordRecovery(true);
        window.history.replaceState({}, "", "/login");
        setCurrentRoute("/login");
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("login");
        setIsPasswordRecovery(true);
        window.history.replaceState({}, "", "/login");
        setCurrentRoute("/login");
      }
      if (!nextSession) {
        setProfile(null);
        setAccessStatus(null);
        setAttempts([]);
        setBadges([]);
        setPendingPayment(null);
        setDiamondProfile(null);
        setActivePayload(null);
        setActiveEssayPayload(null);
        setEssayResult(null);
        setIsPasswordRecovery(false);
        window.localStorage.removeItem("pksk-active-attempt");
        window.localStorage.removeItem("pksk-active-essay");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalledApp(standalone);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setIsInstalledApp(true);
      setShowInstallHelp(false);
      setMessage("PKSK Academy berjaya dipasang.");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setCurrentRoute(getCurrentRoute());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const refreshData = useCallback(async (userId = session?.user.id) => {
    if (!userId) {
      return;
    }

    try {
      setMessage(null);
      await recordLastLogin();
      const nextProfile = await fetchProfile(userId);
      let nextAccessStatus = accessStatusFromProfile(nextProfile);
      try {
        nextAccessStatus = await fetchAccessStatus();
      } catch (accessError) {
        setMessage(toMessage(accessError));
      }
      const nextAttempts = await fetchAttemptHistory();
      const nextBadges = await fetchBadgesWithProgress(nextProfile, nextAttempts);
      const activeAttempt = nextAccessStatus.is_premium ? await fetchActiveAttempt() : null;
      const activeEssayAttemptId = nextAccessStatus.is_premium ? await fetchActiveEssayAttempt().catch(() => null) : null;
      const nextPendingPayment = nextAccessStatus.is_premium ? null : await fetchMyPendingPaymentRequest().catch(() => null);
      const nextDiamondProfile = nextAccessStatus.is_premium ? await fetchMyDiamondProfile().catch(() => null) : null;
      setProfile(nextProfile);
      setAccessStatus(nextAccessStatus);
      setAttempts(nextAttempts);
      setBadges(nextBadges);
      setPendingPayment(nextPendingPayment);
      setDiamondProfile(nextDiamondProfile);

      const savedAttemptId = window.localStorage.getItem("pksk-active-attempt") ?? activeAttempt?.id;
      if (savedAttemptId) {
        const payload = await getAttemptPayload(savedAttemptId);
        if (payload.attempt.status === "in_progress") {
          setActivePayload(payload);
          window.localStorage.setItem("pksk-active-attempt", payload.attempt.id);
        }
      }

      const savedEssayAttemptId = window.localStorage.getItem("pksk-active-essay") ?? activeEssayAttemptId;
      if (savedEssayAttemptId) {
        const essayPayload = await getEssayAttemptPayload(savedEssayAttemptId).catch(() => null);
        if (essayPayload?.attempt.status === "in_progress") {
          setActiveEssayPayload(essayPayload);
          window.localStorage.setItem("pksk-active-essay", essayPayload.attempt.id);
        }
      }
    } catch (error) {
      setMessage(toMessage(error));
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) {
      return;
    }

    rememberStoredReferralAttribution().catch(() => undefined);
    refreshData(session.user.id);
  }, [refreshData, session?.user.id]);

  const navigate = useCallback((to: AppRoute) => {
    window.history.pushState({}, "", to);
    setCurrentRoute(to);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  function openAuth(mode: AuthMode) {
    setIsPasswordRecovery(false);
    setAuthMode(mode);
    navigate(mode === "login" ? "/login" : "/register");
  }

  const openPaywall = useCallback(() => {
    setAutoOpenPayment(true);
    navigate("/premium");
  }, [navigate]);

  const handlePaymentDialogOpened = useCallback(() => {
    setAutoOpenPayment(false);
  }, []);

  async function handlePaymentSubmitted() {
    if (session?.user.id) {
      const nextPendingPayment = await fetchMyPendingPaymentRequest().catch(() => null);
      setPendingPayment(nextPendingPayment);
    }
    setMessage("Terima kasih. Sila tunggu pengesahan daripada Admin. Akaun Premium akan diaktifkan selepas pembayaran disahkan.");
  }

  const refreshCurrentUserData = useCallback(() => (session?.user.id ? refreshData(session.user.id) : Promise.resolve()), [refreshData, session?.user.id]);

  async function handleInstallApp() {
    if (isInstalledApp) {
      setMessage("PKSK Academy sudah dipasang pada peranti ini.");
      return;
    }

    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setMessage("PKSK Academy sedang dipasang.");
    } else {
      setShowInstallHelp(true);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    navigate("/");
  }

  async function handleAuth(email: string, password: string, displayName: string, rememberMe = false) {
    if (!supabase) {
      setMessage("Sistem simulasi belum bersedia. Sila cuba semula selepas tetapan selesai.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setBusy(true);
    setMessage(null);
    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: displayName,
            },
          },
        });
        if (error) {
          throw new Error(error.message);
        }
        if (data.user && data.session) {
          const nextProfile = await saveProfile({
            id: data.user.id,
            full_name: displayName,
            display_name: displayName,
            school: "",
            state: "",
            class_name: "",
            avatar: avatars[0],
          });
          setProfile(nextProfile);
          navigate("/premium");
        } else {
          setMessage("Akaun berjaya didaftarkan. Sila semak e-mel jika pengesahan diperlukan, kemudian log masuk.");
          setAuthMode("login");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          throw new Error(error.message);
        }
        if (rememberMe) {
          window.localStorage.setItem(rememberedEmailKey, cleanEmail);
        } else {
          window.localStorage.removeItem(rememberedEmailKey);
        }
        const nextStatus = await fetchAccessStatus().catch(() => null);
        if (data.user?.id) {
          await refreshData(data.user.id).catch(() => undefined);
        }
        if (nextStatus?.is_blocked || nextStatus?.is_expired) {
          navigate("/premium");
        } else if (nextStatus?.is_admin && !nextStatus?.is_premium) {
          navigate("/admin");
        } else if (nextStatus?.is_premium) {
          navigate("/app");
        } else {
          navigate("/premium");
        }
      }
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordResetRequest(email: string) {
    if (!supabase) {
      setMessage("Sistem simulasi belum bersedia. Sila cuba semula selepas tetapan selesai.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Masukkan e-mel akaun dahulu.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) {
        throw new Error(error.message);
      }
      window.localStorage.setItem(rememberedEmailKey, cleanEmail);
      setMessage("Pautan tukar kata laluan sudah dihantar. Sila semak e-mel anda.");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate(password: string) {
    if (!supabase) {
      setMessage("Sistem simulasi belum bersedia. Sila cuba semula selepas tetapan selesai.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw new Error(error.message);
      }
      setIsPasswordRecovery(false);
      setMessage("Kata laluan baharu berjaya disimpan.");
      navigate("/");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileSave(input: Omit<ProfileInput, "id">) {
    if (!session?.user) {
      setMessage("Sila log masuk dahulu.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const nextProfile = await saveProfile({ ...input, id: session.user.id });
      setProfile(nextProfile);
      setMessage("Profil berjaya disimpan.");
      navigate("/app");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartQuiz(mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) {
    if (!isLoggedIn) {
      openAuth("login");
      setMessage("Sila log masuk untuk membuka simulasi premium.");
      return;
    }

    if (!access.canUsePremiumFeature()) {
      openPaywall();
      return;
    }

    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const attemptId = await generateQuiz({ mode, section, numberOfQuestions });
      const payload = await getAttemptPayload(attemptId);
      setActivePayload(payload);
      window.localStorage.setItem("pksk-active-attempt", attemptId);
      navigate("/app/quiz");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartEssay() {
    if (!isLoggedIn) {
      openAuth("login");
      setMessage("Sila log masuk untuk membuka Bahagian C.");
      return;
    }

    if (!access.canUsePremiumFeature()) {
      openPaywall();
      return;
    }

    if (activeEssayPayload?.attempt.status === "in_progress") {
      navigate("/app/essay");
      return;
    }

    setBusy(true);
    setMessage(null);
    setEssayResult(null);
    try {
      const attemptId = await startEssayAttempt();
      const payload = await getEssayAttemptPayload(attemptId);
      setActiveEssayPayload(payload);
      window.localStorage.setItem("pksk-active-essay", attemptId);
      navigate("/app/essay");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleEssayAutosave(responseText: string) {
    if (!activeEssayPayload) {
      return null;
    }

    const saved = await autosaveEssayResponse(activeEssayPayload.attempt.id, responseText);
    setActiveEssayPayload((current) =>
      current
        ? {
            ...current,
            response: {
              ...current.response,
              response_text: responseText,
              word_count: saved.word_count,
              autosaved_at: saved.autosaved_at,
            },
          }
        : current,
    );
    return saved;
  }

  async function handleEssaySubmit(responseText: string): Promise<EssaySubmitResult | null> {
    if (!activeEssayPayload || !session?.user) {
      return null;
    }

    setBusy(true);
    setMessage(null);
    try {
      const submitted = await submitEssayResponse(activeEssayPayload.attempt.id, responseText);
      setEssayResult(submitted);
      setActiveEssayPayload(null);
      window.localStorage.removeItem("pksk-active-essay");
      setMessage(`${submitted.message} ${submitted.ai_note}`);
      await refreshData(session.user.id);
      return submitted;
    } catch (error) {
      setMessage(toMessage(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeQuiz() {
    if (!activePayload) {
      return;
    }
    const payload = await getAttemptPayload(activePayload.attempt.id);
    setActivePayload(payload);
    navigate("/app/quiz");
  }

  function handleResumeEssay() {
    if (activeEssayPayload) {
      navigate("/app/essay");
    }
  }

  async function handleAnswer(questionId: string, optionId: string) {
    if (!activePayload) {
      return;
    }

    const attemptId = activePayload.attempt.id;
    setMessage(null);
    setActivePayload((currentPayload) =>
      currentPayload
        ? {
            ...currentPayload,
            questions: currentPayload.questions.map((question) =>
              question.id === questionId ? { ...question, selected_option_id: optionId, answer_status: "answered" } : question,
            ),
          }
        : currentPayload,
    );

    try {
      await submitAnswer(attemptId, questionId, optionId);
    } catch (error) {
      setMessage(`Jawapan ditanda pada skrin, tetapi belum dapat disimpan ke Supabase. ${toMessage(error)}`);
    }
  }

  async function handleSkipAnswer(questionId: string): Promise<boolean> {
    if (!activePayload) {
      return false;
    }

    const attemptId = activePayload.attempt.id;
    setMessage(null);
    setActivePayload((currentPayload) =>
      currentPayload
        ? {
            ...currentPayload,
            questions: currentPayload.questions.map((question) =>
              question.id === questionId ? { ...question, selected_option_id: null, answer_status: "skipped" } : question,
            ),
          }
        : currentPayload,
    );

    try {
      await skipAnswer(attemptId, questionId);
      return true;
    } catch (error) {
      setMessage(`Soalan sudah ditanda skip pada skrin, tetapi belum dapat disimpan ke Supabase. ${toMessage(error)}`);
      return true;
    }
  }

  async function handleCompleteAttempt() {
    if (!activePayload || !session?.user) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const completed = await completeAttempt(activePayload.attempt.id);
      setResult(completed);
      setActivePayload(null);
      window.localStorage.removeItem("pksk-active-attempt");
      await refreshData(session.user.id);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartGuestPreview(section: "A" | "B") {
    setBusy(true);
    setMessage(null);
    setGuestResult(null);
    setGuestAnswers({});
    setGuestSkipped({});
    try {
      const [sectionAPayload, sectionBPayload] = await Promise.all([
        fetchGuestPreview("A", freePreviewLimits.A),
        fetchGuestPreview("B", freePreviewLimits.B),
      ]);
      const payload: GuestPreviewPayload = {
        section,
        limit: freePreviewLimits.A + freePreviewLimits.B,
        questions: [...sectionAPayload.questions, ...sectionBPayload.questions],
      };
      setGuestPayload(payload);
      navigate("/preview");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function handleGuestAnswer(questionId: string, optionId: string) {
    setGuestAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }));
    setGuestSkipped((current) => {
      const nextSkipped = { ...current };
      delete nextSkipped[questionId];
      return nextSkipped;
    });
  }

  function handleGuestSkip(questionId: string) {
    setGuestSkipped((current) => ({
      ...current,
      [questionId]: true,
    }));
    setGuestAnswers((current) => {
      const nextAnswers = { ...current };
      delete nextAnswers[questionId];
      return nextAnswers;
    });
  }

  async function handleCompleteGuestPreview() {
    if (!guestPayload) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const answers = guestPayload.questions
        .map((question) => ({
          question_id: question.id,
          selected_option_id: guestAnswers[question.id],
        }))
        .filter((answer) => Boolean(answer.selected_option_id));
      const previewResult = await scoreGuestPreview(answers);
      setGuestResult(previewResult);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const page = (() => {
    if (currentRoute === "/info-pksk") {
      return <InfoPkskPage onNavigate={navigate} />;
    }

    if (loading) {
      return <LoadingPage />;
    }

    if (!isSupabaseConfigured) {
      return <SetupNotice />;
    }

    if (currentRoute === "/login" || currentRoute === "/register") {
      return (
        <AuthPage
          mode={authMode}
          busy={busy}
          isPasswordRecovery={isPasswordRecovery}
          onMode={openAuth}
          onSubmit={handleAuth}
          onPasswordResetRequest={handlePasswordResetRequest}
          onPasswordUpdate={handlePasswordUpdate}
        />
      );
    }
    if (isLoggedIn && !accessStatus) {
      return <LoadingPage />;
    }

    if (currentRoute === "/") {
      return (
        <LandingPage
          settings={appSettings}
          questionBankCounts={questionBankCounts}
          onStartGuestPreview={handleStartGuestPreview}
          onShowPaywall={openPaywall}
        />
      );
    }
    if (currentRoute === "/preview") {
      return (
        <GuestPreviewPage
          payload={guestPayload}
          answers={guestAnswers}
          skipped={guestSkipped}
          result={guestResult}
          busy={busy}
          onAnswer={handleGuestAnswer}
          onSkip={handleGuestSkip}
          onComplete={handleCompleteGuestPreview}
          onNavigate={navigate}
          onShowPaywall={openPaywall}
          onAuthMode={openAuth}
          onStartGuestPreview={handleStartGuestPreview}
        />
      );
    }
    if (currentRoute === "/premium") {
      return (
        <PaywallPage
          isLoggedIn={isLoggedIn}
          access={access}
          settings={appSettings}
          userEmail={session?.user.email ?? ""}
          profileName={profile?.display_name ?? profile?.full_name ?? ""}
          pendingPayment={pendingPayment}
          autoOpenPayment={autoOpenPayment}
          onAuth={openAuth}
          onNavigate={navigate}
          onAutoOpenPaymentHandled={handlePaymentDialogOpened}
          onPaymentSubmitted={handlePaymentSubmitted}
        />
      );
    }
    if (currentRoute === "/checkout") {
      return <CheckoutPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
    }
    if (currentRoute === "/payment-result") {
      return (
        <PaymentResultPage
          isLoggedIn={isLoggedIn}
          access={access}
          onAuth={openAuth}
          onNavigate={navigate}
          onRefreshStatus={refreshCurrentUserData}
        />
      );
    }
    if (adminRoutes.includes(currentRoute)) {
      if (!isLoggedIn) {
        return (
          <AuthPage
            mode="login"
            busy={busy}
            isPasswordRecovery={isPasswordRecovery}
            onMode={openAuth}
            onSubmit={handleAuth}
            onPasswordResetRequest={handlePasswordResetRequest}
            onPasswordUpdate={handlePasswordUpdate}
          />
        );
      }
      if (!access.isAdmin) {
        return <AccessDeniedPage onNavigate={navigate} />;
      }
      if (currentRoute === "/admin/users") {
        return <AdminUsersPage isSuperAdmin={access.isSuperAdmin} onMessage={setMessage} />;
      }
      if (currentRoute === "/admin/questions") {
        return <AdminQuestionsPage onMessage={setMessage} />;
      }
      if (currentRoute === "/admin/questions/import") {
        return <AdminQuestionImportPage onMessage={setMessage} />;
      }
      if (currentRoute === "/admin/questions/import-history") {
        return <AdminImportHistoryPage onMessage={setMessage} />;
      }
      if (currentRoute === "/admin/subscriptions") {
        return <AdminSubscriptionsPage />;
      }
      if (currentRoute === "/admin/payment-requests") {
        return <AdminPaymentRequestsPage onMessage={setMessage} onPaymentUpdated={() => session?.user.id ? refreshData(session.user.id) : undefined} />;
      }
      if (currentRoute === "/admin/agents") {
        return <AdminDiamondPartnersPage onMessage={setMessage} />;
      }
      if (currentRoute === "/admin/settings") {
        return <AdminSettingsPage settings={appSettings} />;
      }
      return <AdminDashboardPage onNavigate={navigate} onMessage={setMessage} />;
    }
    if (premiumRoutes.has(currentRoute) && access.isGuest) {
      return <PremiumRouteGate onStartGuestPreview={handleStartGuestPreview} onAuth={openAuth} onShowPaywall={openPaywall} />;
    }
    if (premiumRoutes.has(currentRoute) && access.isBlocked) {
      return (
        <AccessDeniedPage
          title="Akses tidak dibenarkan"
          text="Akaun ini sedang disemak. Sila hubungi pentadbir untuk mendapatkan bantuan."
          buttonLabel="Lihat Premium"
          buttonRoute="/premium"
          onNavigate={navigate}
        />
      );
    }
    if (premiumRoutes.has(currentRoute) && !access.canUsePremiumFeature()) {
      return (
        <PaywallPage
          isLoggedIn={isLoggedIn}
          access={access}
          settings={appSettings}
          userEmail={session?.user.email ?? ""}
          profileName={profile?.display_name ?? profile?.full_name ?? ""}
          pendingPayment={pendingPayment}
          autoOpenPayment={autoOpenPayment}
          onAuth={openAuth}
          onNavigate={navigate}
          onAutoOpenPaymentHandled={handlePaymentDialogOpened}
          onPaymentSubmitted={handlePaymentSubmitted}
        />
      );
    }
    if (currentRoute === "/app") {
      return (
        <Dashboard
          isLoggedIn={isLoggedIn}
          access={access}
          profile={profile}
          profileReady={profileReady}
          performance={performance}
          pendingPayment={pendingPayment}
          diamondProfile={diamondProfile}
          questionBankCounts={questionBankCounts}
          activePayload={activePayload}
          activeEssayPayload={activeEssayPayload}
          onNavigate={navigate}
          onResume={handleResumeQuiz}
          onResumeEssay={handleResumeEssay}
          onStartQuiz={handleStartQuiz}
          onStartEssay={handleStartEssay}
          onStartGuestPreview={handleStartGuestPreview}
          onAuthMode={openAuth}
          onShowPaywall={openPaywall}
          onDiamondProfileUpdated={setDiamondProfile}
        />
      );
    }
    if (currentRoute === "/app/diamond") {
      return (
        <DiamondPage
          diamondProfile={diamondProfile}
          onNavigate={navigate}
          onMessage={setMessage}
          onDiamondProfileUpdated={setDiamondProfile}
        />
      );
    }
    if (currentRoute === "/app/simulasi") {
      return <ModePage isLoggedIn={isLoggedIn} busy={busy} onStartQuiz={handleStartQuiz} onStartEssay={handleStartEssay} onNavigate={navigate} />;
    }
    if (currentRoute === "/app/quiz") {
      return (
        <QuizPage
          payload={activePayload}
          result={result}
          busy={busy}
          onAnswer={handleAnswer}
          onSkip={handleSkipAnswer}
          onComplete={handleCompleteAttempt}
          onNavigate={navigate}
          onStartEssay={handleStartEssay}
        />
      );
    }
    if (currentRoute === "/app/essay") {
      return (
        <EssayAiPage
          payload={activeEssayPayload}
          result={essayResult}
          busy={busy}
          onStartEssay={handleStartEssay}
          onAutosave={handleEssayAutosave}
          onSubmit={handleEssaySubmit}
          onNavigate={navigate}
        />
      );
    }
    if (currentRoute === "/app/profile") {
      return <ProfilePage profile={profile} onSave={handleProfileSave} busy={busy} />;
    }
    if (currentRoute === "/app/pencapaian") {
      return <PerformancePage stats={performance} attempts={attempts} isLoggedIn={isLoggedIn} onNavigate={navigate} />;
    }
    if (currentRoute === "/app/sejarah") {
      return <HistoryPage attempts={attempts} isLoggedIn={isLoggedIn} onNavigate={navigate} />;
    }
    if (currentRoute === "/app/lencana") {
      return <AchievementsPage badges={badges} isLoggedIn={isLoggedIn} onNavigate={navigate} />;
    }
    if (currentRoute === "/app/bonus") {
      return <BonusPage onNavigate={navigate} />;
    }
    return <GuidePage />;
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <TopBar
        currentRoute={currentRoute}
        isLoggedIn={isLoggedIn}
        access={access}
        isMenuOpen={isMenuOpen}
        profile={profile}
        diamondProfile={diamondProfile}
        onNavigate={navigate}
        onPremiumCheckout={openPaywall}
        onMenu={() => setIsMenuOpen((current) => !current)}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 lg:px-8 lg:pb-16">
        {message ? <MessageBanner message={message} onDismiss={() => setMessage(null)} /> : null}
        {page}
      </main>

      {!publicRoutes.has(currentRoute) ? <BottomNav currentRoute={currentRoute} isLoggedIn={isLoggedIn} access={access} diamondProfile={diamondProfile} onNavigate={navigate} /> : null}
      <InstallAppButton
        showHelp={showInstallHelp}
        isInstalled={isInstalledApp}
        onInstall={handleInstallApp}
        onCloseHelp={() => setShowInstallHelp(false)}
      />
      <WhatsAppSupportButton />
      {canShowSocialProofNotification ? (
        <SocialProofNotification item={currentItem} onDismiss={dismissCurrentItem} onOpenPremium={openPaywall} />
      ) : null}
    </div>
  );
}

function TopBar({
  currentRoute,
  isLoggedIn,
  access,
  isMenuOpen,
  profile,
  diamondProfile,
  onNavigate,
  onPremiumCheckout,
  onMenu,
  onSignOut,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  isMenuOpen: boolean;
  profile: ProfileRow | null;
  diamondProfile: DiamondProfile | null;
  onNavigate: (route: AppRoute) => void;
  onPremiumCheckout: () => void;
  onMenu: () => void;
  onSignOut: () => void;
}) {
  const isPublicShell = publicRoutes.has(currentRoute);
  const isPremiumPage = currentRoute === "/premium";
  const isDiamondActive = diamondProfile?.status === "active";
  const marketingLinks: Array<{ to: AppRoute; label: string; tone?: "primary" | "secondary" }> = isLoggedIn
    ? access.canUsePremiumFeature()
      ? [{ to: "/app", label: "Buka PKSK Academy", tone: "primary" }]
      : [{ to: "/premium", label: "Dapatkan Premium", tone: "primary" }]
    : [
        { to: "/preview", label: "Cuba Percuma" },
        { to: "/premium", label: "Dapatkan Premium", tone: "primary" },
      ];
  const visibleMarketingLinks = isPremiumPage ? [] : marketingLinks;
  const visibleMobileMarketingLinks =
    isPremiumPage || currentRoute === "/" ? marketingLinks.filter((item) => item.to !== "/premium") : visibleMarketingLinks;
  const showMobileLogin = isPublicShell && !isLoggedIn && currentRoute !== "/login";
  const renderMarketingButton = (item: { to: AppRoute; label: string; tone?: "primary" | "secondary" }, compact = false) => {
    const isPremiumCta = item.to === "/premium" || item.tone === "primary";

    return (
      <button
        key={item.to}
        type="button"
        onClick={() => (item.to === "/premium" ? onPremiumCheckout() : onNavigate(item.to))}
        className={
          isPremiumCta
            ? `topbar-premium-button ${compact ? "min-h-12 w-full" : "h-11"}`
            : `secondary-button ${compact ? "min-h-12 w-full" : "h-11"} px-4 py-0`
        }
      >
        {isPremiumCta ? (
          <>
            <span className="topbar-premium-badge">Paling Popular</span>
            <Crown size={16} aria-hidden="true" />
          </>
        ) : null}
        {item.label}
      </button>
    );
  };

  return (
    <div className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onNavigate(isPublicShell ? "/" : "/app")}>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white p-1 shadow-soft">
            <img src={appLogoMarkPath} alt="" className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight">PKSK Academy</span>
            <span className="block truncate text-xs font-medium text-slate-500">oleh CikguSTEM</span>
          </span>
        </button>

        <nav className="topbar-main-nav hidden lg:flex" aria-label="Navigasi utama">
          {isPublicShell
            ? currentRoute === "/"
              ? null
              : visibleMarketingLinks.map((item) => renderMarketingButton(item))
            : navItems.map((item) => {
                if (item.authOnly && !isLoggedIn) {
                  return null;
                }
                if (item.premiumOnly && !access.canUsePremiumFeature()) {
                  return null;
                }
                if (item.adminOnly && !access.isAdmin) {
                  return null;
                }
                if (item.diamondOnly && !isDiamondActive) {
                  return null;
                }
                const isBonusNav = item.to === "/app/bonus";
                const isDiamondNav = item.to === "/app/diamond";
                const isActive = currentRoute === item.to;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => onNavigate(item.to)}
                    className={`topbar-nav-button ${
                      isBonusNav
                        ? isActive
                          ? "topbar-nav-button--bonus-active"
                          : "topbar-nav-button--bonus"
                        : isDiamondNav
                          ? isActive
                            ? "topbar-nav-button--diamond-active"
                            : "topbar-nav-button--diamond"
                        : isActive
                          ? "topbar-nav-button--active"
                          : "topbar-nav-button--idle"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <item.icon className="topbar-nav-icon" size={17} aria-hidden="true" />
                    <span className="topbar-nav-label">
                      {item.shortLabel ? (
                        <>
                          <span className="hidden 2xl:inline">{item.label}</span>
                          <span className="2xl:hidden">{item.shortLabel}</span>
                        </>
                      ) : (
                        item.label
                      )}
                    </span>
                  </button>
                );
              })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {isPublicShell ? (
            isLoggedIn && access.canUsePremiumFeature() ? (
              <button type="button" onClick={() => onNavigate("/app")} className="topbar-login-button">
                <UserRound size={17} aria-hidden="true" />
                Buka PKSK Academy
              </button>
            ) : isLoggedIn ? (
              isPremiumPage ? (
                <>
                  <button type="button" onClick={() => onNavigate("/app")} className="topbar-login-button">
                    <UserRound size={17} aria-hidden="true" />
                    {profile?.display_name ?? "Akaun"}
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"
                    aria-label="Log keluar"
                  >
                    <LogOut size={18} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={onPremiumCheckout} className="topbar-premium-button h-11">
                  <span className="topbar-premium-badge">Paling Popular</span>
                  <Crown size={17} aria-hidden="true" />
                  Dapatkan Premium
                </button>
              )
            ) : (
              <button type="button" onClick={() => onNavigate("/login")} className="topbar-login-button">
                <UserRound size={17} aria-hidden="true" />
                Log Masuk
              </button>
            )
          ) : isLoggedIn ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate("/app/profile")}
                className="topbar-account-button"
              >
                <UserRound size={17} aria-hidden="true" />
                <span className="topbar-account-name">{profile?.display_name ?? "Profil"}</span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"
                aria-label="Log keluar"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
          onClick={onMenu}
          aria-label={isMenuOpen ? "Tutup menu" : "Buka menu"}
        >
          {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {isMenuOpen ? (
        <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Navigasi mudah alih">
          <div className="mx-auto grid max-w-7xl gap-2">
            {isPublicShell
              ? visibleMobileMarketingLinks.map((item) => renderMarketingButton(item, true))
              : navItems.map((item) => {
                  if (item.authOnly && !isLoggedIn) {
                    return null;
                  }
                  if (item.premiumOnly && !access.canUsePremiumFeature()) {
                    return null;
                  }
                  if (item.adminOnly && !access.isAdmin) {
                    return null;
                  }
                  if (item.diamondOnly && !isDiamondActive) {
                    return null;
                  }
                  const isBonusNav = item.to === "/app/bonus";
                  const isDiamondNav = item.to === "/app/diamond";
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => onNavigate(item.to)}
                      className={`flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${
                        isBonusNav
                          ? currentRoute === item.to
                            ? "bg-gradient-to-r from-amber-100 to-ocean-50 text-amber-800"
                            : "bg-amber-50 text-amber-800"
                          : isDiamondNav
                            ? currentRoute === item.to
                              ? "bg-slate-900 text-white"
                              : "bg-slate-950 text-cyan-100"
                          : currentRoute === item.to
                            ? "bg-ocean-50 text-ocean-700"
                            : "text-slate-600"
                      }`}
                    >
                      <item.icon size={17} aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
            {showMobileLogin ? (
              <button type="button" onClick={() => onNavigate("/login")} className="topbar-login-button h-12 w-full rounded-xl">
                <UserRound size={17} aria-hidden="true" />
                Log Masuk
              </button>
            ) : null}
            {isLoggedIn ? (
              <button type="button" onClick={onSignOut} className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-600">
                <LogOut size={17} aria-hidden="true" />
                Log keluar
              </button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function BottomNav({
  currentRoute,
  isLoggedIn,
  access,
  diamondProfile,
  onNavigate,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  diamondProfile: DiamondProfile | null;
  onNavigate: (route: AppRoute) => void;
}) {
  const isDiamondActive = diamondProfile?.status === "active";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Navigasi bawah">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {bottomNavItems.map((item) => {
          const disabled = (item.authOnly && !isLoggedIn) || (item.premiumOnly && !access.canUsePremiumFeature()) || (item.adminOnly && !access.isAdmin);
          if (item.diamondOnly && !isDiamondActive) {
            return null;
          }
          const isBonusNav = item.to === "/app/bonus";
          return (
            <button
              key={item.to}
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(item.to)}
              aria-label={item.label}
              className={`grid min-h-[56px] place-items-center rounded-xl px-1 text-[11px] font-bold ${
                isBonusNav
                  ? currentRoute === item.to
                    ? "bg-amber-100 text-amber-800"
                    : "text-amber-700"
                  : currentRoute === item.to
                    ? "bg-ocean-50 text-ocean-700"
                    : "text-slate-500"
              } ${disabled ? "opacity-40" : ""}`}
            >
              <item.icon size={19} aria-hidden="true" />
              <span className="leading-none">{item.shortLabel ?? item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <img src={appLogoPath} alt="PKSK Academy oleh CikguSTEM" className={compact ? "h-24 w-auto max-w-[220px] object-contain" : "h-32 w-auto max-w-[260px] object-contain"} />
    </div>
  );
}

function InstallAppButton({
  showHelp,
  isInstalled,
  onInstall,
  onCloseHelp,
}: {
  showHelp: boolean;
  isInstalled: boolean;
  onInstall: () => void;
  onCloseHelp: () => void;
}) {
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-24 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-ocean-700 lg:bottom-6 lg:right-6"
        onClick={onInstall}
      >
        <Download size={18} aria-hidden="true" />
        Install PKSK Academy
      </button>

      {showHelp ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/40 p-4 sm:place-items-center" role="dialog" aria-modal="true">
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ocean-50 text-ocean-700">
                  <Smartphone size={24} aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-2xl font-black">Install PKSK Academy</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Jika butang install automatik tidak muncul, ikut langkah di bawah mengikut peranti.
                </p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600" onClick={onCloseHelp} aria-label="Tutup panduan install">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <article className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Share2 size={18} className="text-ocean-700" aria-hidden="true" />
                  <h3 className="font-black">iPhone / iPad</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Buka laman ini dalam Safari, tekan butang Share, pilih Add to Home Screen, kemudian tekan Add.
                </p>
              </article>
              <article className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Download size={18} className="text-ocean-700" aria-hidden="true" />
                  <h3 className="font-black">Android / Chrome</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Buka menu browser dan pilih Install app atau Add to Home screen jika prompt automatik belum keluar.
                </p>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function WhatsAppSupportButton() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(WHATSAPP_SUPPORT_MESSAGE)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Hubungi bantuan PKSK Academy melalui WhatsApp"
      className="group fixed bottom-40 right-4 z-40 flex items-center gap-3 rounded-full bg-white/95 p-2 pr-4 text-slate-950 shadow-2xl ring-1 ring-emerald-100 backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(16,185,129,0.28)] focus:outline-none focus:ring-4 focus:ring-emerald-200 lg:bottom-24 lg:right-6"
    >
      <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-400 to-ocean-600 p-1 shadow-lg transition group-hover:scale-105">
        <img src={ieffaSupportAvatarPath} alt="" className="h-full w-full rounded-full object-cover" aria-hidden="true" />
        <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white">
          <MessageCircle size={12} aria-hidden="true" />
        </span>
      </span>
      <span className="hidden text-left sm:block">
        <span className="block text-[11px] font-black uppercase tracking-wide text-emerald-700">Perlukan bantuan?</span>
        <span className="block text-sm font-black leading-tight">Tanya Ieffa</span>
        <span className="block text-xs font-semibold text-slate-500">WhatsApp support</span>
      </span>
      <span className="sr-only">Tanya Ieffa di WhatsApp</span>
    </a>
  );
}

function AuthPanel({
  mode,
  busy,
  onMode,
  onPasswordResetRequest,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  onMode: (mode: AuthMode) => void;
  onPasswordResetRequest: (email: string) => void;
  onSubmit: (email: string, password: string, displayName: string, rememberMe?: boolean) => void;
}) {
  const [email, setEmail] = useState(() => window.localStorage.getItem(rememberedEmailKey) ?? "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(() => Boolean(window.localStorage.getItem(rememberedEmailKey)));
  const [isResetRequestOpen, setIsResetRequestOpen] = useState(false);

  useEffect(() => {
    if (mode === "register") {
      setIsResetRequestOpen(false);
    }
  }, [mode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(email, password, displayName || email.split("@")[0], rememberMe);
  }

  function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPasswordResetRequest(email);
  }

  if (mode === "login" && isResetRequestOpen) {
    return (
      <section className="mb-6 rounded-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:p-6">
        <BrandMark compact />
        <div className="mb-5 mt-5">
          <h2 className="text-xl font-black">Lupa Kata Laluan</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Masukkan e-mel akaun. Kami akan hantar pautan untuk tetapkan kata laluan baharu.</p>
        </div>
        <form className="grid gap-4" onSubmit={handleResetRequest}>
          <Label text="E-mel">
            <input
              className="field"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              required
            />
          </Label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <button type="submit" disabled={busy} className="primary-button">
              {busy ? "Menghantar..." : "Hantar Pautan"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setIsResetRequestOpen(false)}>
              Kembali
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:p-6">
      <BrandMark />
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black">{mode === "login" ? "Log Masuk" : "Daftar Akaun"}</h2>
          <p className="text-sm leading-6 text-slate-500">
            {mode === "login" ? "Sambung simulasi tanpa perlu isi e-mel berulang kali." : "Cipta akaun untuk simpan rekod simulasi sendiri."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onMode(mode === "login" ? "register" : "login")}
          className="inline-flex min-h-14 min-w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-bold leading-tight text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-700"
        >
          {mode === "login" ? "Daftar Akaun" : "Log Masuk"}
        </button>
      </div>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {mode === "register" ? (
          <Label text="Nama paparan">
            <input
              className="field"
              name="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Nama calon"
            />
          </Label>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="E-mel">
            <input
              className="field"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              required
            />
          </Label>
          <Label text="Kata laluan">
            <input
              className="field"
              type="password"
              name="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan kata laluan"
              minLength={6}
              required
            />
          </Label>
        </div>
        {mode === "login" ? (
          <div className="flex flex-col gap-3 text-sm font-bold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-ocean-600"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Ingat saya
            </label>
            <button type="button" className="text-left text-ocean-700 hover:text-ocean-900" onClick={() => setIsResetRequestOpen(true)}>
              Lupa kata laluan?
            </button>
          </div>
        ) : null}
        <button type="submit" disabled={busy} className="primary-button w-full">
          {busy ? "Tunggu..." : mode === "login" ? "Masuk" : "Daftar"}
        </button>
      </form>
    </section>
  );
}

function PasswordRecoveryPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Kata laluan mesti sekurang-kurangnya 6 aksara.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Kata laluan baharu tidak sepadan.");
      return;
    }
    setError(null);
    onSubmit(password);
  }

  return (
    <section className="mb-6 rounded-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:p-6">
      <BrandMark compact />
      <div className="mb-5 mt-5">
        <h2 className="text-xl font-black">Tetapkan Kata Laluan Baharu</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Masukkan kata laluan baharu untuk akaun PKSK anda.</p>
      </div>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Kata laluan baharu">
            <input
              className="field"
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 aksara"
              minLength={6}
              required
            />
          </Label>
          <Label text="Sahkan kata laluan">
            <input
              className="field"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Taip semula"
              minLength={6}
              required
            />
          </Label>
        </div>
        {error ? <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-600">{error}</p> : null}
        <button type="submit" disabled={busy} className="primary-button w-full">
          {busy ? "Menyimpan..." : "Simpan Kata Laluan"}
        </button>
      </form>
    </section>
  );
}

function AuthPage({
  mode,
  busy,
  isPasswordRecovery,
  onMode,
  onPasswordResetRequest,
  onPasswordUpdate,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  isPasswordRecovery: boolean;
  onMode: (mode: AuthMode) => void;
  onPasswordResetRequest: (email: string) => void;
  onPasswordUpdate: (password: string) => void;
  onSubmit: (email: string, password: string, displayName: string, rememberMe?: boolean) => void;
}) {
  return (
    <div className="mx-auto max-w-md">
      {isPasswordRecovery ? (
        <PasswordRecoveryPanel busy={busy} onSubmit={onPasswordUpdate} />
      ) : (
        <AuthPanel mode={mode} busy={busy} onMode={onMode} onPasswordResetRequest={onPasswordResetRequest} onSubmit={onSubmit} />
      )}
    </div>
  );
}

function LandingPage({
  settings,
  questionBankCounts,
  onStartGuestPreview,
  onShowPaywall,
}: {
  settings: AppSettings;
  questionBankCounts: QuestionBankCounts | null;
  onStartGuestPreview: (section: "A" | "B") => void;
  onShowPaywall: () => void;
}) {
  const priceLabel = formatCurrency(settings.payment_price, settings.payment_currency);
  const featureHighlights: Array<{ icon: LucideIcon; title: string; text: string; tone: string }> = [
    { icon: ShieldCheck, title: "Simulasi Sebenar", text: "Simulasi seperti peperiksaan sebenar PKSK.", tone: "bg-ocean-50 text-ocean-700" },
    { icon: Brain, title: "Soalan Rawak", text: "Setiap simulasi berbeza setiap kali.", tone: "bg-violet-50 text-violet-700" },
    { icon: Target, title: "Analisis Prestasi", text: "Jejak kelemahan dan kekuatan murid.", tone: "bg-leaf-50 text-leaf-600" },
    { icon: Trophy, title: "Lencana & XP", text: "Kumpul XP dan buka pencapaian.", tone: "bg-sun-100 text-amber-700" },
    { icon: ClipboardList, title: "Persediaan Berstruktur", text: "Fokus Bahagian A, B dan C.", tone: "bg-sky-50 text-sky-700" },
    { icon: PenLine, title: "Studio Penulisan", text: "Editor moden untuk karangan Bahagian C.", tone: "bg-coral-50 text-coral-600" },
  ];
  const confidencePoints: Array<{ icon: LucideIcon; title: string; text: string; tone: string }> = [
    { icon: Target, title: "Fokus pada kelemahan", text: "Kenal pasti bahagian yang perlu dilatih semula.", tone: "bg-ocean-50 text-ocean-700" },
    { icon: Clock3, title: "Jimat masa & tenaga", text: "Persediaan lengkap dalam platform yang mudah digunakan.", tone: "bg-sun-100 text-amber-700" },
    { icon: ShieldCheck, title: "Selamat & terjamin", text: "Platform persediaan yang tersusun untuk murid sekolah rendah.", tone: "bg-blue-50 text-blue-700" },
    { icon: HeartHandshake, title: "Untuk ibu bapa & anak", text: "Dirancang supaya perkembangan anak mudah dipantau.", tone: "bg-violet-50 text-violet-700" },
  ];

  return (
    <div className="space-y-8">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-ocean-100 bg-white/80 px-3 py-2 text-xs font-black uppercase text-ocean-700 shadow-sm">
            <GraduationCap size={15} aria-hidden="true" />
            Simulasi PKSK sebenar
          </div>
          <div className="max-w-2xl space-y-4">
            <h1 className="text-4xl font-black leading-[1.03] text-slate-950 sm:text-5xl lg:text-6xl">
              Persediaan PKSK bermula di sini.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Simulasi sebenar, soalan rawak, analisis prestasi dan persediaan berstruktur untuk bantu anak anda lebih yakin dan bersedia.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" className="hero-premium-cta" onClick={onShowPaywall}>
              <span className="hero-popular-badge">Paling Popular</span>
              <Crown size={18} aria-hidden="true" />
              Dapatkan Premium {priceLabel}
            </button>
            <button type="button" className="hero-preview-cta" onClick={() => onStartGuestPreview("A")}>
              <Play size={16} fill="currentColor" aria-hidden="true" />
              Cuba Percuma
            </button>
          </div>
          <div className="landing-trust-line">
            <Users size={17} aria-hidden="true" />
            <span>Direka untuk calon Tahun 6, ibu bapa dan guru yang mahu persediaan lebih tersusun.</span>
          </div>
        </div>

        <div className="landing-hero-visual relative" aria-label="Paparan prestasi dan XP PKSK Academy">
          <img src="/assets/pksk-academy-hero-dashboard.png" alt="Murid PKSK Academy dengan paparan prestasi, XP dan graf kemajuan" className="landing-hero-image" />
          <QuestionBankHeroCard counts={questionBankCounts} />
        </div>
      </section>

      <SocialProofUserCard />

      <PkskCountdownSection variant="dashboard" showTimeline={false} />

      <section className="landing-feature-strip" aria-label="Ciri utama PKSK Academy">
        {featureHighlights.map((item) => (
          <article key={item.title} className="landing-feature-card">
            <span className={`landing-feature-icon ${item.tone}`}>
              <item.icon size={27} aria-hidden="true" />
            </span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-confidence-panel">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Semua yang anda perlukan untuk berjaya dalam PKSK</h2>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-ocean-500" />
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {confidencePoints.map((item) => (
            <article key={item.title} className="landing-confidence-item">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                <item.icon size={23} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-950">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <FreePreviewSection onStartGuestPreview={onStartGuestPreview} onShowPaywall={onShowPaywall} />
    </div>
  );
}

function QuestionBankHeroCard({ counts }: { counts: QuestionBankCounts | null }) {
  return (
    <div className="relative z-10 -mt-10 w-full max-w-[520px] self-center rounded-2xl border border-ocean-100 bg-white/94 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur lg:absolute lg:bottom-7 lg:right-8 lg:mt-0 lg:w-[390px] lg:max-w-none">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
            <BookOpen size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-ocean-700">Bank Soalan Aktif</p>
            <p className="truncate text-sm font-bold text-slate-600">Dikembangkan secara berterusan</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black leading-none text-slate-950">{formatQuestionCount(counts?.total)}</p>
          <p className="text-xs font-black text-slate-500">jumlah</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <QuestionCountPill label="Bahagian A" value={counts?.section_a} />
        <QuestionCountPill label="Bahagian B" value={counts?.section_b} />
        <QuestionCountPill label="Bahagian C" value={counts?.section_c} />
      </div>
    </div>
  );
}

function QuestionBankDashboardCard({ counts }: { counts: QuestionBankCounts | null }) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <BookOpen size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">Bank Soalan</p>
          <p className="text-2xl font-black text-slate-950">{formatQuestionCount(counts?.total)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <QuestionCountPill label="A" value={counts?.section_a} compact />
        <QuestionCountPill label="B" value={counts?.section_b} compact />
        <QuestionCountPill label="C" value={counts?.section_c} compact />
      </div>
    </article>
  );
}

function QuestionCountPill({ label, value, compact = false }: { label: string; value: number | undefined; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
      <p className={`${compact ? "text-[11px]" : "text-[10px]"} font-black uppercase text-slate-500`}>{label}</p>
      <p className={`${compact ? "text-base" : "text-lg"} font-black leading-tight text-slate-950`}>{formatQuestionCount(value)}</p>
    </div>
  );
}

function PremiumRouteGate({
  onStartGuestPreview,
  onAuth,
  onShowPaywall,
}: {
  onStartGuestPreview: (section: "A" | "B") => void;
  onAuth: (mode: AuthMode) => void;
  onShowPaywall: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
        <LockKeyhole size={26} aria-hidden="true" />
      </div>
      <p className="mt-5 text-sm font-black uppercase text-ocean-700">PKSK Academy oleh CikguSTEM</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Akses Premium diperlukan</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
        Halaman ini ialah sebahagian daripada aplikasi premium. Sila pilih preview percuma, log masuk atau dapatkan akses Premium.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className="primary-button" onClick={() => onStartGuestPreview("A")}>
          Cuba Percuma
        </button>
        <button type="button" className="secondary-button" onClick={() => onAuth("login")}>
          Log Masuk
        </button>
        <button type="button" className="secondary-button" onClick={onShowPaywall}>
          Dapatkan Premium
        </button>
      </div>
    </section>
  );
}

function Dashboard({
  isLoggedIn,
  access,
  profile,
  profileReady,
  performance,
  pendingPayment,
  diamondProfile,
  questionBankCounts,
  activePayload,
  activeEssayPayload,
  onNavigate,
  onResume,
  onResumeEssay,
  onStartQuiz,
  onStartEssay,
  onStartGuestPreview,
  onAuthMode,
  onShowPaywall,
  onDiamondProfileUpdated,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  profile: ProfileRow | null;
  profileReady: boolean;
  performance: ReturnType<typeof calculatePerformance>;
  pendingPayment: PaymentRequest | null;
  diamondProfile: DiamondProfile | null;
  questionBankCounts: QuestionBankCounts | null;
  activePayload: AttemptPayload | null;
  activeEssayPayload: EssayAttemptPayload | null;
  onNavigate: (route: AppRoute) => void;
  onResume: () => void;
  onResumeEssay: () => void;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
  onStartEssay: () => void;
  onStartGuestPreview: (section: "A" | "B") => void;
  onAuthMode: (mode: AuthMode) => void;
  onShowPaywall: () => void;
  onDiamondProfileUpdated: (profile: DiamondProfile) => void;
}) {
  const displayName = profile?.display_name ?? "Calon PKSK";
  const level = getLevelProgress(profile?.xp ?? 0);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="grid lg:min-h-[430px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative order-1 min-h-[220px] lg:min-h-[430px]">
            <img src="/assets/pksk-hero.png" alt="Murid Tahun 6 belajar bersama" className="h-full w-full object-cover object-left" />
          </div>

          <div className="order-2 flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-8 lg:p-10">
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-sun-100 px-3 py-2 text-sm font-bold text-amber-700">
              <Sparkles size={17} aria-hidden="true" />
              Simulasi rawak setiap kali mula
            </div>
            <div className="max-w-[330px] space-y-4 sm:max-w-xl">
              <h1 className="break-words text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                {isLoggedIn ? `Selamat kembali, ${displayName}` : "PKSK Academy oleh CikguSTEM"}
              </h1>
              <p className="break-words text-base leading-7 text-slate-600 sm:text-lg">
                {isLoggedIn
                  ? "Jalankan simulasi rawak, Studio Penulisan Bahagian C dan rekod pencapaian dalam satu tempat."
                  : "Terus cuba soalan contoh tanpa daftar akaun. Akses penuh boleh dibuka apabila bersedia."}
              </p>
            </div>
            {isLoggedIn && access.isPremium ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
                  <span>Level {level.level}</span>
                  <span>
                    {level.progressXp} / {level.neededXp} mata
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-ocean-600 transition-all" style={{ width: `${level.percentage}%` }} />
                </div>
                {diamondProfile?.status === "active" ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-cyan-100">
                    <Gem size={15} aria-hidden="true" />
                    Diamond Partner
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex max-w-[330px] flex-col gap-3 sm:max-w-none sm:flex-row">
              {isLoggedIn ? (
                <>
                  <button type="button" onClick={() => (access.isPremium ? onNavigate(profileReady ? "/app/simulasi" : "/app/profile") : onShowPaywall())} className="primary-button">
                    {access.isPremium ? (profileReady ? "Mula Simulasi" : "Lengkapkan Profil") : "Buka Akses Premium"}
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  {activePayload ? (
                    <button type="button" onClick={onResume} className="secondary-button">
                      Sambung Cubaan
                    </button>
                  ) : null}
                  {activeEssayPayload ? (
                    <button type="button" onClick={onResumeEssay} className="secondary-button">
                      Sambung Penulisan
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onStartGuestPreview("A")} className="primary-button">
                    Cuba Percuma
                  </button>
                  <button type="button" onClick={() => onAuthMode("login")} className="secondary-button">
                    Log Masuk
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {isLoggedIn && !access.isPremium && pendingPayment ? <PaymentPendingBanner payment={pendingPayment} /> : null}

      {isLoggedIn ? <PkskCountdownSection variant="dashboard" showTimeline={false} /> : null}

      {!isLoggedIn ? (
        <FreePreviewSection onStartGuestPreview={onStartGuestPreview} onShowPaywall={onShowPaywall} />
      ) : null}

      {isLoggedIn && !access.isPremium ? <InlinePaywall access={access} onShowPaywall={onShowPaywall} /> : null}

      {isLoggedIn && access.isPremium ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Rocket} label="Jumlah Cubaan" value={`${performance.totalAttempts}`} tone="bg-ocean-50 text-ocean-700" />
            <StatCard icon={Star} label="Skor Terbaik" value={`${performance.bestScore}%`} tone="bg-sun-50 text-amber-700" />
            <StatCard icon={Zap} label="Jumlah Mata" value={`${performance.totalXp}`} tone="bg-coral-50 text-coral-600" />
            <StatCard icon={Trophy} label="Lencana" value={`${performance.badgeCount}`} tone="bg-leaf-50 text-leaf-600" />
            <QuestionBankDashboardCard counts={questionBankCounts} />
          </section>

          {diamondProfile?.status !== "active" && diamondProfile?.status !== "suspended" ? (
            <DiamondApplicationCard diamondProfile={diamondProfile} onApplied={onDiamondProfileUpdated} />
          ) : null}

          <section className="grid gap-5 lg:grid-cols-3">
            <ModeCard title="Simulasi PKSK Penuh" text="Bahagian A 30 soalan, Bahagian B 70 soalan, kemudian Bahagian C." icon={ShieldCheck} onClick={() => onStartQuiz("full", null, 100)} />
            <ModeCard title="Pilih Bahagian" text="Pilih Bahagian A, B atau C untuk fokus." icon={Brain} onClick={() => onNavigate("/app/simulasi")} />
            <ModeCard title="Cabaran Pantas" text="10 soalan pendek untuk ulang kaji harian." icon={Clock3} onClick={() => onStartQuiz("quick", null, 10)} />
            <ModeCard title="Studio Penulisan" text="Bahagian C dengan editor, timer dan autosave." icon={PenLine} onClick={onStartEssay} />
            <ModeCard title="Pencapaian" text="Semak analisis prestasi dan perkembangan simulasi." icon={Award} onClick={() => onNavigate("/app/pencapaian")} />
            <ModeCard title="Lencana" text="Lihat lencana yang sudah dibuka dan sasaran seterusnya." icon={Trophy} onClick={() => onNavigate("/app/lencana")} />
            <ModeCard title="Bonus Premium" text="Muat turun bahan tambahan eksklusif untuk ahli Premium." icon={Gift} onClick={() => onNavigate("/app/bonus")} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function DiamondApplicationCard({
  diamondProfile,
  onApplied,
}: {
  diamondProfile: DiamondProfile | null;
  onApplied: (profile: DiamondProfile) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isPending = diamondProfile?.status === "pending";

  if (isPending) {
    return (
      <section className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-soft">
        <div className="grid gap-5 p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-cyan-100">
            <Gem size={26} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Premium Diamond</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Permohonan Diamond sedang disemak</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Permohonan anda telah diterima dan sedang menunggu kelulusan Admin.</p>
          </div>
          <span className="w-fit rounded-xl bg-sun-50 px-4 py-3 text-sm font-black text-amber-700">Pending Review</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-cyan-100 bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_70%_40%,rgba(34,211,238,0.30),transparent_34%),radial-gradient(circle_at_35%_75%,rgba(250,204,21,0.20),transparent_28%)] lg:block" aria-hidden="true" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-200/20">
              <Gem size={27} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-cyan-200">Premium Diamond</p>
              <h2 className="mt-1 text-2xl font-black text-white">Sudah Premium? Jadi Diamond Partner.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                Kongsi PKSK Academy dan terima RM23 komisen bagi setiap pembelian Premium yang berjaya melalui link anda.
              </p>
            </div>
          </div>
          <button type="button" className="primary-button bg-cyan-500 text-slate-950 shadow-[0_16px_34px_rgba(34,211,238,0.22)] hover:bg-cyan-300" onClick={() => setIsOpen(true)}>
            Mohon Jadi Diamond Partner
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
      {isOpen ? <DiamondApplicationModal onClose={() => setIsOpen(false)} onApplied={(profile) => {
        onApplied(profile);
        setIsOpen(false);
      }} /> : null}
    </>
  );
}

function DiamondApplicationModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: (profile: DiamondProfile) => void;
}) {
  const [form, setForm] = useState<DiamondApplicationInput>({
    bankAccountName: "",
    bankName: "",
    bankAccountNumber: "",
    phone: "",
    termsAccepted: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const profile = await applyForDiamond(form);
      onApplied(profile);
    } catch (submitError) {
      setError(toMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/50 px-4 py-6">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Diamond Partner</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Mohon Jadi Diamond Partner</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Komisen RM23 bagi setiap pembelian Premium yang sah. Komisen layak dibayar selepas 14 hari daripada tarikh pembayaran pembeli disahkan berjaya.
            </p>
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100" onClick={onClose} aria-label="Tutup">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error ? <p className="mt-4 rounded-xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-600">{error}</p> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Label text="Nama Pemegang Akaun">
            <input className="field" value={form.bankAccountName} onChange={(event) => setForm((current) => ({ ...current, bankAccountName: event.target.value }))} required />
          </Label>
          <Label text="Nama Bank">
            <input className="field" value={form.bankName} onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))} required />
          </Label>
          <Label text="Nombor Akaun Bank">
            <input className="field" inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setForm((current) => ({ ...current, bankAccountNumber: event.target.value }))} required />
          </Label>
          <Label text="No. Telefon">
            <input className="field" inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required />
          </Label>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={form.termsAccepted}
            onChange={(event) => setForm((current) => ({ ...current, termsAccepted: event.target.checked }))}
            required
          />
          <span>Saya mengesahkan maklumat bank yang diberikan adalah betul dan bersetuju dengan syarat program Diamond Partner.</span>
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="primary-button flex-1" disabled={busy}>
            {busy ? "Menghantar..." : "Hantar Permohonan"}
          </button>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Batal
          </button>
        </div>
      </form>
    </section>
  );
}

function DiamondPage({
  diamondProfile,
  onNavigate,
  onMessage,
  onDiamondProfileUpdated,
}: {
  diamondProfile: DiamondProfile | null;
  onNavigate: (route: AppRoute) => void;
  onMessage: (message: string | null) => void;
  onDiamondProfileUpdated: (profile: DiamondProfile) => void;
}) {
  const [localProfile, setLocalProfile] = useState<DiamondProfile | null>(diamondProfile);
  const [dashboard, setDashboard] = useState<DiamondDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDiamond = useCallback(async () => {
    setLoading(true);
    try {
      const nextProfile = await fetchMyDiamondProfile();
      setLocalProfile(nextProfile);
      onDiamondProfileUpdated(nextProfile);
      if (nextProfile.status === "active") {
        setDashboard(await fetchDiamondDashboard());
      } else {
        setDashboard(null);
      }
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onDiamondProfileUpdated, onMessage]);

  useEffect(() => {
    loadDiamond();
  }, [loadDiamond]);

  useEffect(() => {
    setLocalProfile(diamondProfile);
  }, [diamondProfile]);

  if (loading) {
    return <LoadingPage />;
  }

  if (!localProfile || localProfile.status === "not_agent") {
    return (
      <div className="space-y-6">
        <PageHeader icon={Gem} title="Diamond Partner" text="Mohon sebagai Diamond Partner selepas akaun Premium aktif." />
        <DiamondApplicationCard diamondProfile={localProfile} onApplied={(profile) => {
          setLocalProfile(profile);
          onDiamondProfileUpdated(profile);
        }} />
      </div>
    );
  }

  if (localProfile.status === "pending") {
    return (
      <div className="space-y-6">
        <PageHeader icon={Gem} title="Diamond Partner" text="Permohonan anda sedang disemak oleh Admin." />
        <DiamondApplicationCard diamondProfile={localProfile} onApplied={onDiamondProfileUpdated} />
      </div>
    );
  }

  if (localProfile.status === "suspended") {
    return (
      <AccessDeniedPage
        title="Akses Diamond Partner sedang digantung"
        text="Akses Diamond Partner akaun ini sedang digantung. Akses Premium anda masih kekal aktif."
        buttonLabel="Ke Dashboard"
        buttonRoute="/app"
        onNavigate={onNavigate}
      />
    );
  }

  const data = dashboard ?? {
    profile: localProfile,
    stats: { total_clicks: 0, total_sales: 0, total_commission: 0, pending_14_days: 0, eligible: 0, paid: 0 },
    commissions: [],
  };

  async function copyReferralLink() {
    if (!data.profile.referral_link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(data.profile.referral_link);
      onMessage("Link referral Diamond telah disalin.");
    } catch {
      onMessage("Link belum dapat disalin secara automatik. Sila salin manual.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.25),transparent_30%),radial-gradient(circle_at_12%_85%,rgba(168,85,247,0.18),transparent_34%)]" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-black text-cyan-100 ring-1 ring-white/10">
            <Gem size={17} aria-hidden="true" />
            Diamond Partner
          </p>
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">Kongsi PKSK Academy dan jana komisen.</h1>
          <p className="mt-4 text-base leading-7 text-slate-200">
            RM{data.profile.commission_amount.toFixed(0)} direkod untuk setiap pembelian Premium yang berjaya melalui referral anda, dengan tempoh hold 14 hari sebelum layak dibayar.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Jumlah Klik" value={`${data.stats.total_clicks}`} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={CheckCircle2} label="Jumlah Jualan" value={`${data.stats.total_sales}`} tone="bg-leaf-50 text-leaf-600" />
        <StatCard icon={CreditCard} label="Komisen" value={formatCurrency(data.stats.total_commission, "MYR")} tone="bg-sun-50 text-amber-700" />
        <StatCard icon={Clock3} label="Menunggu 14 Hari" value={formatCurrency(data.stats.pending_14_days, "MYR")} tone="bg-slate-100 text-slate-700" />
        <StatCard icon={Sparkles} label="Sedia Dibayar" value={formatCurrency(data.stats.eligible, "MYR")} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Trophy} label="Sudah Dibayar" value={formatCurrency(data.stats.paid, "MYR")} tone="bg-leaf-50 text-leaf-600" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className="rounded-2xl bg-white p-6 shadow-soft">
          <p className="text-sm font-black uppercase text-ocean-700">Link Referral Anda</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{data.profile.referral_code ?? "Belum tersedia"}</h2>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700">
            {data.profile.referral_link ?? "-"}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="primary-button" onClick={copyReferralLink} disabled={!data.profile.referral_link}>
              <Copy size={17} aria-hidden="true" />
              Salin Link
            </button>
            {data.profile.referral_link ? (
              <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(`Jom cuba PKSK Academy Premium: ${data.profile.referral_link}`)}`} target="_blank" rel="noreferrer">
                <MessageCircle size={17} aria-hidden="true" />
                Kongsi WhatsApp
              </a>
            ) : null}
          </div>
        </article>

        <DiamondBankInfoPanel profile={data.profile} onProfileUpdated={(profile) => {
          setLocalProfile(profile);
          onDiamondProfileUpdated(profile);
          onMessage("Maklumat bank Diamond telah dikemas kini.");
        }} />
      </section>

      <DiamondCommissionList commissions={data.commissions} />
    </div>
  );
}

function DiamondBankInfoPanel({
  profile,
  onProfileUpdated,
}: {
  profile: DiamondProfile;
  onProfileUpdated: (profile: DiamondProfile) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    bankAccountName: profile.bank_account_name ?? "",
    bankName: profile.bank_name ?? "",
    bankAccountNumber: "",
    phone: profile.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyDiamondBankInfo(form);
      onProfileUpdated(updated);
      setForm((current) => ({ ...current, bankAccountNumber: "" }));
      setIsEditing(false);
    } catch (submitError) {
      setError(toMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-ocean-700">Maklumat Pembayaran Komisen</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">{profile.bank_name ?? "Bank belum lengkap"}</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">{profile.bank_account_name ?? "-"}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{profile.bank_account_last4 ? `********${profile.bank_account_last4}` : "Nombor akaun disimpan dengan selamat"}</p>
        </div>
        <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700" onClick={() => setIsEditing((current) => !current)}>
          {isEditing ? "Tutup" : "Update"}
        </button>
      </div>

      {isEditing ? (
        <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
          {error ? <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-600">{error}</p> : null}
          <input className="field" value={form.bankAccountName} onChange={(event) => setForm((current) => ({ ...current, bankAccountName: event.target.value }))} placeholder="Nama pemegang akaun" required />
          <input className="field" value={form.bankName} onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))} placeholder="Nama bank" required />
          <input className="field" inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setForm((current) => ({ ...current, bankAccountNumber: event.target.value }))} placeholder="Nombor akaun penuh untuk kemas kini" required />
          <input className="field" inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="No. telefon" required />
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan Maklumat"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function DiamondCommissionList({ commissions }: { commissions: AgentCommissionSummary[] }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-ocean-700">Commission List</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Komisen Diamond</h2>
        </div>
        <p className="text-sm font-bold text-slate-500">{commissions.length} rekod</p>
      </div>

      <div className="mt-5 hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              {["Pembeli", "Tarikh Bayaran", "Komisen", "Layak Dibayar", "Status"].map((header) => (
                <th key={header} className="px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {commissions.map((commission) => (
              <tr key={commission.id}>
                <td className="px-4 py-3 font-black text-slate-900">{commission.buyer_name ?? commission.buyer_email_masked ?? "Pembeli"}</td>
                <td className="px-4 py-3 text-slate-600">{formatShortDate(commission.payment_confirmed_at)}</td>
                <td className="px-4 py-3 font-black text-slate-900">{formatCurrency(commission.amount, "MYR")}</td>
                <td className="px-4 py-3 text-slate-600">{formatShortDate(commission.eligible_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-xl px-3 py-2 text-xs font-black ${commissionStatusTone(commission.effective_status)}`}>{commissionStatusLabel(commission.effective_status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 md:hidden">
        {commissions.map((commission) => (
          <article key={commission.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">{commission.buyer_name ?? commission.buyer_email_masked ?? "Pembeli"}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatShortDate(commission.payment_confirmed_at)}</p>
              </div>
              <span className={`rounded-xl px-3 py-2 text-xs font-black ${commissionStatusTone(commission.effective_status)}`}>{commissionStatusLabel(commission.effective_status)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Komisen" value={formatCurrency(commission.amount, "MYR")} />
              <Metric label="Layak" value={formatShortDate(commission.eligible_at)} />
            </div>
          </article>
        ))}
      </div>

      {commissions.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Belum ada komisen direkodkan.</p> : null}
    </section>
  );
}

function FreePreviewSection({
  onStartGuestPreview,
  onShowPaywall,
}: {
  onStartGuestPreview: (section: "A" | "B") => void;
  onShowPaywall: () => void;
}) {
  const premiumBenefits = [
    "Simulasi tanpa had",
    "Bank soalan penuh",
    "Soalan rawak setiap cubaan",
    "Rekod & analisis prestasi",
    "XP, level dan lencana",
    "Latihan semua bahagian",
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-ocean-100 bg-white p-6 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <Sparkles size={23} aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-black uppercase text-ocean-700">Preview Percuma</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Cuba PKSK Percuma</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Cuba pengalaman PKSK Academy tanpa daftar akaun. Sebahagian soalan dibuka dahulu, selebihnya boleh diakses melalui Premium.
        </p>
        <button type="button" className="secondary-button mt-5 w-full border-ocean-200 text-ocean-800" onClick={() => onStartGuestPreview("A")}>
          Cuba Percuma
        </button>
      </article>
      <article className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sun-50 p-6 shadow-[0_24px_54px_rgba(180,83,9,0.14)]">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-10 right-20 h-24 w-24 rounded-full bg-violet-200/30 blur-2xl" aria-hidden="true" />
        <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)] xl:items-stretch">
          <div className="flex min-w-0 flex-col">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
              <Crown size={25} aria-hidden="true" />
            </span>
            <p className="mt-5 text-sm font-black uppercase text-amber-700">Akses Premium</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">PKSK Academy Premium</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-700">
              Persediaan lebih lengkap, lebih tersusun dan boleh dipantau.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {premiumBenefits.map((benefit) => (
                <div key={benefit} className="inline-flex min-w-0 items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm font-black text-slate-800 ring-1 ring-amber-100">
                  <CheckCircle2 size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="min-w-0">{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-violet-50 via-amber-50 to-white p-5 shadow-[0_18px_38px_rgba(124,58,237,0.10)]">
            <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-amber-200/50 blur-2xl" aria-hidden="true" />
            <Sparkles className="absolute right-4 top-4 text-amber-400" size={18} aria-hidden="true" />
            <Star className="absolute bottom-16 left-4 text-amber-300" size={15} aria-hidden="true" />
            <div className="relative flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-[0_12px_24px_rgba(124,58,237,0.18)]">
                <Gift size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-violet-700">Bonus</p>
                <h3 className="text-xl font-black text-slate-950">Bahan Pembelajaran</h3>
              </div>
            </div>
            <p className="relative mt-4 text-sm leading-6 text-slate-700">
              Koleksi bahan pembelajaran khas untuk membantu calon membuat persediaan PKSK dengan lebih yakin.
            </p>
            <div className="relative mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="rounded-2xl border border-violet-100 bg-white/85 p-3 text-center shadow-sm">
                <BookOpen className="mx-auto text-violet-700" size={23} aria-hidden="true" />
                <span className="mt-2 block text-xs font-black text-slate-700">Modul</span>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-white/85 p-3 text-center shadow-sm">
                <ClipboardList className="mx-auto text-amber-600" size={23} aria-hidden="true" />
                <span className="mt-2 block text-xs font-black text-slate-700">Nota</span>
              </div>
              <div className="rounded-2xl border border-ocean-100 bg-white/85 p-3 text-center shadow-sm">
                <FileSpreadsheet className="mx-auto text-ocean-700" size={23} aria-hidden="true" />
                <span className="mt-2 block text-xs font-black text-slate-700">Latihan</span>
              </div>
            </div>
            <div className="relative mt-5 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-black uppercase text-violet-700 shadow-sm">
                <Sparkles size={13} aria-hidden="true" />
                Khas Premium
                <Sparkles size={13} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
        <button type="button" className="primary-button relative mt-5 w-full bg-amber-500 shadow-[0_16px_32px_rgba(245,158,11,0.24)] hover:bg-amber-600" onClick={onShowPaywall}>
          <Crown size={17} aria-hidden="true" />
          Lihat Premium
        </button>
      </article>
    </section>
  );
}

function InlinePaywall({ access, onShowPaywall }: { access: ReturnType<typeof useAccess>; onShowPaywall: () => void }) {
  const title = access.isBlocked ? "Akaun memerlukan semakan" : access.isExpired ? "Akses premium telah tamat" : "Akses penuh belum aktif";
  const text = access.isBlocked
    ? "Sila hubungi pentadbir untuk membuka semula akses simulasi."
    : "Buka akses premium untuk menggunakan bank soalan penuh, sejarah cubaan dan analisis prestasi.";

  return (
    <section className="rounded-2xl border border-ocean-100 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{text}</p>
        </div>
        <button type="button" className="primary-button" onClick={onShowPaywall}>
          Lihat Premium
        </button>
      </div>
    </section>
  );
}

function PaymentPendingBanner({ payment }: { payment: PaymentRequest }) {
  const isToyyibPay = payment.payment_method === "toyyibpay";
  return (
    <section className="rounded-2xl border border-sun-200 bg-sun-50 p-5 shadow-soft">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-700">
            <Clock3 size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black text-slate-950">{isToyyibPay ? "Pembayaran sedang diproses" : "Wang anda sedang disemak."}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
              {isToyyibPay
                ? `Kami sedang menunggu pengesahan pembayaran ToyyibPay ${formatCurrency(payment.amount, payment.currency)}. Akses Premium akan dibuka secara automatik selepas bayaran berjaya disahkan.`
                : `Rekod bayaran ${formatCurrency(payment.amount, payment.currency)} sudah diterima. Akaun Premium akan aktif selepas Admin sahkan bayaran.`}
            </p>
          </div>
        </div>
        <span className="w-fit rounded-xl bg-white px-4 py-2 text-sm font-black text-amber-700">{isToyyibPay ? "Dalam proses" : "Pending"}</span>
      </div>
    </section>
  );
}

function GuestPreviewPage({
  payload,
  answers,
  skipped,
  result,
  busy,
  onAnswer,
  onSkip,
  onComplete,
  onNavigate,
  onShowPaywall,
  onAuthMode,
  onStartGuestPreview,
}: {
  payload: GuestPreviewPayload | null;
  answers: Record<string, string>;
  skipped: Record<string, boolean>;
  result: GuestPreviewResult | null;
  busy: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onSkip: (questionId: string) => void;
  onComplete: () => void;
  onNavigate: (route: AppRoute) => void;
  onShowPaywall: () => void;
  onAuthMode: (mode: AuthMode) => void;
  onStartGuestPreview: (section: "A" | "B") => void;
}) {
  const [index, setIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(freePreviewDurationSeconds);
  const payloadKey = payload?.questions.map((question) => question.id).join("|") ?? "empty";

  useEffect(() => {
    setIndex(0);
    setRemainingSeconds(freePreviewDurationSeconds);
  }, [payloadKey]);

  useEffect(() => {
    if (!payload || result) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [payload, result]);

  if (!payload) {
    return (
      <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <Sparkles size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-black">Preview Percuma PKSK</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">Cuba pengalaman simulasi percuma dahulu. Tiada akaun diperlukan.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" className="primary-button" onClick={() => onStartGuestPreview("A")}>
            Cuba Percuma
          </button>
          <button type="button" className="secondary-button" onClick={() => onNavigate("/")}>
            Kembali
          </button>
        </div>
      </section>
    );
  }

  const orderedQuestions = [...payload.questions].sort((first, second) => {
    const sectionOrder = sectionSortOrder(first.section) - sectionSortOrder(second.section);
    return sectionOrder !== 0 ? sectionOrder : first.question_order - second.question_order;
  });
  const current = orderedQuestions[index] ?? orderedQuestions[0];
  const sectionAQuestions = orderedQuestions.filter((question) => question.section === "A");
  const sectionBQuestions = orderedQuestions.filter((question) => question.section === "B");
  const questionIndexById = new Map(orderedQuestions.map((question, questionIndex) => [question.id, questionIndex]));
  const getPreviewStatus = (question: QuizQuestion): "unanswered" | "answered" | "skipped" => {
    if (answers[question.id]) {
      return "answered";
    }
    if (skipped[question.id]) {
      return "skipped";
    }
    return "unanswered";
  };
  const answered = orderedQuestions.filter((question) => getPreviewStatus(question) === "answered").length;
  const skippedCount = orderedQuestions.filter((question) => getPreviewStatus(question) === "skipped").length;
  const completed = answered + skippedCount;
  const unanswered = orderedQuestions.length - completed;
  const allComplete = orderedQuestions.length > 0 && unanswered === 0;
  const currentReady = current ? getPreviewStatus(current) !== "unanswered" : false;
  const timerTone = remainingSeconds <= 300 ? "bg-coral-50 text-coral-600" : "bg-ocean-50 text-ocean-700";

  function handleNextPreview() {
    if (!currentReady) {
      return;
    }
    if (index < orderedQuestions.length - 1) {
      setIndex((currentIndex) => currentIndex + 1);
      return;
    }
    onComplete();
  }

  function handleSkipPreview() {
    if (!current) {
      return;
    }
    onSkip(current.id);
    if (index < orderedQuestions.length - 1) {
      setIndex((currentIndex) => currentIndex + 1);
    }
  }

  function renderPreviewGroup(title: string, total: number, startNumber: number, questions: QuizQuestion[]) {
    const completedInGroup = questions.filter((question) => getPreviewStatus(question) !== "unanswered").length;
    return (
      <div key={title}>
        <div className="mb-2 flex items-center justify-between text-xs font-black uppercase text-slate-500">
          <span>{title}</span>
          <span>{completedInGroup}/{questions.length} dibuka</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: total }, (_, itemIndex) => {
            const question = questions[itemIndex];
            const number = startNumber + itemIndex;
            if (!question) {
              return (
                <button
                  key={`${title}-locked-${number}`}
                  type="button"
                  disabled
                  aria-label={`Soalan ${number} dikunci dalam versi percuma`}
                  className="grid h-10 cursor-not-allowed place-items-center rounded-xl bg-slate-50 text-slate-300"
                >
                  <LockKeyhole size={15} aria-hidden="true" />
                </button>
              );
            }
            const questionIndex = questionIndexById.get(question.id) ?? 0;
            const status = getPreviewStatus(question);
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => setIndex(questionIndex)}
                className={`grid h-10 place-items-center rounded-xl text-sm font-black transition ${questionStatusClass(status, questionIndex === index, false)}`}
              >
                {number}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
        <h1 className="text-2xl font-black">Preview belum tersedia</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">Bank soalan percuma belum mempunyai soalan aktif. Sila cuba semula selepas admin tambah soalan.</p>
        <button type="button" className="secondary-button mx-auto mt-6" onClick={() => onNavigate("/")}>
          Kembali
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]">
      {result ? (
        <section className="rounded-2xl border border-sun-200 bg-sun-50 p-8 shadow-soft lg:col-span-2">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black">Anda telah menyelesaikan versi percuma.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">Naik taraf ke Premium untuk membuka akses penuh, sejarah cubaan, XP, lencana dan Bahagian C.</p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-sm">
              <p className="text-xs font-black uppercase text-slate-500">Skor ringkas</p>
              <p className="mt-1 text-2xl font-black text-ocean-700">{result.percentage}%</p>
            </div>
          </div>
          <p className="mt-2 text-lg font-black text-ocean-700">
            {result.correct_answers}/{result.total_questions} betul. {skippedCount} soalan diskip.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="primary-button" onClick={onShowPaywall}>
              Daftar & Dapatkan Premium
            </button>
            <button type="button" className="secondary-button" onClick={() => onStartGuestPreview("A")}>
              Cuba Semula
            </button>
            <button type="button" className="secondary-button" onClick={() => onAuthMode("login")}>
              Sudah ada akaun? Log Masuk
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-6 shadow-soft">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-ocean-50 px-3 py-2 text-sm font-black text-ocean-700">
                  Soalan {index + 1} / {orderedQuestions.length}
                </span>
                <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">
                  Bahagian {current.section} {current.section === "A" ? "- Kecerdasan Insaniah" : "- Kecerdasan Intelek"}
                </span>
              </div>
              <span className={`inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${timerTone}`}>
                <Clock3 size={17} aria-hidden="true" />
                {formatTimer(remainingSeconds)}
              </span>
            </div>
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-bold text-slate-500">{current.category ?? current.topic ?? "Soalan Objektif"}</span>
              <span className="text-sm font-black text-ocean-700">Preview percuma: Bahagian C dikunci</span>
            </div>
            <h1 className="text-2xl font-black leading-snug text-slate-950">{current.question_text}</h1>
            {current.question_image_url ? <QuestionImage src={current.question_image_url} /> : null}
            <div className="mt-6 grid gap-3">
              {current.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAnswer(current.id, option.id)}
                  className={`rounded-2xl border p-4 text-left text-sm font-bold transition ${
                    answers[current.id] === option.id ? "border-amber-400 bg-sun-50 text-slate-950" : "border-slate-200 bg-white hover:border-ocean-200"
                  }`}
                >
                  <OptionContent text={option.option_text} imageUrl={option.option_image_url ?? null} />
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex((currentIndex) => Math.max(0, currentIndex - 1))}>
                  Sebelum
                </button>
                <button type="button" className="secondary-button border-coral-100 bg-coral-50 text-coral-600 hover:border-coral-500 hover:bg-coral-50" onClick={handleSkipPreview}>
                  Skip Soalan Ini
                </button>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                {!currentReady ? <p className="text-sm font-black text-coral-600">Pilih jawapan atau tekan Skip Soalan Ini untuk teruskan.</p> : null}
                {index === orderedQuestions.length - 1 && !allComplete ? <p className="text-sm font-black text-coral-600">Jawab atau skip semua soalan percuma sebelum hantar.</p> : null}
                <button type="button" className="primary-button" disabled={busy || !currentReady || (index === orderedQuestions.length - 1 && !allComplete)} onClick={handleNextPreview}>
                  {index < orderedQuestions.length - 1 ? "Seterusnya" : busy ? "Menyemak..." : "Hantar Preview"}
                </button>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Kemajuan</h2>
                <p className="mt-1 text-xs font-black uppercase text-ocean-700">Preview percuma</p>
              </div>
              <span className={`rounded-xl px-3 py-2 text-sm font-black ${timerTone}`}>{formatTimer(remainingSeconds)}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.round((completed / Math.max(1, orderedQuestions.length)) * 100)}%` }} />
            </div>
            <div className="mt-3 grid gap-1 text-sm font-semibold text-slate-600">
              <p>{completed} daripada {orderedQuestions.length} soalan percuma selesai.</p>
              <p><span className="font-black text-amber-700">{answered}</span> dijawab, <span className="font-black text-coral-600">{skippedCount}</span> skip, <span className="font-black text-slate-500">{unanswered}</span> belum.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-sun-100 ring-1 ring-amber-300" /> Dijawab</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-coral-100 ring-1 ring-coral-500" /> Skip</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-100" /> Belum</span>
              <span className="inline-flex items-center gap-1"><LockKeyhole size={13} aria-hidden="true" /> Premium</span>
            </div>
            <div className="mt-5 space-y-5">
              {renderPreviewGroup("Bahagian A", fullPreviewTotals.A, 1, sectionAQuestions)}
              {renderPreviewGroup("Bahagian B", fullPreviewTotals.B, 31, sectionBQuestions)}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                  <span>Bahagian C</span>
                  <span>Premium</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <button type="button" disabled className="grid h-10 cursor-not-allowed place-items-center rounded-xl bg-slate-50 text-slate-300" aria-label="Bahagian C dikunci dalam versi percuma">
                    <LockKeyhole size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function PaywallPage({
  isLoggedIn,
  access,
  settings,
  userEmail,
  profileName,
  pendingPayment,
  autoOpenPayment,
  onAuth,
  onNavigate,
  onAutoOpenPaymentHandled,
  onPaymentSubmitted,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  settings: AppSettings;
  userEmail: string;
  profileName: string;
  pendingPayment: PaymentRequest | null;
  autoOpenPayment: boolean;
  onAuth: (mode: AuthMode) => void;
  onNavigate: (route: AppRoute) => void;
  onAutoOpenPaymentHandled: () => void;
  onPaymentSubmitted: () => Promise<void>;
}) {
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [toyyibPayBusy, setToyyibPayBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const priceLabel = formatCurrency(settings.payment_price, settings.payment_currency);
  const canUsePremium = access.canUsePremiumFeature();
  const primaryLabel = canUsePremium ? "Buka PKSK Academy" : `Dapatkan Premium ${priceLabel}`;

  useEffect(() => {
    if (!autoOpenPayment) {
      return;
    }

    onAutoOpenPaymentHandled();
    if (canUsePremium) {
      onNavigate("/app");
      return;
    }

    setPaymentError(null);
    setPaymentMethodOpen(true);
  }, [autoOpenPayment, canUsePremium, onAutoOpenPaymentHandled, onNavigate]);

  const handlePrimary = () => {
    if (canUsePremium) {
      onNavigate("/app");
      return;
    }
    setPaymentError(null);
    setPaymentMethodOpen(true);
  };
  const handleToyyibPay = async (customer?: ToyyibPayCustomerInput) => {
    setToyyibPayBusy(true);
    setPaymentError(null);
    try {
      const bill = await ToyyibPayService.createBill(customer);
      window.location.href = bill.paymentUrl;
    } catch (error) {
      setPaymentError(toMessage(error));
    } finally {
      setToyyibPayBusy(false);
    }
  };
  const accessNotice = access.isBlocked
    ? "Akaun ini sedang disemak oleh pentadbir."
    : access.isExpired
      ? "Akses premium telah tamat."
      : pendingPayment
        ? "Bayaran anda sedang disemak oleh Admin. Premium akan aktif selepas pembayaran disahkan."
        : "";
  const features = [
    "Simulasi tanpa had",
    "Semua bahagian",
    "Bank soalan penuh",
    "Soalan rawak",
    "Rekod prestasi",
    "XP & Level",
    "Sistem Lencana",
    "Bahagian C",
    "Unlimited Practice",
  ];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="grid gap-0 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="bg-slate-100">
            <img src={premiumHeroImage} alt="Poster promosi PKSK Academy Premium" className="h-auto w-full object-cover object-center" />
          </div>
          <div className="flex flex-col justify-center gap-6 bg-gradient-to-br from-white via-white to-amber-50/45 p-6 sm:p-8 lg:p-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-sun-100 px-3 py-2 text-sm font-black text-amber-700">
              <Crown size={17} aria-hidden="true" />
              Premium PKSK Academy
            </div>
            <div>
              <h1 className="text-4xl font-black leading-tight text-slate-950 sm:text-5xl">PKSK Academy Premium</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                Persediaan lengkap untuk calon PKSK yang lebih yakin, berprestasi dan bersedia.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sun-50 p-5 shadow-[0_18px_42px_rgba(180,83,9,0.14)]">
              <div className="mb-4 flex justify-end">
                <span className="rounded-full bg-rose-500 px-4 py-1 text-xs font-black uppercase text-white shadow-lg">Jimat RM150</span>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-500">Harga Asal</p>
                  <p className="text-2xl font-black text-slate-500 line-through decoration-rose-500 decoration-4">RM199</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-6xl font-black leading-none text-ocean-700">{priceLabel}</p>
                  <p className="mt-2 inline-flex rounded-full bg-amber-100 px-4 py-1 text-sm font-black uppercase text-amber-700">Bayaran sekali sahaja</p>
                  <p className="mt-2 text-sm font-bold text-slate-600">Akses seumur hidup</p>
                </div>
              </div>
              {accessNotice ? <p className="mt-4 rounded-2xl bg-white/75 px-4 py-3 text-sm font-bold leading-6 text-slate-700">{accessNotice}</p> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm font-black text-slate-700 ring-1 ring-slate-100">
                  <CheckCircle2 size={17} className="text-leaf-600" aria-hidden="true" />
                  {feature}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="hero-premium-cta w-full sm:w-auto" onClick={handlePrimary}>
                <Crown size={18} aria-hidden="true" />
                {primaryLabel}
              </button>
              {!canUsePremium && !isLoggedIn ? (
                <button type="button" className="secondary-button w-full sm:w-auto" onClick={() => onAuth("login")}>
                  <UserRound size={17} aria-hidden="true" />
                  Sudah ada akaun? Log Masuk
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {pendingPayment && !canUsePremium ? <PaymentPendingBanner payment={pendingPayment} /> : null}

      <section className="grid gap-5 lg:grid-cols-[0.6fr_1.4fr]">
        <article className="rounded-2xl bg-white p-6 shadow-soft">
          <p className="text-sm font-black uppercase text-ocean-700">Apa itu PKSK Academy?</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Platform persediaan PKSK oleh CikguSTEM</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            PKSK Academy membantu calon Tahun 6 membuat persediaan secara lebih konsisten melalui simulasi penuh, pilihan mengikut bahagian dan rekod perkembangan.
          </p>
        </article>
        <article className="overflow-hidden rounded-2xl bg-white shadow-soft">
          <img
            src="/assets/what-users-get.webp"
            alt="Apa yang pengguna dapat dengan PKSK Academy"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="overflow-x-auto">
          <img
            src="/assets/free-vs-premium.webp"
            alt="Perbandingan Free Preview dan Premium PKSK Academy"
            className="min-w-[760px] w-full max-w-none object-contain md:min-w-0"
            loading="lazy"
            decoding="async"
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <p className="text-sm font-black uppercase text-ocean-700">FAQ</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <FaqItem title="Perlu daftar untuk cuba percuma?" text="Tidak. Preview percuma boleh digunakan tanpa e-mel dan kata laluan." />
          <FaqItem title="Bagaimana bayaran dibuat?" text="Pilih ToyyibPay untuk bayaran automatik, atau QR DuitNow jika mahu pengesahan manual melalui WhatsApp." />
          <FaqItem title="Bagaimana Premium diaktifkan?" text="ToyyibPay mengaktifkan Premium secara automatik selepas bayaran sah. QR manual masih disahkan oleh Admin." />
        </div>
      </section>
      {paymentMethodOpen ? (
        <PaymentMethodDialog
          settings={settings}
          isLoggedIn={isLoggedIn}
          userEmail={userEmail}
          initialCustomerName={profileName}
          error={paymentError}
          toyyibPayBusy={toyyibPayBusy}
          onClose={() => setPaymentMethodOpen(false)}
          onToyyibPay={handleToyyibPay}
          onManualQr={() => {
            setPaymentMethodOpen(false);
            setManualPaymentOpen(true);
          }}
        />
      ) : null}
      {manualPaymentOpen ? (
        <ManualPaymentDialog
          settings={settings}
          userEmail={userEmail}
          onClose={() => setManualPaymentOpen(false)}
          onPaymentSubmitted={async () => {
            await onPaymentSubmitted();
            setManualPaymentOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PaymentMethodDialog({
  settings,
  isLoggedIn,
  userEmail,
  initialCustomerName,
  error,
  toyyibPayBusy,
  onClose,
  onToyyibPay,
  onManualQr,
}: {
  settings: AppSettings;
  isLoggedIn: boolean;
  userEmail: string;
  initialCustomerName: string;
  error: string | null;
  toyyibPayBusy: boolean;
  onClose: () => void;
  onToyyibPay: (customer?: ToyyibPayCustomerInput) => Promise<void>;
  onManualQr: () => void;
}) {
  const priceLabel = formatCurrency(settings.payment_price, settings.payment_currency);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [customerEmail, setCustomerEmail] = useState(userEmail);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerError, setCustomerError] = useState<string | null>(null);

  function handleToyyibPayClick() {
    const displayName = customerName.trim();
    const email = customerEmail.trim().toLowerCase();
    const phone = normalizeMalaysiaPhone(customerPhone);
    const password = customerPassword.trim();

    if (!displayName) {
      setCustomerError("Sila isi nama pelanggan.");
      return;
    }
    if (!email || !email.includes("@")) {
      setCustomerError("Sila isi e-mel yang sah.");
      return;
    }
    if (!phone) {
      setCustomerError("Sila isi nombor telefon yang sah.");
      return;
    }
    if (!isLoggedIn && password.length < 6) {
      setCustomerError("Kata laluan perlu sekurang-kurangnya 6 aksara.");
      return;
    }

    setCustomerError(null);
    void onToyyibPay({
      displayName,
      email,
      phone,
      password: isLoggedIn ? "authenticated-checkout" : password,
    });
  }

  return (
    <section className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
              <CreditCard size={23} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-black uppercase text-ocean-700">Premium {priceLabel}</p>
              <h2 className="text-2xl font-black text-slate-950">Pilih Kaedah Pembayaran</h2>
            </div>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error || customerError ? <p className="mt-5 rounded-2xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-700">{customerError ?? error}</p> : null}

        <div className="mt-5 rounded-3xl border border-ocean-100 bg-ocean-50/70 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-ocean-700 shadow-sm">
              <UserRound size={22} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-950">Maklumat pelanggan</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                {isLoggedIn
                  ? "Bayaran akan dipautkan kepada akaun ini selepas ToyyibPay berjaya."
                  : "Isi maklumat ini sekali sahaja. Akaun Premium akan disediakan selepas bayaran ToyyibPay berjaya."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Label text="Nama pelanggan">
              <input
                className="field bg-white"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Contoh: Najib"
                autoComplete="name"
                disabled={toyyibPayBusy}
              />
            </Label>
            <Label text="E-mel">
              <input
                className="field bg-white"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="nama@email.com"
                autoComplete="email"
                disabled={toyyibPayBusy || Boolean(isLoggedIn && userEmail)}
              />
            </Label>
            <div className="sm:col-span-2">
              <Label text="No. telefon">
                <input
                  className="field bg-white"
                  type="tel"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Contoh: 0197259548"
                  autoComplete="tel"
                  disabled={toyyibPayBusy}
                />
              </Label>
            </div>
            {!isLoggedIn ? (
              <div className="sm:col-span-2">
                <Label text="Kata laluan akaun">
                  <input
                    className="field bg-white"
                    type="password"
                    value={customerPassword}
                    onChange={(event) => setCustomerPassword(event.target.value)}
                    placeholder="Minimum 6 aksara"
                    autoComplete="new-password"
                    disabled={toyyibPayBusy}
                  />
                </Label>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  Jika e-mel ini sudah pernah didaftarkan, bayaran akan dipautkan kepada akaun tersebut dan kata laluan sedia ada tidak ditukar.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="relative overflow-hidden rounded-3xl border border-ocean-200 bg-gradient-to-br from-ocean-50 via-white to-teal-50 p-5 shadow-[0_18px_46px_rgba(8,145,178,0.18)]">
            <span className="absolute right-4 top-4 rounded-full bg-sun-400 px-3 py-1 text-[11px] font-black uppercase text-amber-900">Disyorkan</span>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-ocean-700 shadow-sm">
              <CreditCard size={24} aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-xl font-black text-slate-950">ToyyibPay</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Bayar melalui perbankan dalam talian. Premium diaktifkan secara automatik selepas bayaran berjaya.
            </p>
            <button type="button" className="primary-button mt-5 w-full" onClick={handleToyyibPayClick} disabled={toyyibPayBusy}>
              <CreditCard size={18} aria-hidden="true" />
              {toyyibPayBusy ? "Menyediakan bil..." : "Teruskan ke ToyyibPay"}
            </button>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-700">
              <QrCode size={24} aria-hidden="true" />
            </div>
            <p className="mt-5 text-xs font-black uppercase text-slate-500">Bayaran Manual</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">QR DuitNow</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Bayar melalui QR dan hantar pengesahan melalui WhatsApp. Admin akan semak sebelum Premium diaktifkan.
            </p>
            <button type="button" className="secondary-button mt-5 w-full" onClick={onManualQr} disabled={toyyibPayBusy}>
              <QrCode size={18} aria-hidden="true" />
              Bayar melalui QR
            </button>
          </article>
        </div>
      </div>
    </section>
  );
}

function ManualPaymentDialog({
  settings,
  userEmail,
  onClose,
  onPaymentSubmitted,
}: {
  settings: AppSettings;
  userEmail: string;
  onClose: () => void;
  onPaymentSubmitted: () => Promise<void>;
}) {
  const [email, setEmail] = useState(userEmail);
  const [busy, setBusy] = useState(false);
  const priceLabel = formatCurrency(settings.payment_price, settings.payment_currency);

  async function handlePaid() {
    setBusy(true);
    try {
      await ManualPaymentService.createRequest(email || null);
      const whatsappUrl = ManualPaymentService.buildConfirmationUrl(settings);
      const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = whatsappUrl;
      }
      await onPaymentSubmitted();
    } catch (error) {
      alert(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={appLogoPath} alt="PKSK Academy" className="h-14 w-14 rounded-2xl object-contain" />
            <div>
              <p className="text-xs font-black uppercase text-ocean-700">Bayaran Manual</p>
              <h2 className="text-2xl font-black text-slate-950">PKSK Academy Premium</h2>
            </div>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-ocean-100 bg-ocean-50 p-5 text-center">
          <p className="text-sm font-black uppercase text-ocean-700">Harga Premium</p>
          <p className="mt-1 text-5xl font-black text-slate-950">{priceLabel}</p>
          <p className="mt-2 text-sm font-bold text-slate-600">Bayaran sekali sahaja. Tiada caj bulanan.</p>
        </div>

        <p className="mt-5 text-center text-sm font-semibold leading-6 text-slate-600">
          Sila scan QR DuitNow di bawah untuk membuat pembayaran.
        </p>

        <div className="mx-auto mt-4 max-w-xs overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-3">
          <img src={settings.payment_qr_image_url} alt="QR DuitNow PKSK Academy Premium" className="w-full rounded-2xl object-contain" />
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <SummaryRow label="Nama Penerima" value={settings.payment_account_name} />
          <SummaryRow label="Bank" value={settings.payment_bank_name} />
          <SummaryRow label="No Akaun" value={settings.payment_account_number} />
        </div>

        <div className="mt-4">
          <Label text="E-mel langganan">
            <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Contoh: nama@email.com" />
          </Label>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            E-mel ini disimpan untuk rujukan admin. Mesej WhatsApp akan dibuka dahulu supaya pengguna boleh semak sebelum hantar.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="primary-button flex-1" onClick={handlePaid} disabled={busy}>
            <MessageCircle size={18} aria-hidden="true" />
            {busy ? "Menyediakan WhatsApp..." : "Saya Dah Bayar"}
          </button>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Tutup
          </button>
        </div>
      </div>
    </section>
  );
}

function FaqItem({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl bg-slate-50 p-5">
      <h3 className="font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function CheckoutPage({
  isLoggedIn,
  access,
  onAuth,
  onNavigate,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  onAuth: (mode: AuthMode) => void;
  onNavigate: (route: AppRoute) => void;
}) {
  if (!isLoggedIn) {
    return <PremiumRouteGate onStartGuestPreview={() => onNavigate("/preview")} onAuth={onAuth} onShowPaywall={() => onNavigate("/premium")} />;
  }

  if (access.canUsePremiumFeature()) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
        <h1 className="text-3xl font-black">Akses Premium sudah aktif</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Akaun ini sudah boleh menggunakan PKSK Academy.</p>
        <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/app")}>
          Buka PKSK Academy
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-soft">
      <div className="grid gap-5 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun-100 text-amber-700">
          <Crown size={26} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-black">Bayaran dibuat di halaman Premium.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Buka halaman Premium untuk pilih ToyyibPay atau QR DuitNow manual.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5 text-left">
          <h2 className="text-lg font-black">Flow ringkas</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            ToyyibPay akan mengaktifkan Premium secara automatik selepas bayaran sah. QR DuitNow masih tersedia untuk bayaran manual melalui WhatsApp.
          </p>
        </div>
        <button type="button" className="primary-button mx-auto" onClick={() => onNavigate("/premium")}>
          Buka Premium
        </button>
      </div>
    </section>
  );
}

function PaymentResultPage({
  isLoggedIn,
  access,
  onAuth,
  onNavigate,
  onRefreshStatus,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  onAuth: (mode: AuthMode) => void;
  onNavigate: (route: AppRoute) => void;
  onRefreshStatus: () => Promise<void>;
}) {
  const [payment, setPayment] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(isLoggedIn);
  const [error, setError] = useState<string | null>(null);

  const refreshPayment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let verificationMessage: string | null = null;
      const returnTarget = getToyyibPayReturnTarget();
      if (isLoggedIn || hasToyyibPayReturnTarget(returnTarget)) {
        try {
          const verification = await ToyyibPayService.verifyPayment(returnTarget);
          if (!isLoggedIn && verification.paymentId) {
            setPayment({
              id: verification.paymentId,
              user_id: null,
              email: null,
              amount: 49,
              currency: "MYR",
              status: verification.status,
              provider: "toyyibpay",
              payment_method: "toyyibpay",
              provider_bill_code: returnTarget.billCode ?? null,
              provider_reference: verification.providerReference,
              external_reference: returnTarget.externalReference ?? null,
              referral_code: null,
              referral_agent_id: null,
              paid_at: verification.status === "paid" ? new Date().toISOString() : null,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch (verificationError) {
          verificationMessage = toMessage(verificationError);
        }
      }

      if (isLoggedIn) {
        await onRefreshStatus();
        const latestPayment = await fetchMyLatestPaymentRequest().catch(() => null);
        setPayment(latestPayment);
        if (verificationMessage && latestPayment?.status !== "paid" && latestPayment?.status !== "approved") {
          setError(verificationMessage);
        }
      } else if (verificationMessage) {
        setError(verificationMessage);
      }
    } catch (refreshError) {
      setError(toMessage(refreshError));
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, onRefreshStatus]);

  useEffect(() => {
    refreshPayment();
  }, [refreshPayment]);

  if (!isLoggedIn && payment?.status === "paid") {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-leaf-50 text-leaf-600">
          <CheckCircle2 size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Pembayaran berjaya.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          Premium telah diaktifkan. Log masuk menggunakan e-mel dan kata laluan yang diisi semasa pembayaran untuk buka PKSK Academy.
        </p>
        <button type="button" className="primary-button mx-auto mt-6" onClick={() => onAuth("login")}>
          Log Masuk
        </button>
      </section>
    );
  }

  if (!isLoggedIn && !loading) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <UserRound size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Log masuk untuk semak bayaran</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          Gunakan e-mel dan kata laluan yang diisi semasa pembayaran. Jika Supabase meminta pengesahan e-mel, sahkan dahulu melalui inbox.
        </p>
        {error ? <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-700">{error}</p> : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" className="primary-button" onClick={() => onAuth("login")}>
            Log Masuk
          </button>
          <button type="button" className="secondary-button" onClick={() => onNavigate("/premium")}>
            Kembali ke Premium
          </button>
        </div>
      </section>
    );
  }

  if (access.canUsePremiumFeature()) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-leaf-50 text-leaf-600">
          <CheckCircle2 size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Pembayaran berjaya.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Premium telah diaktifkan untuk akaun ini.</p>
        <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/app")}>
          Buka PKSK Academy
        </button>
      </section>
    );
  }

  const failedStatus = payment?.status === "failed" || payment?.status === "cancelled" || payment?.status === "rejected";
  const title = failedStatus ? "Pembayaran tidak berjaya." : loading ? "Menyemak bayaran..." : "Pembayaran sedang disahkan.";
  const text = failedStatus
    ? "Premium belum diaktifkan. Anda boleh cuba semula atau gunakan QR DuitNow manual."
    : "Sistem sedang menyemak bayaran ToyyibPay. Jika bayaran berjaya, Premium akan dibuka secara automatik selepas pengesahan diterima.";

  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${failedStatus ? "bg-coral-50 text-coral-600" : "bg-sun-100 text-amber-700"}`}>
        {failedStatus ? <X size={26} aria-hidden="true" /> : <Clock3 size={26} aria-hidden="true" />}
      </div>
      <h1 className="mt-5 text-3xl font-black text-slate-950">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">{error ?? text}</p>
      {payment ? (
        <div className="mx-auto mt-5 grid max-w-md gap-2 rounded-2xl bg-slate-50 p-4 text-left text-sm">
          <SummaryRow label="Kaedah" value={paymentMethodLabel(payment.payment_method)} />
          <SummaryRow label="Status" value={paymentStatusLabel(payment.status)} />
          <SummaryRow label="Rujukan" value={payment.provider_reference ?? payment.provider_bill_code ?? "-"} />
        </div>
      ) : null}
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className="primary-button" onClick={refreshPayment} disabled={loading}>
          <RefreshCw size={17} aria-hidden="true" />
          {loading ? "Menyemak..." : "Refresh Status"}
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate("/premium")}>
          Kembali ke Premium
        </button>
      </div>
    </section>
  );
}

function AdminShell({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader icon={Users} title={title} text={text} />
      <AdminNav />
      {children}
    </div>
  );
}

function AdminNav() {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const items: Array<{ to: AppRoute; label: string }> = [
    { to: "/admin", label: "Admin Dashboard" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/subscriptions", label: "Subscriptions" },
    { to: "/admin/payment-requests", label: "Payment Requests" },
    { to: "/admin/agents", label: "Diamond Partners" },
    { to: "/admin/questions", label: "Question Bank" },
    { to: "/admin/questions/import-history", label: "Import History" },
    { to: "/admin/settings", label: "System Settings" },
  ];
  const currentPath = window.location.pathname as AppRoute;
  const activeItem = items.find((item) => item.to === currentPath) ?? (currentPath === "/admin/questions/import" ? items.find((item) => item.to === "/admin/questions") : null) ?? items[0];
  const isActiveItem = (to: AppRoute) => to === currentPath || (to === "/admin/questions" && currentPath === "/admin/questions/import");

  function navigateAdmin(to: AppRoute) {
    setIsAdminMenuOpen(false);
    navigateAdminRoute(to);
  }

  return (
    <nav className="rounded-2xl bg-white p-2 shadow-soft" aria-label="Admin navigation">
      <div className="md:hidden">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-ocean-50 px-4 py-3 text-left text-sm font-black text-ocean-800"
          onClick={() => setIsAdminMenuOpen((current) => !current)}
          aria-expanded={isAdminMenuOpen}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Menu size={17} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{activeItem.label}</span>
          </span>
          <ChevronRight size={17} className={`shrink-0 transition ${isAdminMenuOpen ? "rotate-90" : ""}`} aria-hidden="true" />
        </button>
        {isAdminMenuOpen ? (
          <div className="mt-2 grid gap-2">
            {items.map((item) => (
              <button
                key={item.to}
                type="button"
                className={`flex min-h-11 w-full items-center rounded-xl px-4 py-2 text-left text-sm font-bold ${
                  isActiveItem(item.to) ? "bg-ocean-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-ocean-50 hover:text-ocean-700"
                }`}
                onClick={() => navigateAdmin(item.to)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="hidden gap-2 overflow-x-auto md:flex">
        {items.map((item) => (
          <button
            key={item.to}
            type="button"
            className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${
              isActiveItem(item.to) ? "bg-ocean-50 text-ocean-700" : "text-slate-600 hover:bg-ocean-50 hover:text-ocean-700"
            }`}
            onClick={() => navigateAdmin(item.to)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function navigateAdminRoute(to: AppRoute, query = "") {
  window.history.pushState({}, "", `${to}${query}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function AdminDashboardPage({ onNavigate, onMessage }: { onNavigate: (route: AppRoute) => void; onMessage: (message: string | null) => void }) {
  const [kpis, setKpis] = useState<AdminKpis | null>(null);

  useEffect(() => {
    fetchAdminKpis()
      .then(setKpis)
      .catch((error) => onMessage(toMessage(error)));
  }, [onMessage]);

  return (
    <AdminShell title="Admin Dashboard" text="Pantau pengguna, akses premium dan aktiviti simulasi.">
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Registered Users" value={`${kpis?.total_registered_users ?? 0}`} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Crown} label="Premium Users" value={`${kpis?.premium_users ?? 0}`} tone="bg-sun-50 text-amber-700" />
        <StatCard icon={UserRound} label="Free Users" value={`${kpis?.free_users ?? 0}`} tone="bg-slate-100 text-slate-700" />
        <StatCard icon={LockKeyhole} label="Blocked Users" value={`${kpis?.blocked_users ?? 0}`} tone="bg-coral-50 text-coral-600" />
        <StatCard icon={Clock3} label="Expired Users" value={`${kpis?.expired_users ?? 0}`} tone="bg-slate-100 text-slate-700" />
        <StatCard icon={Zap} label="Active Today" value={`${kpis?.active_users_today ?? 0}`} tone="bg-leaf-50 text-leaf-600" />
        <StatCard icon={ClipboardList} label="Total Attempts" value={`${kpis?.total_quiz_attempts ?? 0}`} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Target} label="Attempts Today" value={`${kpis?.attempts_today ?? 0}`} tone="bg-sun-50 text-amber-700" />
      </section>
      <section className="grid gap-5 md:grid-cols-3">
        <ModeCard title="Manage Users" text="Cari pengguna, buka akses premium dan block akaun." icon={Users} onClick={() => onNavigate("/admin/users")} />
        <ModeCard title="Payment Requests" text="Semak bayaran QR DuitNow dan approve Premium." icon={MessageCircle} onClick={() => onNavigate("/admin/payment-requests")} />
        <ModeCard title="Diamond Partners" text="Approve permohonan, semak komisen dan tanda payout manual." icon={Gem} onClick={() => onNavigate("/admin/agents")} />
        <ModeCard title="Question Bank" text="Semak soalan aktif dan status bank soalan." icon={BookOpen} onClick={() => onNavigate("/admin/questions")} />
        <ModeCard title="System Settings" text="Semak had preview percuma dan pelan subscription." icon={ShieldCheck} onClick={() => onNavigate("/admin/settings")} />
      </section>
    </AdminShell>
  );
}

function AdminUsersPage({ isSuperAdmin, onMessage }: { isSuperAdmin: boolean; onMessage: (message: string | null) => void }) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>("monthly");
  const [busyAction, setBusyAction] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const nextUsers = await fetchAdminUsers(search, filter);
      setUsers(nextUsers);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [filter, onMessage, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setBusyAction(true);
    onMessage(null);
    try {
      await action();
      setSelectedUser(null);
      await loadUsers();
      onMessage(successMessage);
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <AdminShell title="Users" text="Urus akses premium tanpa mendedahkan data auth secara terus kepada React.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, e-mel atau sekolah" />
          <select className="field" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {["all", "premium", "free", "expired", "blocked", "admin"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-button" onClick={loadUsers}>
            Search
          </button>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                {["Name", "Email", "School", "State", "Role", "Subscription", "Plan", "Ends", "Last Login", "Actions"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-4 py-3 font-bold text-slate-900">{user.display_name || user.full_name || "User"}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-600">{user.school || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{user.state || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3 text-slate-600">{subscriptionLabel(user.subscription_status)}</td>
                  <td className="px-4 py-3 text-slate-600">{user.subscription_plan ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(user.subscription_ends_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(user.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="rounded-lg bg-ocean-50 px-3 py-2 text-xs font-black text-ocean-700" onClick={() => setSelectedUser(user)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm font-semibold text-slate-500" colSpan={10}>
                    Tiada pengguna ditemui.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {selectedUser ? (
        <section className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">{selectedUser.display_name || selectedUser.email}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedUser.email}</p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={() => setSelectedUser(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Label text="Subscription plan">
                <select className="field" value={plan} onChange={(event) => setPlan(event.target.value as SubscriptionPlan)}>
                  <option value="monthly">monthly</option>
                  <option value="6_months">6_months</option>
                  <option value="yearly">yearly</option>
                  <option value="lifetime">lifetime</option>
                </select>
              </Label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-black">Current</p>
                <p className="mt-1 text-slate-600">
                  {subscriptionLabel(selectedUser.subscription_status)} / {selectedUser.subscription_plan ?? "no plan"}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button disabled={busyAction} className="primary-button" onClick={() => runAction(() => grantPremium(selectedUser.id, plan), "Premium diberikan.")}>
                Grant Premium
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => extendPremium(selectedUser.id, "monthly"), "Dilanjutkan 30 hari.")}>
                Extend 30 Days
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => extendPremium(selectedUser.id, "6_months"), "Dilanjutkan 6 bulan.")}>
                Extend 6 Months
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => extendPremium(selectedUser.id, "yearly"), "Dilanjutkan 1 tahun.")}>
                Extend 1 Year
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => extendPremium(selectedUser.id, "lifetime"), "Lifetime diaktifkan.")}>
                Set Lifetime
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => revokePremium(selectedUser.id), "Premium dibatalkan.")}>
                Revoke Premium
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => blockUser(selectedUser.id), "Akaun disekat.")}>
                Block User
              </button>
              <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => unblockUser(selectedUser.id), "Akaun dibuka semula.")}>
                Unblock User
              </button>
              {isSuperAdmin ? (
                <>
                  <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => setUserRole(selectedUser.id, "admin"), "Role admin diberikan.")}>
                    Promote Admin
                  </button>
                  <button disabled={busyAction} className="secondary-button" onClick={() => runAction(() => setUserRole(selectedUser.id, "user"), "Role admin dibuang.")}>
                    Remove Admin
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}

function AdminDiamondPartnersPage({ onMessage }: { onMessage: (message: string | null) => void }) {
  const [partners, setPartners] = useState<AdminDiamondPartnerRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("pending");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminDiamondPartnerDetail | null>(null);

  const loadPartners = useCallback(async () => {
    try {
      const nextPartners = await fetchAdminDiamondPartners(search, statusFilter);
      setPartners(nextPartners);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [onMessage, search, statusFilter]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  async function runAction(agentId: string, action: () => Promise<void>, successMessage: string) {
    setBusyAction(agentId);
    onMessage(null);
    try {
      await action();
      await loadPartners();
      if (selectedDetail?.agent.id === agentId) {
        setSelectedDetail(await fetchAdminDiamondPartner(agentId));
      }
      onMessage(successMessage);
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function openDetail(agentId: string) {
    setBusyAction(agentId);
    onMessage(null);
    try {
      setSelectedDetail(await fetchAdminDiamondPartner(agentId));
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function markPaid(commission: AgentCommissionSummary) {
    const confirmed = window.confirm(`Sahkan komisen ${formatCurrency(commission.amount, "MYR")} telah dibayar kepada Diamond Partner ini?`);
    if (!confirmed || !selectedDetail) {
      return;
    }

    setBusyAction(commission.id);
    onMessage(null);
    try {
      await markAgentCommissionPaid(commission.id);
      await loadPartners();
      setSelectedDetail(await fetchAdminDiamondPartner(selectedDetail.agent.id));
      onMessage("Komisen telah ditanda sebagai paid.");
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const totalCount = partners[0]?.total_count ?? partners.length;

  return (
    <AdminShell title="Diamond Partners" text="Approve permohonan, semak referral dan urus payout komisen manual.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, e-mel, bank atau referral code" />
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AgentStatus | "all")}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="not_agent">Rejected</option>
            <option value="all">All</option>
          </select>
          <button type="button" className="secondary-button" onClick={loadPartners}>
            Search
          </button>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500">{totalCount} Diamond Partner ditemui</p>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                {["Nama", "Email", "Referral", "Status", "Jualan", "Total", "Eligible", "Paid", "Bank", "Created", "Actions"].map((header) => (
                  <th key={header} className="px-4 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {partners.map((partner) => (
                <tr key={partner.id} className="align-top">
                  <td className="px-4 py-3 font-black text-slate-900">{partner.name ?? "User"}</td>
                  <td className="px-4 py-3 text-slate-600">{partner.email ?? "-"}</td>
                  <td className="px-4 py-3 font-black text-ocean-700">{partner.referral_code ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-xl px-3 py-2 text-xs font-black ${diamondStatusTone(partner.status)}`}>{diamondStatusLabel(partner.status)}</span>
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900">{partner.total_sales}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(partner.total_commission, "MYR")}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(partner.eligible_commission, "MYR")}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(partner.paid_commission, "MYR")}</td>
                  <td className="px-4 py-3 text-slate-600">{partner.bank_name ?? "-"} {partner.bank_account_last4 ? `••••${partner.bank_account_last4}` : ""}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(partner.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[220px] flex-wrap gap-2">
                      <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700" disabled={busyAction === partner.id} onClick={() => openDetail(partner.id)}>
                        View
                      </button>
                      {partner.status === "pending" ? (
                        <>
                          <button type="button" className="rounded-lg bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-600" disabled={busyAction === partner.id} onClick={() => runAction(partner.id, () => approveDiamondPartner(partner.id), "Diamond Partner telah diluluskan.")}>
                            Approve
                          </button>
                          <button type="button" className="rounded-lg bg-coral-50 px-3 py-2 text-xs font-black text-coral-600" disabled={busyAction === partner.id} onClick={() => runAction(partner.id, () => rejectDiamondPartner(partner.id), "Permohonan Diamond ditolak.")}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {partner.status === "active" ? (
                        <button type="button" className="rounded-lg bg-sun-50 px-3 py-2 text-xs font-black text-amber-700" disabled={busyAction === partner.id} onClick={() => runAction(partner.id, () => suspendDiamondPartner(partner.id), "Diamond Partner digantung. Premium user tidak terjejas.")}>
                          Suspend
                        </button>
                      ) : null}
                      {partner.status === "suspended" ? (
                        <button type="button" className="rounded-lg bg-ocean-50 px-3 py-2 text-xs font-black text-ocean-700" disabled={busyAction === partner.id} onClick={() => runAction(partner.id, () => reactivateDiamondPartner(partner.id), "Diamond Partner diaktifkan semula.")}>
                          Reactivate
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {partners.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm font-semibold text-slate-500" colSpan={11}>
                    Tiada Diamond Partner untuk filter ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedDetail ? (
        <AdminDiamondPartnerModal
          detail={selectedDetail}
          busyAction={busyAction}
          onClose={() => setSelectedDetail(null)}
          onApprove={(agentId) => runAction(agentId, () => approveDiamondPartner(agentId), "Diamond Partner telah diluluskan.")}
          onReject={(agentId) => runAction(agentId, () => rejectDiamondPartner(agentId), "Permohonan Diamond ditolak.")}
          onSuspend={(agentId) => runAction(agentId, () => suspendDiamondPartner(agentId), "Diamond Partner digantung.")}
          onReactivate={(agentId) => runAction(agentId, () => reactivateDiamondPartner(agentId), "Diamond Partner diaktifkan semula.")}
          onMarkPaid={markPaid}
        />
      ) : null}
    </AdminShell>
  );
}

function AdminDiamondPartnerModal({
  detail,
  busyAction,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
  onMarkPaid,
}: {
  detail: AdminDiamondPartnerDetail;
  busyAction: string | null;
  onClose: () => void;
  onApprove: (agentId: string) => void;
  onReject: (agentId: string) => void;
  onSuspend: (agentId: string) => void;
  onReactivate: (agentId: string) => void;
  onMarkPaid: (commission: AgentCommissionSummary) => void;
}) {
  const { agent } = detail;

  return (
    <section className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 px-4 py-6">
      <div className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Diamond Partner</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{agent.name ?? agent.email ?? "User"}</h2>
            <p className="mt-1 text-sm text-slate-500">{agent.email ?? "-"}</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose} aria-label="Tutup">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <SummaryPanel title="Status" value={diamondStatusLabel(agent.status)} />
          <SummaryPanel title="Referral" value={agent.referral_code ?? "-"} />
          <SummaryPanel title="Eligible" value={formatCurrency(agent.eligible_commission, "MYR")} />
          <SummaryPanel title="Paid" value={formatCurrency(agent.paid_commission, "MYR")} />
        </div>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-lg font-black text-slate-950">Maklumat Bank</h3>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Nama Akaun" value={agent.bank_account_name ?? "-"} />
            <Metric label="Bank" value={agent.bank_name ?? "-"} />
            <Metric label="Nombor Akaun" value={agent.bank_account_number ?? "-"} />
            <Metric label="Telefon" value={agent.phone ?? "-"} />
          </div>
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          {agent.status === "pending" ? (
            <>
              <button type="button" className="primary-button" disabled={busyAction === agent.id} onClick={() => onApprove(agent.id)}>Approve</button>
              <button type="button" className="secondary-button border-coral-100 bg-coral-50 text-coral-600" disabled={busyAction === agent.id} onClick={() => onReject(agent.id)}>Reject</button>
            </>
          ) : null}
          {agent.status === "active" ? (
            <button type="button" className="secondary-button border-amber-100 bg-sun-50 text-amber-700" disabled={busyAction === agent.id} onClick={() => onSuspend(agent.id)}>Suspend</button>
          ) : null}
          {agent.status === "suspended" ? (
            <button type="button" className="primary-button" disabled={busyAction === agent.id} onClick={() => onReactivate(agent.id)}>Reactivate</button>
          ) : null}
        </div>

        <section className="mt-6">
          <h3 className="text-lg font-black text-slate-950">Komisen</h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  {["Pembeli", "Bayaran", "Layak", "Jumlah", "Status", "Action"].map((header) => (
                    <th key={header} className="px-4 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.commissions.map((commission) => (
                  <tr key={commission.id}>
                    <td className="px-4 py-3 font-black text-slate-900">{commission.buyer_name ?? commission.buyer_email_masked ?? "Pembeli"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatShortDate(commission.payment_confirmed_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatShortDate(commission.eligible_at)}</td>
                    <td className="px-4 py-3 font-black text-slate-900">{formatCurrency(commission.amount, "MYR")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-xl px-3 py-2 text-xs font-black ${commissionStatusTone(commission.effective_status)}`}>{commissionStatusLabel(commission.effective_status)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {commission.effective_status === "eligible" ? (
                        <button type="button" className="rounded-lg bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-600" disabled={busyAction === commission.id} onClick={() => onMarkPaid(commission)}>
                          Mark Paid
                        </button>
                      ) : commission.effective_status === "paid" ? (
                        <span className="text-xs font-bold text-slate-500">{formatShortDate(commission.paid_at)}</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">Belum layak</span>
                      )}
                    </td>
                  </tr>
                ))}
                {detail.commissions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm font-semibold text-slate-500" colSpan={6}>
                      Belum ada komisen.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function getToyyibPayReturnTarget() {
  const params = new URLSearchParams(window.location.search);
  return {
    paymentId: params.get("paymentId") ?? params.get("payment_id") ?? params.get("id") ?? undefined,
    billCode: params.get("billCode") ?? params.get("billcode") ?? params.get("BillCode") ?? undefined,
    externalReference: params.get("order_id") ?? params.get("orderId") ?? params.get("external_reference") ?? undefined,
  };
}

function hasToyyibPayReturnTarget(target: ReturnType<typeof getToyyibPayReturnTarget>): boolean {
  return Boolean(target.paymentId || target.billCode || target.externalReference);
}

function AdminPaymentRequestsPage({
  onMessage,
  onPaymentUpdated,
}: {
  onMessage: (message: string | null) => void;
  onPaymentUpdated: () => Promise<void> | void;
}) {
  const [requests, setRequests] = useState<AdminPaymentRequestRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const nextRequests = await fetchAdminPaymentRequests(search, statusFilter);
      setRequests(nextRequests);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [onMessage, search, statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function runAction(requestId: string, action: () => Promise<void>, successMessage: string) {
    setBusyAction(requestId);
    onMessage(null);
    try {
      await action();
      await loadRequests();
      await onPaymentUpdated();
      onMessage(successMessage);
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function verifyToyyibPayPayment(request: AdminPaymentRequestRow) {
    setBusyAction(request.id);
    onMessage(null);
    try {
      const result = await ToyyibPayService.verifyPayment({
        paymentId: request.id,
        billCode: request.provider_bill_code ?? undefined,
        externalReference: request.external_reference ?? undefined,
      });
      await loadRequests();
      await onPaymentUpdated();

      if (result.status === "paid" || result.premiumActivated) {
        onMessage("Bayaran ToyyibPay berjaya disahkan. Akaun Premium telah diaktifkan secara automatik.");
      } else if (result.status === "failed" || result.status === "cancelled") {
        onMessage("ToyyibPay mengesahkan bayaran ini tidak berjaya. Status rekod telah dikemas kini.");
      } else {
        onMessage("ToyyibPay belum mengesahkan bayaran ini. Biarkan sebagai Pending atau semak semula sebentar lagi.");
      }
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const totalCount = requests[0]?.total_count ?? requests.length;

  return (
    <AdminShell title="Payment Requests" text="Semak bayaran ToyyibPay automatik dan QR DuitNow manual dalam satu tempat.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau e-mel" />
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="approved">Approved</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="all">All</option>
          </select>
          <button type="button" className="secondary-button" onClick={loadRequests}>
            Search
          </button>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500">{totalCount} rekod bayaran ditemui</p>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Tarikh</th>
                <th className="px-4 py-3">Jumlah</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Paid At</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3 font-black text-slate-900">{request.display_name ?? "Belum dipadankan"}</td>
                  <td className="px-4 py-3 text-slate-600">{request.email ?? "-"}</td>
                  <td className="px-4 py-3 font-black text-slate-700">{paymentMethodLabel(request.payment_method)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(request.created_at)}</td>
                  <td className="px-4 py-3 font-black text-slate-900">{formatCurrency(Number(request.amount), request.currency)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-600">{request.provider_reference ?? request.provider_bill_code ?? request.external_reference ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(request.paid_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-3 py-2 text-xs font-black ${paymentStatusTone(request.status)}`}>{paymentStatusLabel(request.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {request.status === "pending" && request.payment_method === "toyyibpay" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-ocean-50 px-3 py-2 text-xs font-black text-ocean-700 hover:bg-ocean-100"
                        disabled={busyAction === request.id}
                        onClick={() => verifyToyyibPayPayment(request)}
                      >
                        {busyAction === request.id ? "Menyemak..." : "Semak ToyyibPay"}
                      </button>
                    ) : request.status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-600"
                          disabled={busyAction === request.id}
                          onClick={() => runAction(request.id, () => approvePaymentRequest(request.id), "Bayaran diluluskan. Premium lifetime telah diaktifkan.")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-coral-50 px-3 py-2 text-xs font-black text-coral-600"
                          disabled={busyAction === request.id}
                          onClick={() => {
                            const notes = window.prompt("Catatan reject (optional)") ?? "";
                            runAction(request.id, () => rejectPaymentRequest(request.id, notes), "Bayaran ditanda rejected.");
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-500">
                        {request.payment_method === "toyyibpay" && request.status === "paid" ? "Auto ToyyibPay" : request.reviewed_at ? `Disemak ${formatShortDate(request.reviewed_at)}` : "Selesai"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {requests.length === 0 ? <div className="p-8 text-center text-sm font-bold text-slate-500">Tiada rekod bayaran untuk filter ini.</div> : null}
      </section>
    </AdminShell>
  );
}

function AdminQuestionsPage({ onMessage }: { onMessage: (message: string | null) => void }) {
  const [questions, setQuestions] = useState<AdminQuestionRow[]>([]);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<AdminQuestionRow | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestionRow | null>(null);

  const loadQuestions = useCallback(async () => {
    try {
      const nextQuestions = await fetchAdminQuestions(search, sectionFilter, statusFilter, sourceFilter);
      setQuestions(nextQuestions);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [onMessage, search, sectionFilter, sourceFilter, statusFilter]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  async function runStatusAction(action: () => Promise<void>, successMessage: string) {
    onMessage(null);
    try {
      await action();
      await loadQuestions();
      onMessage(successMessage);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }

  const totalCount = questions[0]?.total_count ?? questions.length;

  return (
    <AdminShell title="Question Bank" text="Urus soalan aktif. Import PDF/CSV akan masuk draft review dahulu sebelum publish.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 lg:grid-cols-[auto_auto_auto_1fr]">
          <button type="button" className="primary-button" onClick={() => setManualOpen(true)}>
            <Plus size={18} aria-hidden="true" />
            Tambah Soalan
          </button>
          <button type="button" className="secondary-button" onClick={() => navigateAdminRoute("/admin/questions/import")}>
            <FileUp size={18} aria-hidden="true" />
            Import PDF
          </button>
          <button type="button" className="secondary-button" onClick={() => setCsvOpen(true)}>
            <FileSpreadsheet size={18} aria-hidden="true" />
            Import CSV
          </button>
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari soalan, kategori, topik atau sumber" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select className="field" value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
            <option value="all">Semua bahagian</option>
            <option value="A">Bahagian A</option>
            <option value="B">Bahagian B</option>
            <option value="C">Bahagian C</option>
          </select>
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Semua status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <input className="field" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} placeholder="Sumber" />
          <button type="button" className="secondary-button" onClick={loadQuestions}>
            Search
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500">
          <span>{totalCount} soalan ditemui</span>
          <span>Senarai memaparkan maksimum 50 soalan terkini. Gunakan carian untuk tapis bank besar.</span>
        </div>
      </section>

      <section className="grid gap-4">
        {questions.map((question) => {
          const archived = Boolean(question.archived_at);
          return (
            <article key={question.id} className="rounded-2xl bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase text-ocean-700">
                    Bahagian {question.section} / {question.category ?? "Umum"} / {question.topic ?? "Topik bebas"} / {question.difficulty}
                  </p>
                  <h2 className="mt-2 line-clamp-3 text-base font-black leading-6 text-slate-950">{question.question_text}</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span>Source: {question.source_title ?? "Manual"}</span>
                    <span>Jenis: {question.question_type === "essay" ? "Esei" : "Objektif"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-lg px-3 py-2 text-xs font-black ${questionStatusTone(question)}`}>{questionStatusLabel(question)}</span>
                  <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600" onClick={() => setSelectedQuestion(question)}>
                    <Eye size={14} aria-hidden="true" />
                    View
                  </button>
                  <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600" onClick={() => setEditingQuestion(question)}>
                    <PenLine size={14} aria-hidden="true" />
                    Edit
                  </button>
                  {archived ? (
                    <button
                      type="button"
                      className="rounded-lg bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-600"
                      onClick={() => runStatusAction(() => updateQuestionStatus(question.id, true, false), "Soalan dipulihkan dan diaktifkan semula.")}
                    >
                      Pulihkan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                      onClick={() => runStatusAction(() => updateQuestionStatus(question.id, !question.is_active, false), question.is_active ? "Soalan dinyahaktifkan." : "Soalan diaktifkan.")}
                    >
                      {question.is_active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg bg-coral-50 px-3 py-2 text-xs font-black text-coral-600"
                    onClick={() => {
                      if (window.confirm("Archive soalan ini? Soalan tidak akan keluar dalam simulasi selepas diarkibkan.")) {
                        runStatusAction(() => updateQuestionStatus(question.id, false, true), "Soalan diarkibkan.");
                      }
                    }}
                    disabled={archived}
                  >
                    Archive
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {questions.length === 0 ? <EmptyAdminPanel title="Tiada soalan ditemui" text="Cuba ubah filter atau import PDF/CSV baharu." /> : null}
      </section>

      {manualOpen ? <ManualQuestionModal onClose={() => setManualOpen(false)} onCreated={loadQuestions} onMessage={onMessage} /> : null}
      {csvOpen ? (
        <CsvImportModal
          onClose={() => setCsvOpen(false)}
          onImported={async (importId) => {
            await loadQuestions();
            navigateAdminRoute("/admin/questions/import", `?id=${importId}`);
          }}
          onMessage={onMessage}
        />
      ) : null}
      {selectedQuestion ? <QuestionViewModal question={selectedQuestion} onClose={() => setSelectedQuestion(null)} /> : null}
      {editingQuestion ? <QuestionEditModal question={editingQuestion} onClose={() => setEditingQuestion(null)} onSaved={loadQuestions} onMessage={onMessage} /> : null}
    </AdminShell>
  );
}

function CsvImportModal({
  onClose,
  onImported,
  onMessage,
}: {
  onClose: () => void;
  onImported: (importId: string) => Promise<void> | void;
  onMessage: (message: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");

  async function handleImageUpload(nextFile: File | null) {
    if (!nextFile) {
      return;
    }

    setUploadingImage(true);
    onMessage(null);
    try {
      const publicUrl = await uploadQuestionImage(nextFile);
      setUploadedImageUrl(publicUrl);
      onMessage("Gambar berjaya dimuat naik. URL boleh digunakan dalam template CSV.");
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      onMessage("Pilih fail CSV dahulu.");
      return;
    }

    setBusy(true);
    onMessage(null);
    try {
      const csvText = await file.text();
      const records = parseCsvRecords(csvText);
      const questions = records.map((record, index) => csvRecordToManualQuestion(record, index + 2));
      const importId = await createCsvQuestionImport(file.name, sourceTitle, questions);

      await onImported(importId);
      onMessage(`${questions.length} soalan CSV disimpan sebagai draft review. Semak, approve, kemudian Publish Approved.`);
      onClose();
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyUploadedUrl() {
    if (!uploadedImageUrl) {
      return;
    }
    await navigator.clipboard.writeText(uploadedImageUrl);
    onMessage("URL gambar disalin.");
  }

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <form className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-soft" onSubmit={handleImport}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Import CSV</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Muat turun template, isi soalan, kemudian upload semula. CSV akan masuk draft review dahulu, bukan terus aktif.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <section className="rounded-2xl border border-ocean-100 bg-ocean-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-ocean-900">Template CSV</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Kolum gambar menggunakan URL. Untuk soalan bergambar, upload gambar dahulu dan letakkan URL dalam `question_image_url`.</p>
              </div>
              <button type="button" className="secondary-button bg-white" onClick={downloadCsvTemplate}>
                <Download size={18} aria-hidden="true" />
                Download Template
              </button>
            </div>
          </section>

          <section className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-slate-700">
              <ImageIcon size={18} aria-hidden="true" />
              Upload gambar untuk CSV
            </div>
            <input className="field bg-white" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null)} />
            {uploadingImage ? <p className="text-sm font-bold text-ocean-700">Memuat naik gambar...</p> : null}
            {uploadedImageUrl ? (
              <div className="grid gap-3">
                <img src={uploadedImageUrl} alt="" className="max-h-56 rounded-xl border border-slate-200 bg-white object-contain p-2" />
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input className="field bg-white" value={uploadedImageUrl} readOnly />
                  <button type="button" className="secondary-button bg-white" onClick={copyUploadedUrl}>
                    Salin URL
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <Label text="Fail CSV">
            <input className="field" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
          </Label>
          <Label text="Nama sumber">
            <input className="field" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder={file?.name.replace(/\.(csv|xlsx?)$/i, "") ?? "Contoh: Set Soalan PKSK 2027"} />
          </Label>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            Bahagian A dan B ialah objektif. Bahagian C boleh diisi sebagai `essay`. Selepas upload, semak draft di halaman review dan klik Publish Approved sahaja bila sudah yakin.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="secondary-button" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              <FileSpreadsheet size={18} aria-hidden="true" />
              {busy ? "Menyediakan draft..." : "Simpan sebagai Draft Review"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function AdminQuestionImportPage({ onMessage }: { onMessage: (message: string | null) => void }) {
  const [importRow, setImportRow] = useState<QuestionImportRow | null>(null);
  const [drafts, setDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const importId = new URLSearchParams(window.location.search).get("id");

  const loadImport = useCallback(async () => {
    if (!importId) {
      setImportRow(null);
      setDrafts([]);
      return;
    }

    try {
      const [nextImport, nextDrafts] = await Promise.all([fetchQuestionImport(importId), fetchImportDrafts(importId)]);
      setImportRow(nextImport);
      setDrafts(nextDrafts);
      setSelectedDraftIds([]);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [importId, onMessage]);

  useEffect(() => {
    loadImport();
  }, [loadImport]);

  useEffect(() => {
    if (importRow?.status !== "processing") {
      return;
    }

    const interval = window.setInterval(() => {
      loadImport();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [importRow?.status, loadImport]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      onMessage("Pilih fail PDF dahulu.");
      return;
    }

    setBusyAction(true);
    onMessage(null);
    try {
      const nextImportId = await createPdfQuestionImport(file, sourceTitle);
      navigateAdminRoute("/admin/questions/import", `?id=${nextImportId}`);
      onMessage("PDF berjaya dimuat naik. Teruskan dengan proses ekstrak.");
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(false);
    }
  }

  async function runImportAction(action: () => Promise<string | null | undefined | void>, successMessage: string): Promise<boolean> {
    setBusyAction(true);
    onMessage(null);
    try {
      const actionMessage = await action();
      await loadImport();
      onMessage(actionMessage || successMessage);
      return true;
    } catch (error) {
      onMessage(toMessage(error));
      return false;
    } finally {
      setBusyAction(false);
    }
  }

  const highConfidenceIds = drafts.filter((draft) => !draft.imported_question_id && confidenceLevel(draft.confidence) === "High").map((draft) => draft.id);
  const approvedCount = drafts.filter((draft) => draft.review_status === "approved" && !draft.imported_question_id).length;
  const pendingCount = drafts.filter((draft) => draft.review_status === "pending" && !draft.imported_question_id).length;
  const reviewCount = drafts.filter((draft) => draft.review_status === "needs_review" && !draft.imported_question_id).length;
  const rejectedCount = drafts.filter((draft) => draft.review_status === "rejected" && !draft.imported_question_id).length;
  const importedCount = drafts.filter((draft) => draft.imported_question_id).length;
  const isCsvImport = importRow ? isCsvQuestionImport(importRow) : false;

  return (
    <AdminShell title="Import Review" text="Upload PDF atau CSV, semak draft, kemudian publish soalan yang sudah approved.">
      {!importRow ? (
        <section className="rounded-2xl bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
              <FileUp size={24} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-black">Step 1: Upload PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Pilih PDF yang ada teks sebenar. PDF scan/gambar perlukan semakan manual atau OCR/AI selepas diberi kebenaran.</p>
            </div>
          </div>
          <form className="grid gap-4" onSubmit={handleUpload}>
            <Label text="Fail PDF">
              <input className="field h-auto py-3" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
            </Label>
            <Label text="Nama sumber">
              <input className="field" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Contoh: Tips PKSK 2026" />
            </Label>
            <button type="submit" className="primary-button w-full sm:w-auto" disabled={busyAction}>
              {busyAction ? "Memuat naik..." : "Upload PDF"}
            </button>
          </form>
        </section>
      ) : (
        <div className="space-y-6">
          <ImportStatusPanel importRow={importRow} />
          <section className="rounded-2xl bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black">Workflow Import</h2>
                <p className="mt-1 text-sm text-slate-500">{importRow.file_name}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">{drafts.length} draft</span>
                  <span className="rounded-lg bg-ocean-50 px-3 py-2 text-ocean-700">{pendingCount} pending</span>
                  <span className="rounded-lg bg-sun-50 px-3 py-2 text-amber-700">{reviewCount} perlu semak</span>
                  <span className="rounded-lg bg-coral-50 px-3 py-2 text-coral-600">{rejectedCount} ditolak</span>
                  <span className="rounded-lg bg-leaf-50 px-3 py-2 text-leaf-600">{importedCount} imported</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyAction || importRow.status === "processing" || isCsvImport}
                  onClick={() =>
                    runImportAction(async () => {
                      const result = await processPdfImport(importRow.id);
                      return result.warning || `${result.detected} draft soalan berjaya diekstrak.`;
                    }, "Ekstrak PDF selesai. Semak draft yang terhasil.")
                  }
                >
                  {isCsvImport ? "CSV Draft Siap" : importRow.status === "processing" ? "Sedang Ekstrak..." : "Ekstrak Soalan"}
                </button>
                <button type="button" className="secondary-button" disabled={busyAction || highConfidenceIds.length === 0} onClick={() => runImportAction(() => setImportDraftStatus(highConfidenceIds, "approved"), "Semua draft high confidence diluluskan.")}>
                  Approve Draft Yakin
                </button>
                <button type="button" className="secondary-button" disabled={busyAction || selectedDraftIds.length === 0} onClick={() => runImportAction(() => setImportDraftStatus(selectedDraftIds, "approved"), "Draft terpilih diluluskan.")}>
                  Approve Selected
                </button>
                <button type="button" className="secondary-button" disabled={busyAction || selectedDraftIds.length === 0} onClick={() => runImportAction(() => setImportDraftStatus(selectedDraftIds, "rejected"), "Draft terpilih ditolak.")}>
                  Reject Selected
                </button>
                <button type="button" className="primary-button" disabled={busyAction || approvedCount === 0} onClick={() => runImportAction(async () => {
                  const count = await importApprovedQuestions(importRow.id);
                  onMessage(`${count} soalan dimasukkan ke bank soalan.`);
                }, "Import approved selesai.")}>
                  Publish Approved
                </button>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
              {isCsvImport
                ? "Flow CSV: soalan sudah berada dalam draft review. Semak kandungan, approve draft yang betul, kemudian Publish Approved. Draft belum approve tidak akan masuk simulasi."
                : "Flow PDF: upload PDF, klik Ekstrak Soalan, semak draft, approve draft yang betul, kemudian Publish Approved. Draft belum approve tidak akan masuk simulasi."}
            </div>
          </section>
          <section className="grid gap-4">
            {drafts.map((draft) => (
              <DraftReviewCard
                key={draft.id}
                draft={draft}
                selected={selectedDraftIds.includes(draft.id)}
                onSelect={(checked) =>
                  setSelectedDraftIds((current) => (checked ? current.concat(draft.id) : current.filter((item) => item !== draft.id)))
                }
                onSave={(nextDraft) => runImportAction(() => updateImportDraft(nextDraft), "Draft dikemaskini.")}
                onStatus={(nextStatus) => runImportAction(() => setImportDraftStatus([draft.id], nextStatus), "Status draft dikemaskini.")}
              />
            ))}
            {drafts.length === 0 ? <EmptyAdminPanel title="Belum ada draft" text="Klik Ekstrak Soalan selepas upload. Draft akan muncul di sini untuk disemak." /> : null}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function AdminImportHistoryPage({ onMessage }: { onMessage: (message: string | null) => void }) {
  const [imports, setImports] = useState<QuestionImportRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<QuestionImportStatus | "all">("all");

  const loadImports = useCallback(async () => {
    try {
      setImports(await fetchQuestionImports(statusFilter));
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [onMessage, statusFilter]);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  return (
    <AdminShell title="Import History" text="Buka semula PDF atau CSV yang pernah diimport dan teruskan semakan draft.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-[220px_auto]">
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as QuestionImportStatus | "all")}>
            <option value="all">Semua status</option>
            <option value="uploaded">Uploaded</option>
            <option value="processing">Processing</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <button type="button" className="secondary-button" onClick={loadImports}>
            Refresh
          </button>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                {["File", "Date", "Admin", "Detected", "Imported", "Status", "Action"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-bold text-slate-900">{item.source_title || item.file_name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(item.created_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{item.uploaded_by_name ?? "Admin"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.total_detected}</td>
                  <td className="px-4 py-3 text-slate-600">{item.total_imported}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-3 py-2 text-xs font-black ${importStatusTone(item.status)}`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="rounded-lg bg-ocean-50 px-3 py-2 text-xs font-black text-ocean-700" onClick={() => navigateAdminRoute("/admin/questions/import", `?id=${item.id}`)}>
                      Buka
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function ManualQuestionModal({
  onClose,
  onCreated,
  onMessage,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onMessage: (message: string | null) => void;
}) {
  const [questionType, setQuestionType] = useState<QuestionType>("objective");
  const [section, setSection] = useState<PkskSectionCode>("B");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>("medium");
  const [questionText, setQuestionText] = useState("");
  const [questionImageUrl, setQuestionImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [correctLabel, setCorrectLabel] = useState("A");
  const [options, setOptions] = useState(() => defaultDraftOptions());
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  function fillSuggestedMetadata() {
    if (section === "A") {
      setCategory("EQ");
      setTopic("Kecerdasan Insaniah");
    } else if (section === "C") {
      setCategory("Penulisan");
      setTopic("Artikulasi Penulisan");
      setQuestionType("essay");
    } else {
      setCategory("IQ");
      setTopic("Kecerdasan Intelek");
    }
    setDifficulty("medium");
    onMessage("Cadangan metadata awal diisi. OCR/AI server-side boleh ditambah kemudian selepas tuan beri kebenaran untuk memproses PDF melalui provider luar.");
  }

  async function handleQuestionImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    setUploadingImage(true);
    onMessage(null);
    try {
      const publicUrl = await uploadQuestionImage(file);
      setQuestionImageUrl(publicUrl);
      onMessage("Gambar soalan berjaya dimuat naik.");
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionText.trim()) {
      onMessage("Masukkan teks soalan dahulu.");
      return;
    }

    const payload: ManualQuestionInput = {
      question_type: questionType,
      section,
      question_text: questionText,
      category: category || null,
      topic: topic || null,
      difficulty,
      question_image_url: questionImageUrl.trim() || null,
      correct_option_label: questionType === "objective" ? correctLabel : null,
      options:
        questionType === "objective"
          ? options.map((option, index) => ({
              ...option,
              is_correct: option.option_label === correctLabel,
              sort_order: index + 1,
            }))
          : [],
    };

    setBusy(true);
    onMessage(null);
    try {
      await createManualQuestion(payload);
      await onCreated();
      onMessage("Soalan manual berjaya ditambah.");
      onClose();
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <form className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-soft" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Tambah Soalan</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Borang ringkas sahaja. Metadata boleh kosong jika tidak perlu.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Label text="Jenis">
              <select className="field" value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)}>
                <option value="objective">Objektif</option>
                <option value="essay">Esei</option>
              </select>
            </Label>
            <Label text="Bahagian">
              <select className="field" value={section} onChange={(event) => setSection(event.target.value as PkskSectionCode)}>
                <option value="A">Bahagian A</option>
                <option value="B">Bahagian B</option>
                <option value="C">Bahagian C</option>
              </select>
            </Label>
            <Label text="Aras">
              <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </Label>
          </div>
          <Label text="Soalan">
            <textarea
              className="field"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              onPaste={(event) => handleQuestionImagePaste(event, setQuestionImageUrl, setUploadingImage, onMessage)}
              placeholder="Tulis soalan di sini"
              required
            />
          </Label>
          <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <Label text="Gambar soalan">
              <input className="field bg-white" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleQuestionImageUpload(event.target.files?.[0] ?? null)} />
            </Label>
            <p className="text-sm font-semibold leading-6 text-slate-500">Tip: boleh paste screenshot terus dalam ruang soalan di atas.</p>
            <Label text="URL gambar soalan">
              <input className="field bg-white" value={questionImageUrl} onChange={(event) => setQuestionImageUrl(event.target.value)} placeholder="Kosongkan jika tiada gambar" />
            </Label>
            {uploadingImage ? <p className="text-sm font-bold text-ocean-700">Memuat naik gambar...</p> : null}
            {questionImageUrl ? <img src={questionImageUrl} alt="" className="max-h-64 rounded-xl border border-slate-200 bg-white object-contain p-2" /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Kategori">
              <input className="field" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Optional" />
            </Label>
            <Label text="Topik">
              <input className="field" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Optional" />
            </Label>
          </div>
          {questionType === "objective" ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-700">Pilihan Jawapan</h3>
                <select className="field max-w-[180px]" value={correctLabel} onChange={(event) => setCorrectLabel(event.target.value)}>
                  {optionLabels.map((label) => (
                    <option key={label} value={label}>
                      Jawapan {label}
                    </option>
                  ))}
                </select>
              </div>
              {options.map((option, index) => (
                <div key={option.option_label ?? index} className="grid gap-2 sm:grid-cols-[64px_1fr]">
                  <span className="grid h-12 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-600">{option.option_label}</span>
                  <input
                    className="field"
                    value={option.option_text ?? ""}
                    onChange={(event) =>
                      setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, option_text: event.target.value } : item)))
                    }
                    placeholder={`Pilihan ${option.option_label}`}
                    required
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <button type="button" className="secondary-button" onClick={fillSuggestedMetadata}>
              <Sparkles size={18} aria-hidden="true" />
              Auto classify
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan Soalan"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function QuestionEditModal({
  question,
  onClose,
  onSaved,
  onMessage,
}: {
  question: AdminQuestionRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onMessage: (message: string | null) => void;
}) {
  const [detail, setDetail] = useState<AdminQuestionDetail | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>(question.question_type);
  const [section, setSection] = useState<PkskSectionCode>(question.section);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(question.difficulty);
  const [questionText, setQuestionText] = useState(question.question_text);
  const [category, setCategory] = useState(question.category ?? "");
  const [topic, setTopic] = useState(question.topic ?? "");
  const [imageUrl, setImageUrl] = useState(question.question_image_url ?? "");
  const [explanation, setExplanation] = useState("");
  const [correctLabel, setCorrectLabel] = useState("A");
  const [options, setOptions] = useState<DraftOption[]>(() => defaultDraftOptions());
  const [essayMinWords, setEssayMinWords] = useState("100");
  const [essayTimeLimit, setEssayTimeLimit] = useState("45");
  const [isActive, setIsActive] = useState(question.is_active);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadDetail() {
      setLoading(true);
      onMessage(null);
      try {
        const nextDetail = await fetchAdminQuestionDetail(question.id);
        if (!alive) {
          return;
        }

        const nextOptions = nextDetail.options.length > 0 ? nextDetail.options : defaultDraftOptions();
        setDetail(nextDetail);
        setQuestionType(nextDetail.question_type);
        setSection(nextDetail.section);
        setDifficulty(nextDetail.difficulty);
        setQuestionText(nextDetail.question_text);
        setCategory(nextDetail.category ?? "");
        setTopic(nextDetail.topic ?? "");
        setImageUrl(nextDetail.question_image_url ?? "");
        setExplanation(nextDetail.explanation ?? "");
        setOptions(nextOptions);
        setCorrectLabel(nextDetail.correct_option_label ?? nextOptions.find((option) => option.is_correct)?.option_label ?? "A");
        setEssayMinWords(String(nextDetail.essay_min_words ?? 100));
        setEssayTimeLimit(String(nextDetail.essay_time_limit ?? 45));
        setIsActive(nextDetail.is_active);
      } catch (error) {
        onMessage(toMessage(error));
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      alive = false;
    };
  }, [onMessage, question.id]);

  function updateOption(index: number, patch: Partial<DraftOption>) {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)));
  }

  function addOption() {
    const nextIndex = options.length;
    const nextLabel = optionLabels[nextIndex] ?? String.fromCharCode(65 + nextIndex);
    setOptions((current) => [
      ...current,
      {
        option_label: nextLabel,
        option_text: "",
        option_image_url: null,
        is_correct: false,
        sort_order: current.length + 1,
      },
    ]);
  }

  function removeOption(index: number) {
    setOptions((current) => {
      const nextOptions = current.filter((_, optionIndex) => optionIndex !== index);
      if (current[index]?.option_label === correctLabel) {
        setCorrectLabel(nextOptions[0]?.option_label ?? "A");
      }
      return nextOptions.map((option, optionIndex) => ({ ...option, sort_order: optionIndex + 1 }));
    });
  }

  async function handleQuestionImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    setUploadingImage(true);
    onMessage(null);
    try {
      const publicUrl = await uploadQuestionImage(file);
      setImageUrl(publicUrl);
      onMessage("Gambar soalan berjaya dimuat naik.");
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionText.trim()) {
      onMessage("Masukkan teks soalan dahulu.");
      return;
    }

    const cleanedOptions = options
      .map((option, index) => ({
        ...option,
        option_label: option.option_label || (optionLabels[index] ?? String.fromCharCode(65 + index)),
        option_text: option.option_text?.trim() || null,
        option_image_url: option.option_image_url?.trim() || null,
        is_correct: (option.option_label || (optionLabels[index] ?? String.fromCharCode(65 + index))) === correctLabel,
        sort_order: index + 1,
      }))
      .filter((option) => option.option_text || option.option_image_url);

    if (questionType === "objective" && cleanedOptions.length < 2) {
      onMessage("Soalan objektif perlukan sekurang-kurangnya dua pilihan jawapan.");
      return;
    }

    if (questionType === "objective" && !cleanedOptions.some((option) => option.is_correct)) {
      onMessage("Pilih satu jawapan betul dahulu.");
      return;
    }

    const payload: ManualQuestionInput & { id: string; is_active: boolean } = {
      id: question.id,
      question_type: questionType,
      section,
      question_text: questionText.trim(),
      category: category.trim() || null,
      topic: topic.trim() || null,
      difficulty,
      question_image_url: imageUrl.trim() || null,
      explanation: explanation.trim() || null,
      is_active: isActive,
      correct_option_label: questionType === "objective" ? correctLabel : null,
      essay_min_words: questionType === "essay" ? Number(essayMinWords) || 100 : null,
      essay_time_limit: questionType === "essay" ? Number(essayTimeLimit) || 45 : null,
      options: questionType === "objective" ? cleanedOptions : [],
    };

    setSaving(true);
    onMessage(null);
    try {
      await updateQuestion(payload);
      await onSaved();
      onMessage("Soalan berjaya dikemas kini.");
      onClose();
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <form className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-soft" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-ocean-700">{detail?.source_title ?? question.source_title ?? "Manual"}</p>
            <h2 className="mt-1 text-2xl font-black">Edit Soalan</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Kemaskan soalan, pilihan jawapan dan status tanpa perlu import semula.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">Memuatkan detail soalan...</div>
        ) : (
          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Label text="Jenis">
                <select className="field" value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)}>
                  <option value="objective">Objektif</option>
                  <option value="essay">Esei</option>
                </select>
              </Label>
              <Label text="Bahagian">
                <select className="field" value={section} onChange={(event) => setSection(event.target.value as PkskSectionCode)}>
                  <option value="A">Bahagian A</option>
                  <option value="B">Bahagian B</option>
                  <option value="C">Bahagian C</option>
                </select>
              </Label>
              <Label text="Aras">
                <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </Label>
              <Label text="Status">
                <select className="field" value={isActive ? "active" : "inactive"} onChange={(event) => setIsActive(event.target.value === "active")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Label>
            </div>

            <Label text="Soalan">
              <textarea
                className="field min-h-32"
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
                onPaste={(event) => handleQuestionImagePaste(event, setImageUrl, setUploadingImage, onMessage)}
                required
              />
            </Label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Label text="Kategori">
                <input className="field" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Contoh: SSQ, Bahasa Melayu, Penulisan" />
              </Label>
              <Label text="Topik">
                <input className="field" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Contoh: Kerjasama, Matematik" />
              </Label>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <Label text="Gambar soalan">
                <input className="field bg-white" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleQuestionImageUpload(event.target.files?.[0] ?? null)} />
              </Label>
              <p className="text-sm font-semibold leading-6 text-slate-500">Tip: boleh paste screenshot terus dalam ruang soalan di atas.</p>
              <Label text="URL gambar soalan">
                <input className="field bg-white" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Kosongkan jika tiada gambar" />
              </Label>
              {uploadingImage ? <p className="text-sm font-bold text-ocean-700">Memuat naik gambar...</p> : null}
              {imageUrl ? <img src={imageUrl} alt="" className="max-h-64 rounded-xl border border-slate-200 bg-white object-contain p-2" /> : null}
            </div>

            {questionType === "objective" ? (
              <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-black text-slate-700">Pilihan Jawapan</h3>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select className="field max-w-[180px]" value={correctLabel} onChange={(event) => setCorrectLabel(event.target.value)}>
                      {options.map((option, index) => {
                        const label = option.option_label || optionLabels[index] || String.fromCharCode(65 + index);
                        return (
                          <option key={label} value={label}>
                            Jawapan {label}
                          </option>
                        );
                      })}
                    </select>
                    <button type="button" className="secondary-button" onClick={addOption}>
                      <Plus size={18} aria-hidden="true" />
                      Tambah Pilihan
                    </button>
                  </div>
                </div>
                {options.map((option, index) => {
                  const label = option.option_label || optionLabels[index] || String.fromCharCode(65 + index);
                  return (
                    <div key={`${label}-${index}`} className="grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-[64px_1fr_auto]">
                      <input className="field text-center font-black" value={label} onChange={(event) => updateOption(index, { option_label: event.target.value.toUpperCase() })} />
                      <input className="field" value={option.option_text ?? ""} onChange={(event) => updateOption(index, { option_text: event.target.value })} placeholder={`Pilihan ${label}`} />
                      <button type="button" className="secondary-button" onClick={() => removeOption(index)} disabled={options.length <= 2}>
                        Buang
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2">
                <Label text="Minimum patah perkataan">
                  <input className="field" type="number" min={1} value={essayMinWords} onChange={(event) => setEssayMinWords(event.target.value)} />
                </Label>
                <Label text="Masa menulis (minit)">
                  <input className="field" type="number" min={1} value={essayTimeLimit} onChange={(event) => setEssayTimeLimit(event.target.value)} />
                </Label>
              </div>
            )}

            <Label text="Nota jawapan / explanation">
              <textarea className="field" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Optional" />
            </Label>

            {detail?.assets.length ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                {detail.assets.map((asset) => (
                  <a key={asset.id} href={asset.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">
                    <ImageIcon size={15} aria-hidden="true" />
                    {asset.asset_type}
                  </a>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="secondary-button" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Save size={18} aria-hidden="true" />
                {saving ? "Menyimpan..." : "Simpan Edit"}
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}

function QuestionViewModal({ question, onClose }: { question: AdminQuestionRow; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadDetail() {
      try {
        const nextDetail = await fetchAdminQuestionDetail(question.id);
        if (alive) {
          setDetail(nextDetail);
        }
      } catch {
        if (alive) {
          setDetail(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      alive = false;
    };
  }, [question.id]);

  const viewQuestion = detail ?? question;

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-ocean-700">
              Bahagian {viewQuestion.section} / {viewQuestion.category ?? "Umum"} / {viewQuestion.difficulty}
            </p>
            <h2 className="mt-2 text-2xl font-black">Soalan</h2>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {loading ? <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Memuatkan detail soalan...</div> : null}
        {viewQuestion.question_image_url ? <img src={viewQuestion.question_image_url} alt="" className="mt-5 max-h-80 rounded-xl border border-slate-200 object-contain" /> : null}
        <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-800">{viewQuestion.question_text}</p>
        {detail?.options.length ? (
          <div className="mt-5 grid gap-2">
            {detail.options.map((option) => (
              <div key={option.id ?? option.option_label ?? option.sort_order} className={`rounded-xl border px-4 py-3 text-sm font-bold ${option.is_correct ? "border-leaf-200 bg-leaf-50 text-leaf-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                <span className="mr-2 font-black">{option.option_label}.</span>
                {option.option_text}
                {option.is_correct ? <span className="ml-2 rounded-lg bg-leaf-100 px-2 py-1 text-[11px] font-black text-leaf-700">Jawapan betul</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {detail?.explanation ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-500">Explanation</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{detail.explanation}</p>
          </div>
        ) : null}
        <div className="mt-5 grid gap-2 text-sm text-slate-600">
          <SummaryRow label="Source" value={viewQuestion.source_title ?? "Manual"} />
          <SummaryRow label="Status" value={questionStatusLabel(viewQuestion)} />
          <SummaryRow label="Topik" value={viewQuestion.topic ?? "-"} />
          {detail?.question_type === "essay" ? <SummaryRow label="Karangan" value={`${detail.essay_min_words ?? 100} patah perkataan minimum / ${detail.essay_time_limit ?? 45} minit`} /> : null}
        </div>
      </div>
    </section>
  );
}

function ImportStatusPanel({ importRow }: { importRow: QuestionImportRow }) {
  const steps = [
    ["uploaded", "Uploading"],
    ["processing", importRow.processing_stage ?? "Processing"],
    ["review", "Ready for review"],
    ["completed", "Completed"],
  ];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black">{importRow.source_title || importRow.file_name}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Detected: {importRow.total_detected} / Imported: {importRow.total_imported}
          </p>
        </div>
        <span className={`rounded-xl px-4 py-2 text-sm font-black ${importStatusTone(importRow.status)}`}>{importRow.status}</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {steps.map(([key, label]) => (
          <div key={key} className={`rounded-xl border px-4 py-3 text-sm font-bold ${importStepActive(importRow.status, key) ? "border-ocean-200 bg-ocean-50 text-ocean-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            {label}
          </div>
        ))}
      </div>
      {importRow.processing_error ? <p className="mt-4 rounded-xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-600">{importRow.processing_error}</p> : null}
    </section>
  );
}

function DraftReviewCard({
  draft,
  selected,
  onSelect,
  onSave,
  onStatus,
}: {
  draft: ImportedQuestionDraft;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onSave: (draft: ImportedQuestionDraft) => Promise<boolean>;
  onStatus: (status: DraftReviewStatus) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [localDraft, setLocalDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  const confidence = confidenceLevel(localDraft.confidence);
  const editableOptionLabels = localDraft.options.map((option, index) => normalizeDraftOptionLabel(option, index)).filter(Boolean);

  function updateOption(index: number, value: string) {
    setLocalDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, option_text: value } : option)),
    }));
  }

  function updateCorrectLabel(label: string) {
    const nextLabel = label.trim().toUpperCase() || null;
    setLocalDraft((current) => ({
      ...current,
      correct_option_label: nextLabel,
      options: current.options.map((option, index) => {
        const optionLabel = normalizeDraftOptionLabel(option, index);
        return {
          ...option,
          option_label: optionLabel,
          is_correct: nextLabel ? optionLabel === nextLabel : false,
        };
      }),
    }));
  }

  async function handleSaveDraft() {
    const nextDraft = buildDraftSavePayload(localDraft);
    if (!nextDraft.question_text.trim()) {
      setSaveError("Soalan perlu diisi sebelum simpan.");
      return;
    }

    if (
      nextDraft.question_type === "objective" &&
      nextDraft.correct_option_label &&
      !nextDraft.options.some((option) => option.option_label === nextDraft.correct_option_label)
    ) {
      setSaveError("Jawapan mesti padan dengan label pilihan yang wujud.");
      return;
    }

    setSaving(true);
    setSaveNotice(null);
    setSaveError(null);
    try {
      const saved = await onSave(nextDraft);
      if (saved) {
        setLocalDraft(nextDraft);
        setSaveNotice("Disimpan");
        setEditing(false);
      } else {
        setSaveError("Simpan gagal. Semak mesej sistem di atas dan cuba lagi.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-ocean-600" checked={selected} onChange={(event) => onSelect(event.target.checked)} disabled={Boolean(draft.imported_question_id)} />
          <div>
            <p className="text-sm font-black text-ocean-700">Soalan {localDraft.source_question_number ?? "-"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-lg px-3 py-1 text-xs font-black ${confidenceTone(confidence)}`}>{confidence} confidence</span>
              <span className={`rounded-lg px-3 py-1 text-xs font-black ${draftStatusTone(localDraft.review_status)}`}>{draftStatusLabel(localDraft.review_status)}</span>
              {saving ? <span className="rounded-lg bg-ocean-50 px-3 py-1 text-xs font-black text-ocean-700">Menyimpan...</span> : null}
              {saveNotice ? <span className="rounded-lg bg-leaf-50 px-3 py-1 text-xs font-black text-leaf-600">{saveNotice}</span> : null}
              {draft.imported_question_id ? <span className="rounded-lg bg-leaf-50 px-3 py-1 text-xs font-black text-leaf-600">Imported</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-600" onClick={() => onStatus("approved")} disabled={Boolean(draft.imported_question_id)}>
            Approve
          </button>
          <button type="button" className="rounded-lg bg-sun-50 px-3 py-2 text-xs font-black text-amber-700" onClick={() => onStatus("needs_review")} disabled={Boolean(draft.imported_question_id)}>
            Mark Review
          </button>
          <button type="button" className="rounded-lg bg-coral-50 px-3 py-2 text-xs font-black text-coral-600" onClick={() => onStatus("rejected")} disabled={Boolean(draft.imported_question_id)}>
            Reject
          </button>
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600" onClick={() => setEditing((current) => !current)}>
            {editing ? "Close Edit" : "Edit"}
          </button>
        </div>
      </div>

      {localDraft.question_image_url ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <img src={localDraft.question_image_url} alt="" className="max-h-80 rounded-lg object-contain" />
        </div>
      ) : localDraft.assets.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {localDraft.assets.map((asset) => (
            <a key={asset.id} href={asset.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              <ImageIcon size={15} aria-hidden="true" />
              {asset.asset_type}
            </a>
          ))}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-5 grid gap-4 rounded-2xl border border-ocean-100 bg-ocean-50/40 p-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Label text="No.">
              <input className="field" value={localDraft.source_question_number ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, source_question_number: event.target.value })} />
            </Label>
            <Label text="Bahagian">
              <select className="field" value={localDraft.section ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, section: (event.target.value || null) as PkskSectionCode | null })}>
                <option value="">Auto</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Label>
            <Label text="Aras">
              <select className="field" value={localDraft.difficulty ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, difficulty: (event.target.value || null) as QuestionDifficulty | null })}>
                <option value="">Auto</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </Label>
            <Label text="Jawapan">
              <select className="field" value={localDraft.correct_option_label ?? ""} onChange={(event) => updateCorrectLabel(event.target.value)}>
                <option value="">Tiada</option>
                {editableOptionLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </Label>
          </div>
          <Label text="Soalan">
            <textarea className="field" value={localDraft.question_text} onChange={(event) => setLocalDraft({ ...localDraft, question_text: event.target.value })} />
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Kategori">
              <input className="field" value={localDraft.category ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, category: event.target.value })} />
            </Label>
            <Label text="Topik">
              <input className="field" value={localDraft.topic ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, topic: event.target.value })} />
            </Label>
          </div>
          <Label text="Nota / explanation">
            <textarea className="field" value={localDraft.explanation ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, explanation: event.target.value })} placeholder="Optional. Contoh: Cadangan AI, sebab jawapan, atau nota semakan." />
          </Label>
          {localDraft.question_type === "objective" ? (
            <div className="grid gap-3">
              {localDraft.options.map((option, index) => (
                <div key={option.id ?? `${option.option_label}-${index}`} className="grid gap-2 sm:grid-cols-[64px_1fr]">
                  <span
                    className={`grid h-12 place-items-center rounded-xl text-sm font-black ${
                      option.is_correct ? "bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100" : "bg-white text-slate-600"
                    }`}
                  >
                    {option.option_label ?? optionLabels[index] ?? index + 1}
                  </span>
                  <input className="field" value={option.option_text ?? ""} onChange={(event) => updateOption(index, event.target.value)} placeholder="Teks pilihan" />
                </div>
              ))}
            </div>
          ) : null}
          {saveError ? <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-bold text-coral-600">{saveError}</p> : null}
          <button type="button" className="primary-button w-full sm:w-auto" onClick={handleSaveDraft} disabled={saving || Boolean(draft.imported_question_id)}>
            {saving ? "Menyimpan..." : "Simpan Edit"}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <p className="whitespace-pre-wrap text-lg font-black leading-7 text-slate-950">{localDraft.question_text}</p>
          {localDraft.options.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {localDraft.options.map((option) => (
                <div key={option.id ?? option.option_label ?? option.sort_order} className={`rounded-xl border px-4 py-3 text-sm font-bold ${option.is_correct ? "border-leaf-200 bg-leaf-50 text-leaf-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  <span className="mr-2 font-black">{option.option_label}.</span>
                  {option.option_text}
                  {option.option_image_url ? <img src={option.option_image_url} alt="" className="mt-3 max-h-40 rounded-lg object-contain" /> : null}
                </div>
              ))}
            </div>
          ) : null}
          {localDraft.explanation ? (
            <div className="mt-4 rounded-xl bg-sun-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
              <span className="font-black">Nota:</span> {localDraft.explanation}
            </div>
          ) : null}
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryRow label="Bahagian" value={localDraft.section ?? "Auto"} />
            <SummaryRow label="Kategori" value={localDraft.category ?? "-"} />
            <SummaryRow label="Topik" value={localDraft.topic ?? "-"} />
            <SummaryRow label="Aras" value={localDraft.difficulty ?? "Auto"} />
          </div>
        </div>
      )}
    </article>
  );
}

function EmptyAdminPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{text}</p>
    </section>
  );
}

const optionLabels = ["A", "B", "C", "D"];

function buildDraftSavePayload(draft: ImportedQuestionDraft): ImportedQuestionDraft {
  const correctLabel = draft.question_type === "objective" ? draft.correct_option_label?.trim().toUpperCase() || null : null;
  const options = draft.options
    .map((option, index) => {
      const optionLabel = normalizeDraftOptionLabel(option, index);
      return {
        ...option,
        option_label: optionLabel,
        option_text: option.option_text?.trim() || null,
        option_image_url: option.option_image_url?.trim() || null,
        is_correct: correctLabel ? optionLabel === correctLabel : Boolean(option.is_correct),
        sort_order: index + 1,
      };
    })
    .filter((option) => option.option_text || option.option_image_url);

  return {
    ...draft,
    question_text: draft.question_text.trim(),
    category: draft.category?.trim() || null,
    topic: draft.topic?.trim() || null,
    explanation: draft.explanation?.trim() || null,
    correct_option_label: correctLabel,
    options,
  };
}

function normalizeDraftOptionLabel(option: DraftOption, index: number): string {
  return (option.option_label || optionLabels[index] || String.fromCharCode(65 + index)).trim().toUpperCase();
}

function defaultDraftOptions() {
  return optionLabels.map((label, index) => ({
    option_label: label,
    option_text: "",
    option_image_url: null,
    is_correct: label === "A",
    sort_order: index + 1,
  }));
}

async function handleQuestionImagePaste(
  event: React.ClipboardEvent<HTMLTextAreaElement>,
  setImageUrl: (imageUrl: string) => void,
  setUploading: (uploading: boolean) => void,
  onMessage: (message: string | null) => void,
) {
  const imageFile = getClipboardImageFile(event.clipboardData);
  if (!imageFile) {
    return;
  }

  event.preventDefault();
  setUploading(true);
  onMessage(null);
  try {
    const publicUrl = await uploadQuestionImage(imageFile);
    setImageUrl(publicUrl);
    onMessage("Gambar daripada clipboard berjaya dimuat naik.");
  } catch (error) {
    onMessage(toMessage(error));
  } finally {
    setUploading(false);
  }
}

function getClipboardImageFile(clipboardData: DataTransfer): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }

  for (const file of Array.from(clipboardData.files)) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
}

const csvTemplateHeaders = [
  "question_type",
  "section",
  "difficulty",
  "category",
  "topic",
  "question_text",
  "question_image_url",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_a_image_url",
  "option_b_image_url",
  "option_c_image_url",
  "option_d_image_url",
  "correct_option_label",
  "explanation",
  "essay_min_words",
  "essay_time_limit",
];

const csvTemplateRows = [
  [
    "objective",
    "A",
    "medium",
    "SSQ",
    "Kecerdasan Insaniah",
    "Guru menegur kamu kerana lewat masuk kelas. Apa reaksi kamu?",
    "",
    "Marah dan merungut",
    "Rasa malu tapi terima teguran",
    "Tidak peduli",
    "Ketawa sahaja",
    "",
    "",
    "",
    "",
    "B",
    "Jawapan menunjukkan murid menerima teguran dengan baik.",
    "",
    "",
  ],
  [
    "objective",
    "B",
    "medium",
    "Matematik",
    "Nombor",
    "Lihat gambar rajah berikut dan pilih jawapan yang betul.",
    "https://contoh.com/gambar-soalan.png",
    "24",
    "36",
    "48",
    "60",
    "",
    "",
    "",
    "",
    "C",
    "",
    "",
    "",
  ],
  [
    "essay",
    "C",
    "medium",
    "Penulisan",
    "Kesihatan diri",
    "Kesihatan diri perlu dijaga sejak kecil. Huraikan langkah-langkah menjaga kesihatan fizikal dan mental sebagai seorang murid.",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "100",
    "45",
  ],
];

function downloadCsvTemplate() {
  const csvText = [csvTemplateHeaders, ...csvTemplateRows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "template-import-soalan-pksk.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function parseCsvRecords(csvText: string): Record<string, string>[] {
  const rows = parseCsvRows(csvText).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error("CSV kosong atau tiada baris soalan.");
  }

  const headers = rows[0].map((header) => normalizeCsvHeader(header));
  if (!headers.includes("question_text") || !headers.includes("section")) {
    throw new Error("CSV mesti ada kolum `question_text` dan `section`.");
  }

  return rows.slice(1).map((row) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = row[index]?.trim() ?? "";
      return record;
    }, {}),
  );
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === "\"") {
      if (insideQuotes && nextCharacter === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows;
}

function csvRecordToManualQuestion(record: Record<string, string>, rowNumber: number): ManualQuestionInput {
  const section = parseCsvSection(getCsvValue(record, ["section", "bahagian"]), rowNumber);
  const questionType = parseCsvQuestionType(getCsvValue(record, ["question_type", "jenis"]), section);
  const difficulty = parseCsvDifficulty(getCsvValue(record, ["difficulty", "aras"]));
  const questionText = getCsvValue(record, ["question_text", "soalan"]);

  if (!questionText) {
    throw new Error(`Baris ${rowNumber}: teks soalan kosong.`);
  }

  if (questionType === "essay") {
    return {
      question_type: "essay",
      section,
      question_text: questionText,
      category: getCsvValue(record, ["category", "kategori"]) || null,
      topic: getCsvValue(record, ["topic", "topik"]) || null,
      difficulty,
      question_image_url: getCsvValue(record, ["question_image_url", "gambar_soalan"]) || null,
      explanation: getCsvValue(record, ["explanation", "nota"]) || null,
      essay_min_words: Number(getCsvValue(record, ["essay_min_words", "minimum_patah_perkataan"])) || 100,
      essay_time_limit: Number(getCsvValue(record, ["essay_time_limit", "masa_minit"])) || 45,
      correct_option_label: null,
      options: [],
    };
  }

  const correctLabel = getCsvValue(record, ["correct_option_label", "jawapan_betul"]).toUpperCase() || null;
  if (correctLabel && !optionLabels.includes(correctLabel)) {
    throw new Error(`Baris ${rowNumber}: jawapan betul mesti A, B, C atau D.`);
  }

  const options = optionLabels
    .map((label, index) => ({
      option_label: label,
      option_text: getCsvValue(record, [`option_${label.toLowerCase()}`, `pilihan_${label.toLowerCase()}`, `jawapan_${label.toLowerCase()}`]) || null,
      option_image_url: getCsvValue(record, [`option_${label.toLowerCase()}_image_url`, `gambar_pilihan_${label.toLowerCase()}`]) || null,
      is_correct: correctLabel ? label === correctLabel : false,
      sort_order: index + 1,
    }))
    .filter((option) => option.option_text || option.option_image_url);

  if (options.length < 2) {
    throw new Error(`Baris ${rowNumber}: soalan objektif perlukan sekurang-kurangnya dua pilihan jawapan.`);
  }

  if (correctLabel && !options.some((option) => option.option_label === correctLabel)) {
    throw new Error(`Baris ${rowNumber}: pilihan jawapan betul ${correctLabel} belum diisi.`);
  }

  return {
    question_type: "objective",
    section,
    question_text: questionText,
    category: getCsvValue(record, ["category", "kategori"]) || null,
    topic: getCsvValue(record, ["topic", "topik"]) || null,
    difficulty,
    question_image_url: getCsvValue(record, ["question_image_url", "gambar_soalan"]) || null,
    explanation: getCsvValue(record, ["explanation", "nota"]) || null,
    correct_option_label: correctLabel,
    options,
  };
}

function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function getCsvValue(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalizedKey = normalizeCsvHeader(key);
    const value = record[normalizedKey];
    if (value) {
      return value.trim();
    }
  }
  return "";
}

function parseCsvSection(value: string, rowNumber: number): PkskSectionCode {
  const section = value.trim().toUpperCase();
  if (section === "A" || section === "B" || section === "C") {
    return section;
  }
  throw new Error(`Baris ${rowNumber}: bahagian mesti A, B atau C.`);
}

function parseCsvQuestionType(value: string, section: PkskSectionCode): QuestionType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "essay" || normalized === "esei" || normalized === "karangan") {
    return "essay";
  }
  if (normalized === "objective" || normalized === "objektif" || normalized === "") {
    return section === "C" ? "essay" : "objective";
  }
  return "objective";
}

function parseCsvDifficulty(value: string): QuestionDifficulty {
  const normalized = value.trim().toLowerCase();
  if (normalized === "easy" || normalized === "mudah") {
    return "easy";
  }
  if (normalized === "hard" || normalized === "sukar") {
    return "hard";
  }
  return "medium";
}

function questionStatusLabel(question: AdminQuestionRow): string {
  if (question.archived_at) {
    return "Archived";
  }
  return question.is_active ? "Active" : "Inactive";
}

function questionStatusTone(question: AdminQuestionRow): string {
  if (question.archived_at) {
    return "bg-slate-100 text-slate-500";
  }
  return question.is_active ? "bg-leaf-50 text-leaf-600" : "bg-sun-50 text-amber-700";
}

function importStatusTone(status: QuestionImportStatus): string {
  const tones: Record<QuestionImportStatus, string> = {
    uploaded: "bg-ocean-50 text-ocean-700",
    processing: "bg-sun-50 text-amber-700",
    review: "bg-ocean-50 text-ocean-700",
    completed: "bg-leaf-50 text-leaf-600",
    failed: "bg-coral-50 text-coral-600",
  };
  return tones[status];
}

function draftStatusLabel(status: DraftReviewStatus): string {
  const labels: Record<DraftReviewStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    needs_review: "Needs review",
  };
  return labels[status];
}

function draftStatusTone(status: DraftReviewStatus): string {
  const tones: Record<DraftReviewStatus, string> = {
    pending: "bg-slate-100 text-slate-600",
    approved: "bg-leaf-50 text-leaf-600",
    rejected: "bg-coral-50 text-coral-600",
    needs_review: "bg-sun-50 text-amber-700",
  };
  return tones[status];
}

function paymentStatusLabel(status: PaymentRequest["status"]): string {
  const labels: Record<PaymentRequest["status"], string> = {
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    failed: "Failed",
    cancelled: "Cancelled",
    rejected: "Rejected",
    expired: "Expired",
  };
  return labels[status];
}

function paymentStatusTone(status: PaymentRequest["status"]): string {
  const tones: Record<PaymentRequest["status"], string> = {
    pending: "bg-sun-50 text-amber-700",
    approved: "bg-leaf-50 text-leaf-600",
    paid: "bg-leaf-50 text-leaf-600",
    failed: "bg-coral-50 text-coral-600",
    cancelled: "bg-slate-100 text-slate-500",
    rejected: "bg-coral-50 text-coral-600",
    expired: "bg-slate-100 text-slate-500",
  };
  return tones[status];
}

function diamondStatusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    not_agent: "Rejected",
    pending: "Pending",
    active: "Active",
    suspended: "Suspended",
  };
  return labels[status];
}

function diamondStatusTone(status: AgentStatus): string {
  const tones: Record<AgentStatus, string> = {
    not_agent: "bg-slate-100 text-slate-600",
    pending: "bg-sun-50 text-amber-700",
    active: "bg-leaf-50 text-leaf-600",
    suspended: "bg-coral-50 text-coral-600",
  };
  return tones[status];
}

function commissionStatusLabel(status: AgentCommissionSummary["effective_status"]): string {
  const labels: Record<AgentCommissionSummary["effective_status"], string> = {
    pending_14_days: "Menunggu 14 Hari",
    eligible: "Sedia Dibayar",
    paid: "Sudah Dibayar",
    cancelled: "Cancelled",
  };
  return labels[status];
}

function commissionStatusTone(status: AgentCommissionSummary["effective_status"]): string {
  const tones: Record<AgentCommissionSummary["effective_status"], string> = {
    pending_14_days: "bg-sun-50 text-amber-700",
    eligible: "bg-ocean-50 text-ocean-700",
    paid: "bg-leaf-50 text-leaf-600",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return tones[status];
}

function isCsvQuestionImport(importRow: QuestionImportRow): boolean {
  return importRow.storage_path?.startsWith("csv://") || /\.(csv|xlsx?)$/i.test(importRow.file_name);
}

function paymentMethodLabel(method: string): string {
  if (method === "toyyibpay") {
    return "ToyyibPay";
  }
  if (method === "manual_qr" || method === "manual_whatsapp") {
    return "QR Manual";
  }
  return method || "QR Manual";
}

function confidenceLevel(value: number | null): "High" | "Medium" | "Low" {
  if (value !== null && value >= 0.85) {
    return "High";
  }
  if (value !== null && value >= 0.6) {
    return "Medium";
  }
  return "Low";
}

function confidenceTone(level: "High" | "Medium" | "Low"): string {
  if (level === "High") {
    return "bg-leaf-50 text-leaf-600";
  }
  if (level === "Medium") {
    return "bg-sun-50 text-amber-700";
  }
  return "bg-coral-50 text-coral-600";
}

function importStepActive(currentStatus: QuestionImportStatus, step: string): boolean {
  const order: Record<string, number> = {
    uploaded: 1,
    processing: 2,
    review: 3,
    completed: 4,
    failed: 2,
  };
  return order[currentStatus] >= (order[step] ?? 0);
}

function AdminSubscriptionsPage() {
  return (
    <AdminShell title="Subscriptions" text="Pelan premium untuk akses pengguna. MVP bayaran manual menggunakan plan lifetime.">
      <section className="grid gap-5 md:grid-cols-4">
        {(["monthly", "6_months", "yearly", "lifetime"] as SubscriptionPlan[]).map((plan) => (
          <article key={plan} className="rounded-2xl bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">{plan}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Pelan ini boleh digunakan oleh admin semasa grant atau extend premium.</p>
          </article>
        ))}
      </section>
    </AdminShell>
  );
}

function AdminSettingsPage({ settings }: { settings: AppSettings }) {
  return (
    <AdminShell title="System Settings" text="Tetapan utama aplikasi yang dibaca oleh frontend.">
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryPanel title="Preview Bahagian A" value={`${settings.free_preview_section_a_limit} soalan`} />
        <SummaryPanel title="Preview Bahagian B" value={`${settings.free_preview_section_b_limit} soalan`} />
        <SummaryPanel title="Preview Bahagian C" value={settings.free_preview_section_c_enabled ? "Aktif" : "Tidak aktif"} />
        <SummaryPanel title="Harga Premium" value={formatCurrency(settings.payment_price, settings.payment_currency)} />
        <SummaryPanel title="Akaun Bayaran" value={`${settings.payment_bank_name} / ${settings.payment_account_name}`} />
        <SummaryPanel title="WhatsApp Admin" value={settings.payment_whatsapp_number} />
      </section>
    </AdminShell>
  );
}

function AccessDeniedPage({
  title = "403 Access Denied",
  text = "Halaman ini hanya untuk admin yang diberi kebenaran.",
  buttonLabel = "Kembali",
  buttonRoute = "/",
  onNavigate,
}: {
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonRoute?: AppRoute;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral-50 text-coral-600">
        <LockKeyhole size={26} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-black">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
      <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate(buttonRoute)}>
        {buttonLabel}
      </button>
    </section>
  );
}

function SummaryPanel({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-soft">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </article>
  );
}

function ModePage({
  isLoggedIn,
  busy,
  onStartQuiz,
  onStartEssay,
  onNavigate,
}: {
  isLoggedIn: boolean;
  busy: boolean;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
  onStartEssay: () => void;
  onNavigate: (route: AppRoute) => void;
}) {
  if (!isLoggedIn) {
    return <LockedState title="Log masuk diperlukan" text="Cipta akaun atau log masuk dahulu untuk simpan cubaan dan mata simulasi." onNavigate={onNavigate} />;
  }
  return (
    <div className="space-y-6">
      <PageHeader icon={Target} title="Pilih Simulasi" text="Setiap cubaan akan menyusun soalan dan pilihan jawapan secara rawak." />
      <div className="grid gap-5 lg:grid-cols-3">
        <ModeCard title="Simulasi PKSK Penuh" text="Bahagian A 30 soalan, Bahagian B 70 soalan dalam 90 minit, kemudian Bahagian C." icon={ShieldCheck} disabled={busy} onClick={() => onStartQuiz("full", null, 100)} />
        <ModeCard title="Bahagian A" text="30 soalan Kecerdasan Insaniah. Skor rasmi 20%." icon={HeartHandshake} disabled={busy} onClick={() => onStartQuiz("section", "A", 30)} />
        <ModeCard title="Bahagian B" text="70 soalan objektif Kecerdasan Intelek. Skor rasmi 70%." icon={Brain} disabled={busy} onClick={() => onStartQuiz("section", "B", 70)} />
        <ModeCard title="Bahagian C" text="1 tajuk karangan Bahasa Melayu, minimum 100 patah perkataan dalam 45 minit." icon={PenLine} disabled={busy} onClick={onStartEssay} />
      </div>
    </div>
  );
}

function QuizPage({
  payload,
  result,
  busy,
  onAnswer,
  onSkip,
  onComplete,
  onNavigate,
  onStartEssay,
}: {
  payload: AttemptPayload | null;
  result: CompleteAttemptResult | null;
  busy: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onSkip: (questionId: string) => Promise<boolean>;
  onComplete: () => void;
  onNavigate: (route: AppRoute) => void;
  onStartEssay: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [skippingQuestionId, setSkippingQuestionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() => objectiveRemainingSeconds(payload));
  const objectiveAttemptId = payload?.attempt.id ?? null;
  const objectiveStartedAt = payload?.attempt.started_at ?? null;

  useEffect(() => {
    setIndex(0);
    setSkippingQuestionId(null);
    setRemainingSeconds(objectiveStartedAt ? objectiveRemainingSecondsFromStart(objectiveStartedAt) : 0);
  }, [objectiveAttemptId, objectiveStartedAt]);

  useEffect(() => {
    if (!objectiveStartedAt || result) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds(objectiveRemainingSecondsFromStart(objectiveStartedAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [objectiveStartedAt, result]);

  if (result) {
    return <ResultPanel result={result} onNavigate={onNavigate} onStartEssay={onStartEssay} />;
  }

  if (!payload) {
    return <EmptyState title="Tiada cubaan aktif" text="Mulakan simulasi baharu atau sambung cubaan yang belum selesai." onNavigate={onNavigate} />;
  }

  const orderedQuestions = [...payload.questions].sort((first, second) => {
    const sectionOrder = sectionSortOrder(first.section) - sectionSortOrder(second.section);
    return sectionOrder !== 0 ? sectionOrder : first.question_order - second.question_order;
  });
  const current = orderedQuestions[index] ?? orderedQuestions[0];
  const sectionAQuestions = orderedQuestions.filter((question) => question.section === "A");
  const sectionBQuestions = orderedQuestions.filter((question) => question.section === "B");
  const hasSectionA = sectionAQuestions.length > 0;
  const sectionAComplete = !hasSectionA || sectionAQuestions.every((question) => getQuestionStatus(question) !== "unanswered");
  const answered = orderedQuestions.filter((question) => getQuestionStatus(question) === "answered").length;
  const skipped = orderedQuestions.filter((question) => getQuestionStatus(question) === "skipped").length;
  const completed = answered + skipped;
  const unanswered = orderedQuestions.length - completed;
  const complete = unanswered === 0;
  const nextQuestion = orderedQuestions[index + 1];
  const nextLocked = Boolean(nextQuestion?.section === "B" && hasSectionA && !sectionAComplete);
  const currentSectionName = current.section === "A" ? "Bahagian A - Kecerdasan Insaniah" : "Bahagian B - Kecerdasan Intelek";
  const timerTone = remainingSeconds <= 300 ? "bg-coral-50 text-coral-600" : "bg-ocean-50 text-ocean-700";
  const scoreGuide =
    payload.attempt.mode === "full"
      ? "Skor rasmi: Bahagian A 20% + Bahagian B 70%"
      : current.section === "A"
        ? "Skor rasmi Bahagian A: 20%"
        : "Skor rasmi Bahagian B: 70%";
  const currentStatus = getQuestionStatus(current);
  const currentReady = currentStatus !== "unanswered";

  function handleNext() {
    if (!currentReady) {
      return;
    }

    if (index < orderedQuestions.length - 1) {
      if (!nextLocked) {
        setIndex((currentIndex) => currentIndex + 1);
      }
      return;
    }
    onComplete();
  }

  async function handleSkipCurrent() {
    if (!current || skippingQuestionId) {
      return;
    }

    setSkippingQuestionId(current.id);
    const skipped = await onSkip(current.id);
    setSkippingQuestionId(null);

    if (!skipped) {
      return;
    }

    setIndex(getNextIndexAfterSkip(orderedQuestions, index, current.id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-ocean-50 px-3 py-2 text-sm font-black text-ocean-700">
              Soalan {index + 1} / {orderedQuestions.length}
            </span>
            <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">{currentSectionName}</span>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${timerTone}`}>
            <Clock3 size={17} aria-hidden="true" />
            {formatTimer(remainingSeconds)}
          </span>
        </div>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-bold text-slate-500">{current.category ?? current.topic ?? "Soalan Objektif"}</span>
          <span className="text-sm font-black text-amber-700">{scoreGuide}</span>
        </div>
        <h1 className="text-2xl font-black leading-snug text-slate-950">{current.question_text}</h1>
        {current.question_image_url ? <QuestionImage src={current.question_image_url} /> : null}
        <div className="mt-6 grid gap-3">
          {current.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onAnswer(current.id, option.id)}
              className={`rounded-2xl border p-4 text-left text-sm font-bold transition ${
                current.selected_option_id === option.id ? "border-amber-400 bg-sun-50 text-slate-950" : "border-slate-200 bg-white hover:border-ocean-200"
              }`}
            >
              <OptionContent text={option.option_text} imageUrl={option.option_image_url ?? null} />
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex((currentIndex) => Math.max(0, currentIndex - 1))}>
              Sebelum
            </button>
            <button
              type="button"
              className="secondary-button border-coral-100 bg-coral-50 text-coral-600 hover:border-coral-500 hover:bg-coral-50"
              disabled={busy || Boolean(skippingQuestionId)}
              onClick={handleSkipCurrent}
            >
              {skippingQuestionId === current.id ? "Menyimpan Skip..." : "Skip Soalan Ini"}
            </button>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {!currentReady ? <p className="text-sm font-black text-coral-600">Pilih jawapan atau tekan Skip Soalan Ini untuk teruskan.</p> : null}
            {nextLocked ? <p className="text-sm font-black text-coral-600">Lengkapkan semua soalan Bahagian A dahulu.</p> : null}
            {index === orderedQuestions.length - 1 && !complete ? <p className="text-sm font-black text-coral-600">Jawab atau skip semua soalan sebelum hantar.</p> : null}
            <button
              type="button"
              className="primary-button"
              onClick={handleNext}
              disabled={busy || nextLocked || !currentReady || (index === orderedQuestions.length - 1 && !complete)}
            >
              {index < orderedQuestions.length - 1 ? "Seterusnya" : busy ? "Mengira..." : "Hantar Keputusan"}
            </button>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Kemajuan</h2>
            <p className="mt-1 text-xs font-black uppercase text-ocean-700">A dahulu, kemudian B</p>
          </div>
          <span className={`rounded-xl px-3 py-2 text-sm font-black ${timerTone}`}>{formatTimer(remainingSeconds)}</span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.round((completed / orderedQuestions.length) * 100)}%` }} />
        </div>
        <div className="mt-3 grid gap-1 text-sm font-semibold text-slate-600">
          <p>{completed} daripada {orderedQuestions.length} selesai.</p>
          <p><span className="font-black text-amber-700">{answered}</span> dijawab, <span className="font-black text-coral-600">{skipped}</span> skip, <span className="font-black text-slate-500">{unanswered}</span> belum.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-sun-100 ring-1 ring-amber-300" /> Dijawab</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-coral-100 ring-1 ring-coral-500" /> Skip</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-100" /> Belum</span>
        </div>
        <div className="mt-5 space-y-5">
          {[
            { section: "A" as const, title: "Bahagian A", questions: sectionAQuestions },
            { section: "B" as const, title: "Bahagian B", questions: sectionBQuestions },
          ]
            .filter((group) => group.questions.length > 0)
            .map((group) => (
              <div key={group.section}>
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                  <span>{group.title}</span>
                  <span>{group.questions.filter((question) => getQuestionStatus(question) !== "unanswered").length}/{group.questions.length}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {orderedQuestions.map((question, questionIndex) => ({ question, questionIndex }))
                    .filter((item) => item.question.section === group.section)
                    .map(({ question, questionIndex }) => {
                      const status = getQuestionStatus(question);
                      const locked = question.section === "B" && hasSectionA && !sectionAComplete;
                      return (
                        <button
                          key={question.id}
                          type="button"
                          disabled={locked}
                          onClick={() => setIndex(questionIndex)}
                          className={`grid h-10 place-items-center rounded-xl text-sm font-black transition ${questionStatusClass(status, questionIndex === index, locked)}`}
                        >
                          {questionIndex + 1}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

function QuestionImage({ src }: { src: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <img src={src} alt="" className="mx-auto max-h-96 rounded-xl object-contain" />
    </div>
  );
}

function OptionContent({ text, imageUrl }: { text: string | null; imageUrl: string | null }) {
  return (
    <span className="block">
      {text ? <span className="block">{text}</span> : null}
      {imageUrl ? <img src={imageUrl} alt="" className="mt-3 max-h-44 rounded-lg object-contain" /> : null}
    </span>
  );
}

function sectionSortOrder(section: PkskSectionCode): number {
  return section === "A" ? 1 : section === "B" ? 2 : 3;
}

function getQuestionStatus(question: QuizQuestion): "unanswered" | "answered" | "skipped" {
  if (question.answer_status) {
    return question.answer_status;
  }
  return question.selected_option_id ? "answered" : "unanswered";
}

function getQuestionStatusAfterSkip(question: QuizQuestion, skippedQuestionId: string): "unanswered" | "answered" | "skipped" {
  if (question.id === skippedQuestionId) {
    return "skipped";
  }
  return getQuestionStatus(question);
}

function getNextIndexAfterSkip(questions: QuizQuestion[], currentIndex: number, skippedQuestionId: string): number {
  const hasUnfinishedSectionA = questions.some((question) => question.section === "A" && getQuestionStatusAfterSkip(question, skippedQuestionId) === "unanswered");
  const canOpenQuestion = (question: QuizQuestion) => question.section !== "B" || !hasUnfinishedSectionA;

  for (let nextIndex = currentIndex + 1; nextIndex < questions.length; nextIndex += 1) {
    if (canOpenQuestion(questions[nextIndex])) {
      return nextIndex;
    }
  }

  const nextUnansweredIndex = questions.findIndex(
    (question, questionIndex) =>
      questionIndex !== currentIndex &&
      canOpenQuestion(question) &&
      getQuestionStatusAfterSkip(question, skippedQuestionId) === "unanswered",
  );

  return nextUnansweredIndex >= 0 ? nextUnansweredIndex : currentIndex;
}

function questionStatusClass(status: "unanswered" | "answered" | "skipped", active: boolean, locked: boolean): string {
  if (locked) {
    return "cursor-not-allowed bg-slate-50 text-slate-300";
  }

  const base = active ? "ring-2 ring-ocean-600 ring-offset-2 " : "";
  if (status === "answered") {
    return `${base}bg-sun-100 text-amber-800`;
  }
  if (status === "skipped") {
    return `${base}bg-coral-100 text-coral-600 ring-2 ring-coral-500`;
  }
  return `${base}bg-slate-100 text-slate-500 hover:bg-ocean-50 hover:text-ocean-700`;
}

function formatCurrency(amount: number, currency: string): string {
  if (currency.toUpperCase() === "MYR") {
    return `RM${Number(amount).toFixed(0)}`;
  }
  return `${currency.toUpperCase()} ${Number(amount).toFixed(0)}`;
}

function formatQuestionCount(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "...";
  }
  return value.toLocaleString("ms-MY");
}

function normalizeMalaysiaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 9) {
    return "";
  }
  if (digits.startsWith("60")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `6${digits}`;
  }
  return digits;
}

function ResultPanel({ result, onNavigate, onStartEssay }: { result: CompleteAttemptResult; onNavigate: (route: AppRoute) => void; onStartEssay: () => void }) {
  const hasSectionA = result.section_a_score !== null && result.section_a_score !== undefined;
  const hasSectionB = result.section_b_score !== null && result.section_b_score !== undefined;
  const isOfficialObjective = hasSectionA && hasSectionB;
  const officialMaxScore = isOfficialObjective ? 90 : hasSectionA ? 20 : hasSectionB ? 70 : 100;
  const officialScore = result.score ?? result.percentage;

  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sun-100 text-amber-700">
        <Trophy size={30} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-black">Keputusan Disimpan</h1>
      <p className="mt-3 text-lg font-black text-slate-950">Skor rasmi: {Number(officialScore).toFixed(2)} / {officialMaxScore}%</p>
      <p className="mt-2 text-sm font-semibold text-slate-600">{result.correct_answers} / {result.total_questions} betul. {result.skipped_answers ?? 0} soalan diskip.</p>
      {isOfficialObjective ? (
        <div className="mx-auto mt-5 grid max-w-lg gap-3 sm:grid-cols-2">
          <SummaryPanel title="Bahagian A" value={`${Number(result.section_a_weighted_score ?? 0).toFixed(2)} / 20%`} />
          <SummaryPanel title="Bahagian B" value={`${Number(result.section_b_weighted_score ?? 0).toFixed(2)} / 70%`} />
        </div>
      ) : null}
      <p className="mt-2 text-lg font-black text-ocean-700">+{result.xp_earned} mata</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        {isOfficialObjective ? (
          <button type="button" className="primary-button" onClick={onStartEssay}>
            Teruskan Bahagian C
          </button>
        ) : null}
        <button type="button" className="primary-button" onClick={() => onNavigate("/app/pencapaian")}>
          Lihat Prestasi
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate("/app/sejarah")}>
          Sejarah Cubaan
        </button>
      </div>
    </section>
  );
}

function ProfilePage({
  profile,
  busy,
  onSave,
}: {
  profile: ProfileRow | null;
  busy: boolean;
  onSave: (input: Omit<ProfileInput, "id">) => void;
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [school, setSchool] = useState(profile?.school ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [className, setClassName] = useState(profile?.class_name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? avatars[0]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setDisplayName(profile?.display_name ?? "");
    setSchool(profile?.school ?? "");
    setState(profile?.state ?? "");
    setClassName(profile?.class_name ?? "");
    setAvatar(profile?.avatar ?? avatars[0]);
  }, [profile]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ full_name: fullName, display_name: displayName, school, state, class_name: className, avatar });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <PageHeader icon={UserRound} title="Profil Calon" text="Lengkapkan maklumat ringkas supaya kemajuan simulasi lebih tersusun." compact />
        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <Label text="Nama penuh">
            <input className="field" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </Label>
          <Label text="Nama paparan">
            <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </Label>
          <Label text="Sekolah">
            <input className="field" value={school} onChange={(event) => setSchool(event.target.value)} required />
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Negeri">
              <select className="field" value={state} onChange={(event) => setState(event.target.value)} required>
                <option value="">Pilih negeri</option>
                {states.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Kelas / Tahun">
              <input className="field" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="6 Amanah" required />
            </Label>
          </div>
          <Label text="Avatar">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {avatars.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setAvatar(item)}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold ${avatar === item ? "border-ocean-500 bg-ocean-50 text-ocean-700" : "border-slate-200"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </Label>
          <button type="submit" className="primary-button" disabled={busy}>
            <Save size={18} aria-hidden="true" />
            {busy ? "Menyimpan..." : "Simpan Profil"}
          </button>
        </form>
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-xl font-black">Ringkasan</h2>
        <div className="mt-5 grid gap-3">
          <SummaryRow label="Nama" value={displayName || "Belum diisi"} />
          <SummaryRow label="Sekolah" value={school || "Belum diisi"} />
          <SummaryRow label="Negeri" value={state || "Belum diisi"} />
          <SummaryRow label="Kelas" value={className || "Belum diisi"} />
          <SummaryRow label="Mata" value={`${profile?.xp ?? 0}`} />
        </div>
      </section>
    </div>
  );
}

function PerformancePage({
  stats,
  attempts,
  isLoggedIn,
  onNavigate,
}: {
  stats: ReturnType<typeof calculatePerformance>;
  attempts: QuizAttemptRow[];
  isLoggedIn: boolean;
  onNavigate: (route: AppRoute) => void;
}) {
  if (!isLoggedIn) {
    return <LockedState title="Prestasi peribadi dikunci" text="Log masuk untuk melihat sejarah markah dan mata simulasi." onNavigate={onNavigate} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Award} title="Prestasi Saya" text="Lihat perkembangan simulasi, markah terbaik dan lencana yang telah dibuka." />
      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={ClipboardList} label="Simulasi" value={`${stats.totalAttempts}`} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Star} label="Terbaik" value={`${stats.bestScore}%`} tone="bg-sun-50 text-amber-700" />
        <StatCard icon={Target} label="Purata" value={`${stats.averageScore}%`} tone="bg-leaf-50 text-leaf-600" />
        <StatCard icon={Zap} label="Mata" value={`${stats.totalXp}`} tone="bg-coral-50 text-coral-600" />
        <StatCard icon={Rocket} label="Level" value={`${stats.level}`} tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Trophy} label="Lencana" value={`${stats.badgeCount}`} tone="bg-sun-50 text-amber-700" />
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-xl font-black">Trend Cubaan</h2>
        <div className="mt-5 grid gap-3">
          {attempts.slice().reverse().map((attempt, attemptIndex) => (
            <div key={attempt.id} className="grid gap-2 sm:grid-cols-[110px_1fr_64px] sm:items-center">
              <span className="text-sm font-bold text-slate-500">Cubaan {attemptIndex + 1}</span>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.min(100, officialAttemptScore(attempt))}%` }} />
              </div>
              <span className="text-sm font-black text-slate-900">{formatScore(officialAttemptScore(attempt))}%</span>
            </div>
          ))}
          {attempts.length === 0 ? <p className="text-sm font-semibold text-slate-500">Belum ada cubaan selesai.</p> : null}
        </div>
      </section>
    </div>
  );
}

function HistoryPage({
  attempts,
  isLoggedIn,
  onNavigate,
}: {
  attempts: QuizAttemptRow[];
  isLoggedIn: boolean;
  onNavigate: (route: AppRoute) => void;
}) {
  if (!isLoggedIn) {
    return <LockedState title="Sejarah dikunci" text="Log masuk untuk melihat rekod cubaan." onNavigate={onNavigate} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={History} title="Sejarah Cubaan" text="Semak semula rekod simulasi yang telah selesai." />
      <section className="grid gap-4">
        {attempts.map((attempt, index) => (
          <article key={attempt.id} className="rounded-2xl bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Simulasi #{attempts.length - index}</h2>
                <p className="text-sm text-slate-500">{formatDate(attempt.started_at)}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Skor" value={`${formatScore(officialAttemptScore(attempt))}%`} />
                <Metric label="Betul" value={`${attempt.correct_answers}/${attempt.total_questions}`} />
                <Metric label="Mata" value={`+${attempt.xp_earned}`} />
              </div>
            </div>
          </article>
        ))}
        {attempts.length === 0 ? <EmptyState title="Belum ada sejarah" text="Mulakan simulasi pertama untuk melihat rekod di sini." onNavigate={onNavigate} /> : null}
      </section>
    </div>
  );
}

function AchievementsPage({
  badges,
  isLoggedIn,
  onNavigate,
}: {
  badges: BadgeWithProgress[];
  isLoggedIn: boolean;
  onNavigate: (route: AppRoute) => void;
}) {
  if (!isLoggedIn) {
    return <LockedState title="Lencana dikunci" text="Log masuk untuk mengumpul lencana PKSK." onNavigate={onNavigate} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Trophy} title="Lencana" text="Kumpul lencana apabila berjaya mencapai sasaran simulasi." />
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {badges.map((badge) => {
          const Icon = iconForBadge(badge.icon);
          const percentage = Math.min(100, Math.round((badge.progress_value / Number(badge.requirement_value)) * 100));
          return (
            <article key={badge.id} className={`rounded-2xl bg-white p-5 shadow-soft ${badge.earned ? "" : "opacity-70 grayscale"}`}>
              <div className="flex items-start gap-4">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tierTone(badge.tier)}`}>
                  {badge.earned ? <Icon size={23} aria-hidden="true" /> : <LockKeyhole size={23} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black">{badge.name}</h2>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{tierLabel(badge.tier)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{badge.description}</p>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-500">
                  <span>Kemajuan</span>
                  <span>{badge.progress_label}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-ocean-600" style={{ width: `${percentage}%` }} />
                </div>
              </div>
              {badge.earned_at ? <p className="mt-3 text-xs font-semibold text-leaf-600">Diperoleh {formatDate(badge.earned_at)}</p> : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function BonusPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const subjectList = Array.from(new Set(bonusMaterials.map((material) => material.subject))).join(", ");

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-soft sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-950 to-teal-900" aria-hidden="true" />
        <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
        <div className="absolute right-8 top-0 h-52 w-52 rounded-full bg-teal-300/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -right-12 bottom-0 hidden h-56 w-56 rounded-full bg-amber-300/20 blur-3xl md:block" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-black text-amber-100 ring-1 ring-white/15">
              <Crown size={17} aria-hidden="true" />
              Bonus Eksklusif Premium
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">Bahan tambahan khas untuk ahli Premium.</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-200 sm:text-base">
              Klik mana-mana kad untuk muat turun PDF secara percuma. Semua bahan ini disusun sebagai hadiah tambahan supaya latihan murid lebih lengkap.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-black ring-1 ring-white/15">
                {bonusMaterials.length} bahan bonus
              </span>
              <span className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-black ring-1 ring-white/15">{subjectList}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["BM", "Tatabahasa"],
                ["MT", "Matematik"],
                ["SN", "Sains"],
                ["EN", "English"],
              ].map(([code, label]) => (
                <div key={code} className="rounded-2xl bg-white p-4 text-slate-950 shadow-soft">
                  <p className="text-2xl font-black text-ocean-700">{code}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {bonusMaterials.map((material) => (
          <a
            key={material.filePath}
            href={material.filePath}
            download
            className="group overflow-hidden rounded-2xl bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(15,23,42,0.16)] focus:outline-none focus:ring-4 focus:ring-ocean-200"
            aria-label={`Muat turun ${material.title}`}
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
              <img src={material.coverPath} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/76 to-transparent" aria-hidden="true" />
              <span className="absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1 text-xs font-black uppercase text-slate-800 shadow-sm">
                {material.subject}
              </span>
              <span className="absolute bottom-4 left-4 rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase text-amber-950 shadow-sm">
                Bonus Premium
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-ocean-700">{material.level}</p>
                  <h2 className="mt-1 text-xl font-black leading-tight text-slate-950">{material.title}</h2>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${material.accent} text-white shadow-lg`}>
                  <Download size={21} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{material.description}</p>
              <span className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-ocean-100 bg-ocean-50 px-4 text-sm font-black text-ocean-800 transition group-hover:border-ocean-300 group-hover:bg-ocean-100">
                Muat Turun Percuma
                <Download size={17} aria-hidden="true" />
              </span>
            </div>
          </a>
        ))}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Bahan akan ditambah dari semasa ke semasa.</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">Semua fail di halaman ini ialah bonus untuk pengguna Premium PKSK Academy.</p>
          </div>
          <button type="button" className="secondary-button bg-white" onClick={() => onNavigate("/app")}>
            Kembali Dashboard
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoPkskPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const [isFormatOpen, setIsFormatOpen] = useState(false);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-soft">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
          <div className="flex min-w-0 flex-col justify-center">
            <span className="hidden w-fit items-center gap-2 rounded-xl bg-ocean-500/15 px-3 py-2 text-xs font-black uppercase tracking-wide text-cyan-100 lg:inline-flex">
              <Info size={16} aria-hidden="true" />
              INFO PKSK
            </span>
            <h1 className="text-3xl font-black leading-tight sm:text-5xl lg:mt-5">Panduan PKSK {pkskInfoConfig.sessionYear}</h1>
            <p className="mt-4 hidden max-w-2xl text-base leading-7 text-slate-200 sm:text-lg lg:block">
              Maklumat penting untuk membantu calon dan ibu bapa memahami PKSK serta membuat persediaan dengan lebih tersusun.
            </p>
          </div>

          <div className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-2">
            {[
              { icon: GraduationCap, title: "Sekolah Khusus", text: "Rujukan ringkas untuk calon", tone: "bg-ocean-500/15 text-cyan-100" },
              { icon: CalendarCheck, title: "Tarikh", text: "Countdown dan timeline", tone: "bg-sun-400/15 text-amber-100" },
              { icon: ClipboardList, title: "Format", text: "Bahagian A, B dan C", tone: "bg-leaf-500/15 text-emerald-100" },
              { icon: Target, title: "Persediaan", text: "Langkah belajar tersusun", tone: "bg-white/10 text-white" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.08] p-4">
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl ${item.tone}`}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-base font-black">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <nav className="rounded-2xl bg-white p-3 shadow-soft" aria-label="Navigasi Info PKSK">
        <div className="flex flex-wrap gap-2">
          {pkskInfoQuickLinks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToInfoSection(item.id)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-ocean-200 hover:bg-ocean-50 hover:text-ocean-700 sm:text-sm"
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <section id="apa-itu-pksk" className="scroll-mt-24 rounded-2xl bg-white p-6 shadow-soft sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
              <BookOpen size={24} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-2xl font-black text-slate-950 sm:text-3xl">Apa Itu PKSK?</h2>
          </div>
          <div className="space-y-4 text-sm leading-7 text-slate-600 sm:text-base">
            <p>
              PKSK ialah pentaksiran yang digunakan dalam proses kemasukan ke Sekolah Khusus dan MRSM. Berdasarkan panduan permohonan KPM, pentaksiran ini menjadi
              sebahagian penting daripada proses kemasukan bagi calon yang memohon.
            </p>
            <p>
              Untuk calon dan ibu bapa, perkara paling penting ialah memahami urusan permohonan, menyemak tarikh rasmi dan membuat persediaan secara konsisten tanpa
              bergantung kepada hafalan semata-mata.
            </p>
          </div>
        </div>
      </section>

      <section id="sekolah-khusus" className="scroll-mt-24 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Sekolah Khusus</p>
            <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Siapa Yang Terlibat?</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Kumpulan calon berikut disebut dalam hebahan KPM bagi kemasukan tahun {pkskInfoConfig.sessionYear}.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {pkskAudienceCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="rounded-2xl bg-white p-6 shadow-soft">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${card.tone}`}>
                  <Icon size={23} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-black text-slate-950">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{card.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <PkskCountdownSection id="tarikh-penting" variant="full" showTimeline />

      <section id="format-pksk" className="scroll-mt-24 space-y-5">
        <div className="rounded-2xl bg-white p-5 shadow-soft lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-ocean-700">Format PKSK</p>
              <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Kenali Format PKSK</h2>
              <p className={`${isFormatOpen ? "block" : "hidden"} mt-2 max-w-3xl text-sm leading-6 text-slate-600 lg:block`}>
                Ringkasan ini menerangkan bahagian utama secara umum. Bilangan soalan, markah, tempoh dan pecahan konstruk perlu dirujuk kepada hebahan rasmi jika KPM
                mengumumkannya.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-ocean-100 bg-ocean-50 px-4 py-2 text-sm font-black text-ocean-800 lg:hidden"
              onClick={() => setIsFormatOpen((current) => !current)}
              aria-expanded={isFormatOpen}
              aria-controls="pksk-format-content"
            >
              {isFormatOpen ? "Sembunyi format" : "Lihat format"}
              <ChevronRight size={17} className={`transition ${isFormatOpen ? "rotate-90" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div id="pksk-format-content" className={`${isFormatOpen ? "grid" : "hidden"} gap-5 lg:grid lg:grid-cols-3`}>
          {pkskFormatCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="rounded-2xl bg-white p-6 shadow-soft">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${card.tone}`}>
                  <Icon size={23} aria-hidden="true" />
                </span>
                <p className="mt-5 text-sm font-black uppercase text-ocean-700">{card.title}</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">{card.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{card.text}</p>
                <button type="button" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-ocean-700" onClick={() => onNavigate(card.route)}>
                  {card.ctaLabel}
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section id="persediaan" className="scroll-mt-24 space-y-5">
        <div>
          <p className="text-sm font-black uppercase text-ocean-700">Persediaan</p>
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Bagaimana Hendak Bersedia?</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {pkskPrepCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="rounded-2xl bg-white p-5 shadow-soft">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-black text-slate-950">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-soft sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">Sudah faham tentang PKSK?</h2>
            <p className="mt-2 text-base font-semibold text-slate-200">Sekarang masa untuk mula berlatih.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => onNavigate("/app/simulasi")}>
            Mulakan Simulasi
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section id="faq-pksk" className="scroll-mt-24 space-y-4">
        <div>
          <p className="text-sm font-black uppercase text-ocean-700">FAQ</p>
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">FAQ PKSK</h2>
        </div>
        <div className="grid gap-3">
          {pkskFaqItems.map((item) => (
            <details key={item.question} className="group rounded-2xl bg-white p-5 shadow-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-slate-950 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <ChevronRight size={17} className="transition group-open:rotate-90" aria-hidden="true" />
                </span>
              </summary>
              <p className="mt-4 text-sm leading-6 text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl bg-white p-6 shadow-soft">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
            <BookOpen size={23} aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-black text-slate-950">Sumber Rasmi</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Maklumat tarikh dan urusan permohonan hendaklah dirujuk kepada hebahan rasmi Kementerian Pendidikan Malaysia. Tarikh dan ketetapan boleh berubah dari
            semasa ke semasa.
          </p>
          <div className="mt-5 grid gap-2">
            {pkskInfoConfig.officialSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-ocean-200 hover:bg-ocean-50 hover:text-ocean-700"
              >
                {source.label}
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-sun-50 p-6 shadow-soft">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sun-100 text-amber-700">
            <Info size={23} aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-black text-slate-950">Disclaimer</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            PKSK Academy oleh CikguSTEM ialah platform persediaan bebas dan tidak mempunyai hubungan rasmi dengan Kementerian Pendidikan Malaysia. Maklumat rasmi
            berkaitan permohonan, tarikh dan pelaksanaan PKSK hendaklah dirujuk melalui portal KPM.
          </p>
        </article>
      </section>
    </div>
  );
}

function PkskCountdownSection({
  id,
  variant = "full",
  showTimeline = true,
}: {
  id?: string;
  variant?: "full" | "dashboard";
  showTimeline?: boolean;
}) {
  const now = useMalaysiaClock();
  const compact = variant === "dashboard";
  const countdownItems = pkskInfoConfig.countdownEventIds.map((eventId) => ({ eventId, event: pkskInfoConfig.events[eventId] }));
  const timelineItems = pkskInfoConfig.timelineEventIds.map((eventId) => ({ eventId, event: pkskInfoConfig.events[eventId] }));

  return (
    <section id={id} className={`${id ? "scroll-mt-24" : ""} min-w-0 ${compact ? "rounded-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:p-6" : "space-y-6"}`}>
      <div className={`min-w-0 ${compact ? "rounded-2xl bg-gradient-to-br from-white via-ocean-50/60 to-sun-50/50 p-5 ring-1 ring-ocean-100 sm:p-6" : "rounded-2xl bg-white p-5 shadow-soft sm:p-8"}`}>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase text-ocean-700">Countdown</p>
            <h2 className={`${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} mt-2 font-black leading-tight text-slate-950`}>
              Countdown PKSK {pkskInfoConfig.sessionYear}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Berapa lama lagi sebelum PKSK bermula?</p>
          </div>

          <div className="hidden min-w-0 flex-wrap gap-3 md:flex lg:justify-end">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-100">
              <Clock3 size={15} aria-hidden="true" />
              {pkskInfoConfig.timezone}
            </span>
            {!compact ? <PkskCountdownIllustration /> : null}
          </div>
        </div>

        {!compact ? (
          <div className="mt-6 hidden gap-3 md:grid md:grid-cols-3">
            {pkskCountdownHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${item.tone}`}>
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-800">{item.title}</h3>
                    <p className="text-xs font-bold leading-5 text-slate-500">{item.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        <div className={`${compact ? "mt-5" : "mt-7"} grid min-w-0 gap-5 lg:grid-cols-2`}>
          {countdownItems.map((item) => (
            <PkskExamCountdownCard key={item.eventId} eventId={item.eventId} event={item.event} now={now} compact={compact} />
          ))}
        </div>
      </div>

      {showTimeline ? <PkskImportantTimeline items={timelineItems} now={now} /> : null}

      {showTimeline ? (
        <section className="rounded-2xl border border-amber-100 bg-amber-50/90 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
              <Lightbulb size={22} aria-hidden="true" />
            </span>
            <p className="text-sm font-bold leading-6 text-amber-900">
              Ingat! Persediaan awal, latihan konsisten dan doa adalah kunci kejayaan PKSK.
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function PkskCountdownIllustration() {
  return (
    <div className="hidden min-w-[260px] items-center justify-end gap-3 rounded-[2rem] bg-gradient-to-br from-sky-50 via-white to-amber-50 px-5 py-4 shadow-sm ring-1 ring-slate-100 md:flex" aria-hidden="true">
      <span className="grid h-16 w-16 rotate-[-4deg] place-items-center rounded-2xl bg-blue-600 text-white shadow-lg">
        <CalendarCheck size={31} />
      </span>
      <div className="grid gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-amber-600 shadow-sm">
          <Trophy size={22} />
        </span>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-ocean-700 shadow-sm">
          <BookOpen size={21} />
        </span>
      </div>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700 shadow-sm">
        <Target size={28} />
      </span>
    </div>
  );
}

function PkskExamCountdownCard({
  eventId,
  event,
  now,
  compact,
}: {
  eventId: PkskInfoEventId;
  event: PkskInfoEvent;
  now: Date | null;
  compact: boolean;
}) {
  const countdown = getCountdownState(event, now);
  const theme = pkskCountdownThemes[eventId] ?? pkskCountdownThemes.form4!;
  const progress = getCountdownProgress(event, now);
  const progressLabel = `${Math.round(progress)}%`;
  const LeftIcon = theme.leftIcon;
  const RightIcon = theme.rightIcon;
  const message = countdown.statusLabel === "Akan datang" ? theme.message : countdown.message;

  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-2xl p-4 text-white shadow-[0_22px_48px_rgba(15,23,42,0.20)] ring-1 ring-white/10 sm:p-6 ${compact ? "" : "min-h-[260px]"}`}
      style={{ background: theme.background }}
    >
      <div className={`absolute -left-10 -top-10 h-32 w-32 rounded-full ${theme.glow} blur-2xl`} aria-hidden="true" />
      <div className="absolute -bottom-16 right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
      <RightIcon className="absolute right-5 top-5 text-white/30" size={compact ? 54 : 72} aria-hidden="true" />

      <div className="relative flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white ring-1 ring-white/15">
            <LeftIcon size={15} aria-hidden="true" />
            {theme.badge}
          </span>
          <h3 className={`${compact ? "text-xl" : "text-2xl"} mt-4 font-black leading-tight`}>{event.title}</h3>
          <p className="mt-2 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl bg-slate-950/25 px-3 py-2 text-xs font-black text-white/90 ring-1 ring-white/10">
            <CalendarCheck size={15} aria-hidden="true" />
            Tarikh mula: {event.startLabel}
          </p>
        </div>
        <span className={`relative z-10 inline-flex max-w-full shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-black ${countdown.statusTone}`}>
          <Clock3 size={14} aria-hidden="true" />
          {countdown.statusLabel}
        </span>
      </div>

      <div className="relative mt-5 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-label={`Countdown ${event.title}`}>
        {countdown.units.map((unit, index) => (
          <div key={unit.label} className="relative">
            <div className="rounded-2xl bg-slate-950/30 px-2 py-3 text-center shadow-inner ring-1 ring-white/10 sm:px-3 sm:py-4">
              <p className={`${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-black leading-none tabular-nums ${theme.unitText}`}>{unit.value}</p>
              <p className="mt-2 text-[10px] font-black tracking-wide text-white/75 sm:text-[11px]">{unit.label}</p>
            </div>
            {index < countdown.units.length - 1 ? (
              <span className="pointer-events-none absolute -right-[0.48rem] top-1/2 hidden -translate-y-1/2 text-2xl font-black text-white/50 sm:block">:</span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative mt-5 space-y-3">
        <p className="flex items-center gap-2 text-xs font-bold leading-5 text-white/90 sm:text-sm">
          <Star size={15} className="shrink-0 text-amber-200" aria-hidden="true" />
          {message}
        </p>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3" aria-label={`Progress menuju ${event.title}: ${progressLabel}`}>
          <div className="h-3 w-full min-w-0 flex-1 overflow-hidden rounded-full bg-slate-950/30 ring-1 ring-white/10">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: theme.progress }} />
          </div>
          <span className="self-end rounded-full bg-slate-950/40 px-3 py-1 text-xs font-black text-white ring-1 ring-white/10 sm:self-auto">{progressLabel}</span>
        </div>
      </div>
    </article>
  );
}

function PkskImportantTimeline({ items, now }: { items: Array<{ eventId: PkskInfoEventId; event: PkskInfoEvent }>; now: Date | null }) {
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-white p-5 shadow-soft sm:p-8">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase text-ocean-700">Jadual Penting</p>
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Jadual Penting PKSK {pkskInfoConfig.sessionYear}</h2>
          <p className={`${isTimelineOpen ? "block" : "hidden"} mt-2 max-w-xl text-sm leading-6 text-slate-600 lg:block`}>
            Status dikira secara automatik berdasarkan tarikh mula dan tamat setiap fasa.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-ocean-100 bg-ocean-50 px-4 py-2 text-sm font-black text-ocean-800 lg:hidden"
          onClick={() => setIsTimelineOpen((current) => !current)}
          aria-expanded={isTimelineOpen}
          aria-controls="pksk-timeline-content"
        >
          {isTimelineOpen ? "Sembunyi jadual" : "Lihat jadual"}
          <ChevronRight size={17} className={`transition ${isTimelineOpen ? "rotate-90" : ""}`} aria-hidden="true" />
        </button>
      </div>

      <div id="pksk-timeline-content" className={`${isTimelineOpen ? "block" : "hidden"} relative mt-7 lg:block`}>
        <div className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-slate-200 lg:hidden" aria-hidden="true" />
        <div className="absolute left-12 right-12 top-[2.35rem] hidden h-px bg-slate-200 lg:block" aria-hidden="true" />
        <ol className="relative grid min-w-0 gap-4 lg:grid-cols-4">
          {items.map(({ eventId, event }) => {
            const status = getTimelineStatus(event, now);
            const theme = pkskTimelineThemes[eventId] ?? pkskTimelineThemes.form4!;
            const Icon = theme.icon;
            return (
              <li key={eventId} className="relative grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-4 lg:block">
                <span className={`relative z-10 grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-sm ring-1 ${theme.tone}`}>
                  <Icon size={22} aria-hidden="true" />
                </span>
                <article className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:mt-4">
                  <p className="text-xs font-black uppercase text-ocean-700">{event.title}</p>
                  <h3 className="mt-1 text-base font-black leading-tight text-slate-950">{event.label}</h3>
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black leading-5 text-slate-600 ring-1 ring-slate-100">{event.dateLabel}</p>
                  <span className={`mt-3 inline-flex max-w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${status.tone}`}>
                    <ShieldCheck size={15} aria-hidden="true" />
                    {status.label}
                  </span>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function GuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader icon={BookOpen} title="Panduan" text="Kenali bahagian utama PKSK dan pilih simulasi yang sesuai." />
      <section className="grid gap-5 lg:grid-cols-3">
        {pkskSections.map((section) => (
          <article key={section.title} className="rounded-2xl bg-white p-6 shadow-soft">
            <span className="text-sm font-black uppercase text-ocean-700">{section.title}</span>
            <h2 className="mt-2 text-xl font-black text-slate-950">{section.label}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {section.examples.map((example) => (
                <span key={example} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {example}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-xl font-black">Cara Guna Simulator</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StepCard number="1" title="Lengkapkan profil" text="Masukkan nama, sekolah dan kelas supaya rekod simulasi tersimpan dengan kemas." />
          <StepCard number="2" title="Pilih simulasi" text="Cuba simulasi penuh, ulang kaji mengikut bahagian atau cabaran pantas harian." />
          <StepCard number="3" title="Lihat kemajuan" text="Semak markah, sejarah cubaan dan lencana untuk tahu bahagian yang perlu dikuatkan." />
        </div>
      </section>
    </div>
  );
}

function SetupNotice() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-soft">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <LockKeyhole size={23} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-black">Sistem simulasi belum bersedia</h1>
          <p className="mt-2 leading-7 text-slate-700">Bank soalan sedang disambungkan. Sila cuba semula sebentar lagi atau maklumkan kepada pentadbir.</p>
        </div>
      </div>
    </section>
  );
}

function LoadingPage() {
  return <section className="rounded-2xl bg-white p-6 text-sm font-bold text-slate-600 shadow-soft">Memuatkan aplikasi...</section>;
}

function LockedState({ title, text, onNavigate }: { title: string; text: string; onNavigate: (route: AppRoute) => void }) {
  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600">
        <LockKeyhole size={26} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-slate-600">{text}</p>
      <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/")}>
        Ke Dashboard
      </button>
    </section>
  );
}

function EmptyState({ title, text, onNavigate }: { title: string; text: string; onNavigate: (route: AppRoute) => void }) {
  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-slate-600">{text}</p>
      <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/app/simulasi")}>
        Mula Simulasi
      </button>
    </section>
  );
}

function PageHeader({ icon: Icon, title, text, compact = false }: { icon: LucideIcon; title: string; text: string; compact?: boolean }) {
  return (
    <section className={compact ? "" : "rounded-2xl bg-white p-6 shadow-soft"}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-black">{title}</h1>
          <p className="text-sm leading-6 text-slate-500">{text}</p>
        </div>
      </div>
    </section>
  );
}

function MessageBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-ocean-100 bg-ocean-50 px-4 py-3 text-sm font-bold text-ocean-800">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="grid h-8 w-8 place-items-center rounded-lg bg-white/70" aria-label="Tutup mesej">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function ModeCard({
  title,
  text,
  icon: Icon,
  disabled = false,
  onClick,
}: {
  title: string;
  text: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
        <Icon size={23} aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-ocean-700">
        Pilih
        <ChevronRight size={17} aria-hidden="true" />
      </span>
    </button>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}>
          <Icon size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-950">{value}</p>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-slate-700">{text}</span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function StepCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-ocean-600 text-sm font-black text-white">{number}</span>
      <h3 className="mt-4 text-base font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function iconForBadge(icon: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    footprints: Footprints,
    zap: Zap,
    "calendar-check": CalendarCheck,
    star: Star,
    sparkles: Sparkles,
    "heart-handshake": HeartHandshake,
    brain: Brain,
    trophy: Trophy,
    crown: Crown,
  };

  return icons[icon] ?? Award;
}

function tierTone(tier: BadgeWithProgress["tier"]): string {
  if (tier === "BRONZE") {
    return "bg-orange-50 text-orange-700";
  }
  if (tier === "SILVER") {
    return "bg-slate-100 text-slate-700";
  }
  if (tier === "GOLD") {
    return "bg-sun-100 text-amber-700";
  }
  return "bg-ocean-50 text-ocean-700";
}

function tierLabel(tier: BadgeWithProgress["tier"]): string {
  const labels: Record<BadgeWithProgress["tier"], string> = {
    BRONZE: "Gangsa",
    SILVER: "Perak",
    GOLD: "Emas",
    PLATINUM: "Platinum",
  };

  return labels[tier];
}

function roleLabel(role: ProfileRow["role"]): string {
  const labels: Record<ProfileRow["role"], string> = {
    user: "User",
    admin: "Admin",
    super_admin: "Super Admin",
  };

  return labels[role];
}

function subscriptionLabel(status: ProfileRow["subscription_status"]): string {
  const labels: Record<ProfileRow["subscription_status"], string> = {
    free: "Free",
    premium: "Premium",
    expired: "Expired",
    blocked: "Blocked",
  };

  return labels[status];
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function useMalaysiaClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), oneSecondMs);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function scrollToInfoSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getCountdownState(event: PkskInfoEvent, now: Date | null) {
  if (!now) {
    return {
      statusLabel: "Memuatkan",
      statusTone: "bg-slate-100 text-slate-600",
      message: "Memuatkan countdown...",
      units: zeroCountdownUnits(),
    };
  }

  const nowMs = now.getTime();
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();

  if (nowMs > endMs) {
    return {
      statusLabel: "Selesai",
      statusTone: "bg-slate-100 text-slate-600",
      message: "PKSK bagi sesi ini telah berlangsung.",
      units: zeroCountdownUnits(),
    };
  }

  if (nowMs >= startMs) {
    return {
      statusLabel: "Sedang berlangsung",
      statusTone: "bg-leaf-50 text-leaf-600",
      message: "PKSK sedang berlangsung",
      units: zeroCountdownUnits(),
    };
  }

  const remainingMs = Math.max(0, startMs - nowMs);
  const days = Math.floor(remainingMs / oneDayMs);
  const hours = Math.floor((remainingMs % oneDayMs) / oneHourMs);
  const minutes = Math.floor((remainingMs % oneHourMs) / oneMinuteMs);
  const seconds = Math.floor((remainingMs % oneMinuteMs) / oneSecondMs);
  const values = { days, hours, minutes, seconds };

  return {
    statusLabel: remainingMs <= urgentCountdownMs ? "Semakin hampir" : "Akan datang",
    statusTone: remainingMs <= urgentCountdownMs ? "bg-sun-50 text-amber-700" : "bg-ocean-50 text-ocean-700",
    message: remainingMs <= urgentCountdownMs ? "PKSK semakin hampir!" : "Teruskan persediaan anda.",
    units: countdownUnits.map((unit) => ({
      label: unit.label,
      value: formatCountdownValue(values[unit.key], unit.key === "days"),
    })),
  };
}

function getCountdownProgress(event: PkskInfoEvent, now: Date | null): number {
  if (!now) {
    return 0;
  }

  const anchorMs = new Date(pkskInfoConfig.events.application.start).getTime();
  const startMs = new Date(event.start).getTime();
  const nowMs = now.getTime();

  if (nowMs >= startMs) {
    return 100;
  }

  if (startMs <= anchorMs || nowMs <= anchorMs) {
    return 0;
  }

  return clampNumber(((nowMs - anchorMs) / (startMs - anchorMs)) * 100, 0, 100);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function zeroCountdownUnits() {
  return countdownUnits.map((unit) => ({
    label: unit.label,
    value: formatCountdownValue(0, unit.key === "days"),
  }));
}

function getTimelineStatus(event: PkskInfoEvent, now: Date | null) {
  if (!now) {
    return { label: "Akan datang", tone: "bg-slate-100 text-slate-600" };
  }

  const nowMs = now.getTime();
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();

  if (nowMs < startMs) {
    return { label: "Akan datang", tone: "bg-ocean-50 text-ocean-700" };
  }

  if (nowMs <= endMs) {
    return { label: "Sedang berlangsung", tone: "bg-leaf-50 text-leaf-600" };
  }

  return { label: "Selesai", tone: "bg-slate-100 text-slate-600" };
}

function formatCountdownValue(value: number, allowWide = false) {
  if (allowWide) {
    return String(value);
  }

  return String(value).padStart(2, "0");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}


function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function officialAttemptScore(attempt: QuizAttemptRow): number {
  const score = Number(attempt.score ?? 0);
  return score > 0 ? score : Number(attempt.percentage ?? 0);
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function objectiveRemainingSeconds(payload: AttemptPayload | null): number {
  if (!payload) {
    return 0;
  }
  return objectiveRemainingSecondsFromStart(payload.attempt.started_at);
}

function objectiveRemainingSecondsFromStart(startedAtValue: string): number {
  const limitSeconds = 90 * 60;
  const startedAt = new Date(startedAtValue).getTime();
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, limitSeconds - elapsedSeconds);
}


function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("get_my_access_status") ||
    message.includes("record_last_login") ||
    message.includes("get_public_app_settings") ||
    message.includes("get_guest_preview_questions") ||
    message.includes("score_guest_preview") ||
    message.includes("schema cache") ||
    message.includes("PGRST202") ||
    message.includes("Could not find the function")
  ) {
    return databaseSetupMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }
  return "Ralat tidak dijangka. Cuba semula.";
}

function isRecoveryLink(): boolean {
  return window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");
}

function resolveAppRoute(pathname: string): AppRoute | null {
  const rawPath = pathname.replace(/\/$/, "") || "/";
  const legacyTarget = legacyRouteMap[rawPath];
  if (legacyTarget) {
    return legacyTarget;
  }

  const path = rawPath as AppRoute;
  return validRoutes.has(path) ? path : null;
}

function getCurrentRoute(): AppRoute {
  const rawPath = window.location.pathname.replace(/\/$/, "") || "/";
  const savedRedirect = window.sessionStorage.getItem(spaRedirectStorageKey);

  if (savedRedirect) {
    window.sessionStorage.removeItem(spaRedirectStorageKey);
    try {
      const redirectUrl = new URL(savedRedirect, window.location.origin);
      const redirectRoute = redirectUrl.origin === window.location.origin ? resolveAppRoute(redirectUrl.pathname) : null;
      if (redirectRoute) {
        window.history.replaceState({}, "", `${redirectRoute}${redirectUrl.search}${redirectUrl.hash}`);
        return redirectRoute;
      }
    } catch {
      window.sessionStorage.removeItem(spaRedirectStorageKey);
    }
  }

  const currentRoute = resolveAppRoute(rawPath);
  if (currentRoute) {
    if (currentRoute !== rawPath) {
      window.history.replaceState({}, "", `${currentRoute}${window.location.search}${window.location.hash}`);
    }
    return currentRoute;
  }

  return "/";
}

export default App;
