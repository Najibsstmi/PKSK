import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  Crown,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Footprints,
  GraduationCap,
  HeartHandshake,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PenLine,
  Plus,
  Rocket,
  Save,
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
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { pkskSections, states } from "./data/pksk";
import { useAccess } from "./hooks/useAccess";
import { fetchAccessStatus, fetchAppSettings, recordLastLogin } from "./services/accessService";
import {
  blockUser,
  extendPremium,
  fetchAdminKpis,
  fetchAdminQuestions,
  fetchAdminUsers,
  grantPremium,
  revokePremium,
  createManualQuestion,
  setUserRole,
  unblockUser,
  updateQuestionStatus,
} from "./services/adminService";
import { fetchBadgesWithProgress, calculatePerformance } from "./services/achievementService";
import { autosaveEssayResponse, fetchActiveEssayAttempt, getEssayAttemptPayload, startEssayAttempt, submitEssayResponse } from "./services/essayService";
import { fetchGuestPreview, scoreGuestPreview } from "./services/guestPreviewService";
import { fetchProfile, saveProfile, type ProfileInput } from "./services/profileService";
import {
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
  submitAnswer,
} from "./services/questionService";
import type { AccessStatus, AdminKpis, AdminQuestionRow, AdminUserRow, AppSettings, GuestPreviewPayload, GuestPreviewResult, SubscriptionPlan } from "./types/access";
import type { BadgeWithProgress } from "./types/achievement";
import type { ProfileRow, QuizAttemptRow } from "./types/database";
import type { EssayAttemptPayload, EssaySubmitResult } from "./types/essay";
import type { DraftReviewStatus, ImportedQuestionDraft, ManualQuestionInput, QuestionDifficulty, QuestionImportRow, QuestionImportStatus, QuestionType } from "./types/imports";
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, QuizMode } from "./types/quiz";
import { getLevelProgress } from "./utils/levelSystem";

type AppRoute =
  | "/"
  | "/preview"
  | "/premium"
  | "/login"
  | "/register"
  | "/checkout"
  | "/app"
  | "/app/simulasi"
  | "/app/latihan"
  | "/app/quiz"
  | "/app/essay"
  | "/app/profile"
  | "/app/pencapaian"
  | "/app/sejarah"
  | "/app/lencana"
  | "/app/panduan"
  | "/admin"
  | "/admin/users"
  | "/admin/subscriptions"
  | "/admin/questions"
  | "/admin/questions/import"
  | "/admin/questions/import-history"
  | "/admin/settings";
type AuthMode = "login" | "register";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const navItems: Array<{ to: AppRoute; label: string; icon: LucideIcon; authOnly?: boolean; premiumOnly?: boolean; adminOnly?: boolean }> = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, authOnly: true, premiumOnly: true },
  { to: "/app/simulasi", label: "Simulasi", icon: Target, authOnly: true, premiumOnly: true },
  { to: "/app/latihan", label: "Latihan", icon: Brain, authOnly: true, premiumOnly: true },
  { to: "/app/pencapaian", label: "Pencapaian", icon: Award, authOnly: true, premiumOnly: true },
  { to: "/app/lencana", label: "Lencana", icon: Trophy, authOnly: true, premiumOnly: true },
  { to: "/app/sejarah", label: "Sejarah", icon: History, authOnly: true, premiumOnly: true },
  { to: "/app/panduan", label: "Panduan", icon: BookOpen, authOnly: true, premiumOnly: true },
  { to: "/admin", label: "Admin Panel", icon: Users, authOnly: true, adminOnly: true },
];

const bottomNavItems = navItems.filter((item) => ["/app", "/app/simulasi", "/app/pencapaian", "/app/lencana", "/app/panduan"].includes(item.to));
const adminRoutes: AppRoute[] = ["/admin", "/admin/users", "/admin/subscriptions", "/admin/questions", "/admin/questions/import", "/admin/questions/import-history", "/admin/settings"];
const publicRoutes = new Set<AppRoute>(["/", "/preview", "/premium", "/login", "/register", "/checkout"]);
const premiumRoutes = new Set<AppRoute>([
  "/app",
  "/app/simulasi",
  "/app/latihan",
  "/app/quiz",
  "/app/essay",
  "/app/profile",
  "/app/pencapaian",
  "/app/sejarah",
  "/app/lencana",
  "/app/panduan",
]);
const validRoutes = new Set<AppRoute>(
  navItems.map((item) => item.to).concat([
    "/preview",
    "/premium",
    "/login",
    "/register",
    "/checkout",
    "/app/quiz",
    "/app/essay",
    "/app/profile",
    "/admin/users",
    "/admin/subscriptions",
    "/admin/questions",
    "/admin/questions/import",
    "/admin/questions/import-history",
    "/admin/settings",
  ]),
);
const legacyRouteMap: Record<string, AppRoute> = {
  "/simulasi": "/app/simulasi",
  "/latihan": "/app/latihan",
  "/quiz": "/app/quiz",
  "/essay": "/app/essay",
  "/profile": "/app/profile",
  "/performance": "/app/pencapaian",
  "/history": "/app/sejarah",
  "/achievements": "/app/lencana",
  "/guide": "/app/panduan",
};

const avatars = ["Cemerlang", "Berani", "Bijak", "Tekun", "Kreatif"];
const appLogoPath = "/assets/pksk-academy-logo.png";
const appLogoMarkPath = "/assets/pksk-academy-mark.png";
const rememberedEmailKey = "pksk-remembered-email";
const defaultAppSettings: AppSettings = {
  free_preview_section_a_limit: 5,
  free_preview_section_b_limit: 5,
  free_preview_section_c_enabled: false,
};
const databaseSetupMessage = "Sistem akses premium sedang disiapkan. Sila cuba semula sebentar lagi.";

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
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [badges, setBadges] = useState<BadgeWithProgress[]>([]);
  const [activePayload, setActivePayload] = useState<AttemptPayload | null>(null);
  const [result, setResult] = useState<CompleteAttemptResult | null>(null);
  const [activeEssayPayload, setActiveEssayPayload] = useState<EssayAttemptPayload | null>(null);
  const [essayResult, setEssayResult] = useState<EssaySubmitResult | null>(null);
  const [guestPayload, setGuestPayload] = useState<GuestPreviewPayload | null>(null);
  const [guestResult, setGuestResult] = useState<GuestPreviewResult | null>(null);
  const [guestAnswers, setGuestAnswers] = useState<Record<string, string>>({});
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);

  const isLoggedIn = Boolean(session?.user);
  const access = useAccess(session, profile, accessStatus);
  const profileReady = Boolean(profile?.display_name && profile?.school && profile?.state && profile?.class_name);
  const earnedBadgeCount = badges.filter((badge) => badge.earned).length;
  const performance = useMemo(() => calculatePerformance(profile, attempts, earnedBadgeCount), [attempts, earnedBadgeCount, profile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    fetchAppSettings().then(setAppSettings).catch(() => setAppSettings(defaultAppSettings));

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
      setProfile(nextProfile);
      setAccessStatus(nextAccessStatus);
      setAttempts(nextAttempts);
      setBadges(nextBadges);

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

    refreshData(session.user.id);
  }, [refreshData, session?.user.id]);

  function navigate(to: AppRoute) {
    window.history.pushState({}, "", to);
    setCurrentRoute(to);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAuth(mode: AuthMode) {
    setIsPasswordRecovery(false);
    setAuthMode(mode);
    navigate(mode === "login" ? "/login" : "/register");
  }

  function openPaywall() {
    navigate("/premium");
  }

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
      setMessage("Sistem latihan belum bersedia. Sila cuba semula selepas tetapan selesai.");
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
      setMessage("Sistem latihan belum bersedia. Sila cuba semula selepas tetapan selesai.");
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
      setMessage("Sistem latihan belum bersedia. Sila cuba semula selepas tetapan selesai.");
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
      setMessage("Sila log masuk untuk membuka latihan premium.");
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

  async function handleEssaySubmit(responseText: string) {
    if (!activeEssayPayload || !session?.user) {
      return;
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
    } catch (error) {
      setMessage(toMessage(error));
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

    setMessage(null);
    try {
      await submitAnswer(activePayload.attempt.id, questionId, optionId);
      setActivePayload({
        ...activePayload,
        questions: activePayload.questions.map((question) =>
          question.id === questionId ? { ...question, selected_option_id: optionId } : question,
        ),
      });
    } catch (error) {
      setMessage(toMessage(error));
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
    const sectionACompleted = window.localStorage.getItem("pksk-guest-preview-completed-A") === "true";
    const sectionBCompleted = window.localStorage.getItem("pksk-guest-preview-completed-B") === "true";

    if (section === "A" && sectionACompleted && !sectionBCompleted) {
      await handleStartGuestPreview("B");
      return;
    }

    if ((section === "A" && sectionACompleted && sectionBCompleted) || (section === "B" && sectionBCompleted)) {
      openPaywall();
      return;
    }

    const limit = section === "A" ? appSettings.free_preview_section_a_limit : appSettings.free_preview_section_b_limit;
    setBusy(true);
    setMessage(null);
    setGuestResult(null);
    setGuestAnswers({});
    try {
      const payload = await fetchGuestPreview(section, limit);
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
      window.localStorage.setItem(`pksk-guest-preview-completed-${guestPayload.section}`, "true");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const page = (() => {
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
          isLoggedIn={isLoggedIn}
          access={access}
          settings={appSettings}
          onNavigate={navigate}
          onStartGuestPreview={handleStartGuestPreview}
          onAuthMode={openAuth}
          onShowPaywall={openPaywall}
        />
      );
    }
    if (currentRoute === "/preview") {
      return (
        <GuestPreviewPage
          payload={guestPayload}
          answers={guestAnswers}
          result={guestResult}
          busy={busy}
          onAnswer={handleGuestAnswer}
          onComplete={handleCompleteGuestPreview}
          onNavigate={navigate}
          onShowPaywall={openPaywall}
          onAuthMode={openAuth}
          onStartGuestPreview={handleStartGuestPreview}
        />
      );
    }
    if (currentRoute === "/premium") {
      return <PaywallPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
    }
    if (currentRoute === "/checkout") {
      return <CheckoutPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
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
      return <PaywallPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
    }
    if (currentRoute === "/app") {
      return (
        <Dashboard
          isLoggedIn={isLoggedIn}
          access={access}
          profile={profile}
          profileReady={profileReady}
          performance={performance}
          activePayload={activePayload}
          activeEssayPayload={activeEssayPayload}
          settings={appSettings}
          onNavigate={navigate}
          onResume={handleResumeQuiz}
          onResumeEssay={handleResumeEssay}
          onStartQuiz={handleStartQuiz}
          onStartEssay={handleStartEssay}
          onStartGuestPreview={handleStartGuestPreview}
          onAuthMode={openAuth}
          onShowPaywall={openPaywall}
        />
      );
    }
    if (currentRoute === "/app/simulasi" || currentRoute === "/app/latihan") {
      return <ModePage isLoggedIn={isLoggedIn} busy={busy} onStartQuiz={handleStartQuiz} onStartEssay={handleStartEssay} onNavigate={navigate} />;
    }
    if (currentRoute === "/app/quiz") {
      return (
        <QuizPage
          payload={activePayload}
          result={result}
          busy={busy}
          onAnswer={handleAnswer}
          onComplete={handleCompleteAttempt}
          onNavigate={navigate}
        />
      );
    }
    if (currentRoute === "/app/essay") {
      return (
        <EssayPage
          payload={activeEssayPayload}
          result={essayResult}
          busy={busy}
          onAutosave={handleEssayAutosave}
          onSubmit={handleEssaySubmit}
          onNavigate={navigate}
          onStartEssay={handleStartEssay}
        />
      );
    }
    if (currentRoute === "/app/profile") {
      return <ProfilePage profile={profile} busy={busy} onSave={handleProfileSave} />;
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
        onNavigate={navigate}
        onMenu={() => setIsMenuOpen((current) => !current)}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 lg:px-8 lg:pb-16">
        {message ? <MessageBanner message={message} onDismiss={() => setMessage(null)} /> : null}
        {page}
      </main>

      {!publicRoutes.has(currentRoute) ? <BottomNav currentRoute={currentRoute} isLoggedIn={isLoggedIn} access={access} onNavigate={navigate} /> : null}
      <InstallAppButton
        showHelp={showInstallHelp}
        isInstalled={isInstalledApp}
        onInstall={handleInstallApp}
        onCloseHelp={() => setShowInstallHelp(false)}
      />
    </div>
  );
}

function TopBar({
  currentRoute,
  isLoggedIn,
  access,
  isMenuOpen,
  profile,
  onNavigate,
  onMenu,
  onSignOut,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  isMenuOpen: boolean;
  profile: ProfileRow | null;
  onNavigate: (route: AppRoute) => void;
  onMenu: () => void;
  onSignOut: () => void;
}) {
  const isPublicShell = publicRoutes.has(currentRoute);
  const marketingLinks: Array<{ to: AppRoute; label: string; tone?: "primary" | "secondary" }> = isLoggedIn
    ? access.canUsePremiumFeature()
      ? [{ to: "/app", label: "Buka PKSK Academy", tone: "primary" }]
      : [{ to: "/premium", label: "Dapatkan Premium", tone: "primary" }]
    : [
        { to: "/preview", label: "Cuba Percuma" },
        { to: "/premium", label: "Premium" },
        { to: "/login", label: "Log Masuk", tone: "secondary" },
      ];

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

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
          {isPublicShell
            ? currentRoute === "/"
              ? null
              : marketingLinks.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => onNavigate(item.to)}
                    className={item.tone === "primary" ? "primary-button h-10 px-4 py-0" : "secondary-button h-10 px-4 py-0"}
                  >
                    {item.label}
                  </button>
                ))
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
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => onNavigate(item.to)}
                    className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                      currentRoute === item.to
                        ? "bg-ocean-50 text-ocean-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <item.icon size={17} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {isLoggedIn && !isPublicShell ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate("/app/profile")}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700"
              >
                <UserRound size={17} aria-hidden="true" />
                {profile?.display_name ?? "Profil"}
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
              ? marketingLinks.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => onNavigate(item.to)}
                    className={`flex h-11 items-center rounded-xl px-3 text-left text-sm font-semibold ${
                      currentRoute === item.to ? "bg-ocean-50 text-ocean-700" : "text-slate-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))
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
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => onNavigate(item.to)}
                      className={`flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${
                        currentRoute === item.to ? "bg-ocean-50 text-ocean-700" : "text-slate-600"
                      }`}
                    >
                      <item.icon size={17} aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
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
  onNavigate,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Navigasi bawah">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {bottomNavItems.map((item) => {
          const disabled = (item.authOnly && !isLoggedIn) || (item.premiumOnly && !access.canUsePremiumFeature()) || (item.adminOnly && !access.isAdmin);
          return (
            <button
              key={item.to}
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(item.to)}
              className={`grid min-h-[56px] place-items-center rounded-xl px-1 text-[11px] font-bold ${
                currentRoute === item.to ? "bg-ocean-50 text-ocean-700" : "text-slate-500"
              } ${disabled ? "opacity-40" : ""}`}
            >
              <item.icon size={19} aria-hidden="true" />
              {item.label}
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{mode === "login" ? "Log Masuk" : "Daftar Akaun"}</h2>
          <p className="text-sm leading-6 text-slate-500">
            {mode === "login" ? "Sambung latihan tanpa perlu isi e-mel berulang kali." : "Cipta akaun untuk simpan rekod latihan sendiri."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onMode(mode === "login" ? "register" : "login")}
          className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
        >
          {mode === "login" ? "Daftar" : "Log masuk"}
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
  isLoggedIn,
  access,
  settings,
  onNavigate,
  onStartGuestPreview,
  onAuthMode,
  onShowPaywall,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  settings: AppSettings;
  onNavigate: (route: AppRoute) => void;
  onStartGuestPreview: (section: "A" | "B") => void;
  onAuthMode: (mode: AuthMode) => void;
  onShowPaywall: () => void;
}) {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="grid lg:min-h-[520px] lg:grid-cols-[1.02fr_0.98fr]">
          <div className="relative min-h-[260px] lg:min-h-[520px]">
            <img src="/assets/pksk-hero.png" alt="Murid Tahun 6 berlatih secara tersusun" className="h-full w-full object-cover object-left" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-8 lg:p-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-ocean-50 px-3 py-2 text-sm font-black text-ocean-700">
              <GraduationCap size={17} aria-hidden="true" />
              PKSK Academy oleh CikguSTEM
            </div>
            <div className="max-w-2xl space-y-4">
              <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Persediaan PKSK yang lebih yakin dan tersusun.</h1>
              <p className="text-base leading-7 text-slate-600 sm:text-lg">
                Berlatih melalui simulasi, soalan rawak dan rekod pencapaian dalam platform yang sesuai untuk calon Tahun 6 dan ibu bapa.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="primary-button" onClick={() => onStartGuestPreview("A")}>
                Cuba Percuma
              </button>
              <button type="button" className="secondary-button" onClick={onShowPaywall}>
                Dapatkan Premium
              </button>
            </div>
            <button
              type="button"
              className="w-fit text-sm font-black text-ocean-700 hover:text-ocean-900"
              onClick={() => (isLoggedIn && access.canUsePremiumFeature() ? onNavigate("/app") : onAuthMode("login"))}
            >
              {isLoggedIn && access.canUsePremiumFeature() ? "Buka PKSK Academy" : "Log Masuk"}
            </button>
          </div>
        </div>
      </section>

      <FreePreviewSection settings={settings} onStartGuestPreview={onStartGuestPreview} onShowPaywall={onShowPaywall} />

      <section className="grid gap-5 md:grid-cols-3">
        <FeatureCard icon={ShieldCheck} title="Simulasi Berstruktur" text="Latihan penuh dan latihan mengikut bahagian membantu murid membiasakan diri dengan format PKSK." />
        <FeatureCard icon={Zap} title="Soalan Rawak" text="Setiap cubaan menyusun soalan dan pilihan jawapan supaya ulang kaji tidak terasa sama." />
        <FeatureCard icon={Award} title="Rekod Kemajuan" text="Premium menyimpan sejarah, prestasi, XP, level dan lencana pencapaian murid." />
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="rounded-2xl bg-white p-6 shadow-soft">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
        <Icon size={23} aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </article>
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
  activePayload,
  activeEssayPayload,
  settings,
  onNavigate,
  onResume,
  onResumeEssay,
  onStartQuiz,
  onStartEssay,
  onStartGuestPreview,
  onAuthMode,
  onShowPaywall,
}: {
  isLoggedIn: boolean;
  access: ReturnType<typeof useAccess>;
  profile: ProfileRow | null;
  profileReady: boolean;
  performance: ReturnType<typeof calculatePerformance>;
  activePayload: AttemptPayload | null;
  activeEssayPayload: EssayAttemptPayload | null;
  settings: AppSettings;
  onNavigate: (route: AppRoute) => void;
  onResume: () => void;
  onResumeEssay: () => void;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
  onStartEssay: () => void;
  onStartGuestPreview: (section: "A" | "B") => void;
  onAuthMode: (mode: AuthMode) => void;
  onShowPaywall: () => void;
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
              Latihan rawak setiap kali mula
            </div>
            <div className="max-w-[330px] space-y-4 sm:max-w-xl">
              <h1 className="break-words text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                {isLoggedIn ? `Selamat kembali, ${displayName}` : "PKSK Academy oleh CikguSTEM"}
              </h1>
              <p className="break-words text-base leading-7 text-slate-600 sm:text-lg">
                {isLoggedIn
                  ? "Jalankan simulasi, latihan rawak, Studio Penulisan Bahagian C dan rekod pencapaian dalam satu tempat."
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
              </div>
            ) : null}
            <div className="flex max-w-[330px] flex-col gap-3 sm:max-w-none sm:flex-row">
              {isLoggedIn ? (
                <>
                  <button type="button" onClick={() => (access.isPremium ? onNavigate(profileReady ? "/app/simulasi" : "/app/profile") : onShowPaywall())} className="primary-button">
                    {access.isPremium ? (profileReady ? "Mula Latihan" : "Lengkapkan Profil") : "Buka Akses Premium"}
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

      {!isLoggedIn ? (
        <FreePreviewSection settings={settings} onStartGuestPreview={onStartGuestPreview} onShowPaywall={onShowPaywall} />
      ) : null}

      {isLoggedIn && !access.isPremium ? <InlinePaywall access={access} onShowPaywall={onShowPaywall} /> : null}

      {isLoggedIn && access.isPremium ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard icon={Rocket} label="Jumlah Cubaan" value={`${performance.totalAttempts}`} tone="bg-ocean-50 text-ocean-700" />
            <StatCard icon={Star} label="Skor Terbaik" value={`${performance.bestScore}%`} tone="bg-sun-50 text-amber-700" />
            <StatCard icon={Zap} label="Jumlah Mata" value={`${performance.totalXp}`} tone="bg-coral-50 text-coral-600" />
            <StatCard icon={Trophy} label="Lencana" value={`${performance.badgeCount}`} tone="bg-leaf-50 text-leaf-600" />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <ModeCard title="Simulasi Penuh" text="Campuran Bahagian A dan B secara rawak." icon={ShieldCheck} onClick={() => onStartQuiz("full", null, 30)} />
            <ModeCard title="Latihan Mengikut Bahagian" text="Pilih Bahagian A, B atau C untuk fokus." icon={Brain} onClick={() => onNavigate("/app/latihan")} />
            <ModeCard title="Cabaran Pantas" text="10 soalan pendek untuk ulang kaji harian." icon={Clock3} onClick={() => onStartQuiz("quick", null, 10)} />
            <ModeCard title="Studio Penulisan" text="Bahagian C dengan editor, timer dan autosave." icon={PenLine} onClick={onStartEssay} />
            <ModeCard title="Pencapaian" text="Semak analisis prestasi dan perkembangan latihan." icon={Award} onClick={() => onNavigate("/app/pencapaian")} />
            <ModeCard title="Lencana" text="Lihat lencana yang sudah dibuka dan sasaran seterusnya." icon={Trophy} onClick={() => onNavigate("/app/lencana")} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function FreePreviewSection({
  settings,
  onStartGuestPreview,
  onShowPaywall,
}: {
  settings: AppSettings;
  onStartGuestPreview: (section: "A" | "B") => void;
  onShowPaywall: () => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-6 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <Sparkles size={23} aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-black uppercase text-ocean-700">Preview Percuma</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Cuba PKSK Percuma</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Jawab {settings.free_preview_section_a_limit} soalan Bahagian A dan {settings.free_preview_section_b_limit} soalan Bahagian B sebelum melihat pilihan Premium.
        </p>
        <button type="button" className="primary-button mt-5 w-full" onClick={() => onStartGuestPreview("A")}>
          Mula Preview
        </button>
      </article>
      <article className="rounded-2xl bg-white p-6 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sun-100 text-amber-700">
          <Crown size={23} aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-black uppercase text-amber-700">Akses Premium</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Latihan Tanpa Had</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Nikmati simulasi tanpa had, bank soalan penuh, rekod prestasi, sejarah cubaan, XP, level dan lencana.
        </p>
        <button type="button" className="secondary-button mt-5 w-full" onClick={onShowPaywall}>
          Lihat Premium
        </button>
      </article>
    </section>
  );
}

function InlinePaywall({ access, onShowPaywall }: { access: ReturnType<typeof useAccess>; onShowPaywall: () => void }) {
  const title = access.isBlocked ? "Akaun memerlukan semakan" : access.isExpired ? "Akses premium telah tamat" : "Akses penuh belum aktif";
  const text = access.isBlocked
    ? "Sila hubungi pentadbir untuk membuka semula akses latihan."
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

function GuestPreviewPage({
  payload,
  answers,
  result,
  busy,
  onAnswer,
  onComplete,
  onNavigate,
  onShowPaywall,
  onAuthMode,
  onStartGuestPreview,
}: {
  payload: GuestPreviewPayload | null;
  answers: Record<string, string>;
  result: GuestPreviewResult | null;
  busy: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onComplete: () => void;
  onNavigate: (route: AppRoute) => void;
  onShowPaywall: () => void;
  onAuthMode: (mode: AuthMode) => void;
  onStartGuestPreview: (section: "A" | "B") => void;
}) {
  if (!payload) {
    return (
      <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
          <Sparkles size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-black">Preview Percuma PKSK</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">Cuba soalan contoh Bahagian A dan Bahagian B tanpa daftar akaun.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" className="primary-button" onClick={() => onStartGuestPreview("A")}>
            Mula Preview
          </button>
          <button type="button" className="secondary-button" onClick={() => onNavigate("/")}>
            Kembali
          </button>
        </div>
      </section>
    );
  }

  const allAnswered = payload.questions.every((question) => Boolean(answers[question.id]));

  return (
    <div className="space-y-6">
      <PageHeader icon={Sparkles} title={`Preview Percuma Bahagian ${payload.section}`} text="Jawab soalan contoh ini dahulu. Tiada akaun diperlukan." />
      <section className="grid gap-4">
        {payload.questions.map((question, index) => (
          <article key={question.id} className="rounded-2xl bg-white p-5 shadow-soft">
            <p className="text-sm font-black text-ocean-700">Soalan {index + 1}</p>
            <h2 className="mt-2 text-lg font-black leading-7 text-slate-950">{question.question_text}</h2>
            {question.question_image_url ? <QuestionImage src={question.question_image_url} /> : null}
            <div className="mt-5 grid gap-3">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onAnswer(question.id, option.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${
                      selected ? "border-ocean-500 bg-ocean-50 text-ocean-800" : "border-slate-200 bg-white text-slate-700 hover:border-ocean-200"
                    }`}
                  >
                    <OptionContent text={option.option_text} imageUrl={option.option_image_url ?? null} />
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>
      {result ? (
        <section className="rounded-2xl border border-sun-200 bg-sun-50 p-6 shadow-soft">
          <h2 className="text-2xl font-black">{payload.section === "A" ? "Bahagian A selesai." : "Anda telah menyelesaikan versi percuma."}</h2>
          <p className="mt-2 text-lg font-black text-ocean-700">
            Skor ringkas: {result.correct_answers}/{result.total_questions} betul ({result.percentage}%)
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
            {payload.section === "A"
              ? "Teruskan dengan preview Bahagian B untuk lengkapkan versi percuma."
              : "Naik taraf ke Premium untuk membuka akses penuh."}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {payload.section === "A" ? (
              <button type="button" className="primary-button" onClick={() => onStartGuestPreview("B")}>
                Teruskan Bahagian B
              </button>
            ) : (
              <>
                <button type="button" className="primary-button" onClick={onShowPaywall}>
                  Daftar & Dapatkan Premium
                </button>
                <button type="button" className="secondary-button" onClick={() => onAuthMode("login")}>
                  Sudah ada akaun? Log Masuk
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <button type="button" className="primary-button w-full sm:w-auto" disabled={busy || !allAnswered} onClick={onComplete}>
          {busy ? "Menyemak..." : "Semak Jawapan"}
        </button>
      )}
    </div>
  );
}

function PaywallPage({
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
  const primaryLabel = access.canUsePremiumFeature() ? "Buka PKSK Academy" : isLoggedIn ? "Teruskan ke Checkout" : "Dapatkan Premium";
  const handlePrimary = () => {
    if (access.canUsePremiumFeature()) {
      onNavigate("/app");
      return;
    }
    if (isLoggedIn) {
      onNavigate("/checkout");
      return;
    }
    onAuth("register");
  };
  const statusText = access.isBlocked
    ? "Akaun ini sedang disemak oleh pentadbir."
    : access.isExpired
      ? "Akses premium telah tamat."
      : isLoggedIn
        ? "Akaun anda belum mempunyai akses premium."
        : "Naik taraf ke Premium untuk membuka akses penuh. Sudah mempunyai akaun Premium? Log masuk untuk meneruskan latihan.";

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="min-h-[240px] lg:min-h-[520px]">
            <img src="/assets/pksk-hero.png" alt="PKSK Academy oleh CikguSTEM" className="h-full w-full object-cover object-left" />
          </div>
          <div className="flex flex-col justify-center gap-6 p-6 sm:p-8 lg:p-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-sun-100 px-3 py-2 text-sm font-black text-amber-700">
              <Crown size={17} aria-hidden="true" />
              Premium PKSK Academy
            </div>
            <div>
              <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Latihan PKSK yang lebih lengkap, tersusun dan boleh dipantau.</h1>
              <p className="mt-4 text-base leading-7 text-slate-600">{statusText}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="primary-button" onClick={handlePrimary}>
                {primaryLabel}
              </button>
              {!access.canUsePremiumFeature() ? (
                <button type="button" className="secondary-button" onClick={() => (isLoggedIn ? onNavigate("/preview") : onAuth("login"))}>
                  {isLoggedIn ? "Cuba Preview" : "Sudah ada akaun? Log Masuk"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.6fr_1.4fr]">
        <article className="rounded-2xl bg-white p-6 shadow-soft">
          <p className="text-sm font-black uppercase text-ocean-700">Apa itu PKSK Academy?</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Platform latihan PKSK oleh CikguSTEM</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            PKSK Academy membantu calon Tahun 6 membuat latihan secara lebih konsisten melalui simulasi, latihan mengikut bahagian dan rekod perkembangan.
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
          <FaqItem title="Adakah payment sudah aktif?" text="Belum. Pembayaran akan ditambah pada fasa akan datang; admin masih boleh aktifkan Premium untuk testing." />
          <FaqItem title="Bagaimana Premium diaktifkan nanti?" text="Melalui server webhook selepas bayaran berjaya, bukan melalui parameter frontend seperti paid=true." />
        </div>
        <div className="mt-6">
          <button type="button" className="primary-button" onClick={handlePrimary}>
            {primaryLabel}
          </button>
        </div>
      </section>
    </div>
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
          <h1 className="text-3xl font-black">Pembayaran dalam proses pembangunan.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Untuk fasa ini, akses Premium masih boleh diberikan melalui Admin Panel. Payment gateway akan disambungkan kemudian melalui server webhook.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5 text-left">
          <h2 className="text-lg font-black">Flow masa depan</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            User register atau login, teruskan checkout, payment provider sahkan bayaran, server webhook update Supabase
            `subscription_status`, `subscription_started_at` dan `subscription_ends_at`, kemudian user masuk ke `/app`.
          </p>
        </div>
        <button type="button" className="secondary-button mx-auto" onClick={() => onNavigate("/premium")}>
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
  const items: Array<{ to: AppRoute; label: string }> = [
    { to: "/admin", label: "Admin Dashboard" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/subscriptions", label: "Subscriptions" },
    { to: "/admin/questions", label: "Question Bank" },
    { to: "/admin/questions/import-history", label: "Import History" },
    { to: "/admin/settings", label: "System Settings" },
  ];
  function navigateAdmin(to: AppRoute) {
    navigateAdminRoute(to);
  }

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-soft" aria-label="Admin navigation">
      {items.map((item) => (
        <button key={item.to} type="button" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-ocean-50 hover:text-ocean-700" onClick={() => navigateAdmin(item.to)}>
          {item.label}
        </button>
      ))}
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
    <AdminShell title="Admin Dashboard" text="Pantau pengguna, akses premium dan aktiviti latihan.">
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

function AdminQuestionsPage({ onMessage }: { onMessage: (message: string | null) => void }) {
  const [questions, setQuestions] = useState<AdminQuestionRow[]>([]);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<AdminQuestionRow | null>(null);

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

  return (
    <AdminShell title="Question Bank" text="Import PDF, semak draft, dan urus status soalan tanpa metadata berat.">
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
          <button type="button" className="secondary-button" onClick={() => onMessage("Import Excel/CSV akan ditambah selepas workflow PDF stabil.")}>
            <FileSpreadsheet size={18} aria-hidden="true" />
            Import Excel/CSV
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
                  <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600" onClick={() => onMessage("Edit penuh soalan sedia ada akan disambung dalam fasa selepas import PDF stabil.")}>
                    <PenLine size={14} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                    onClick={() => runStatusAction(() => updateQuestionStatus(question.id, !question.is_active, false), question.is_active ? "Soalan dinyahaktifkan." : "Soalan diaktifkan.")}
                    disabled={archived}
                  >
                    {question.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-coral-50 px-3 py-2 text-xs font-black text-coral-600"
                    onClick={() => runStatusAction(() => updateQuestionStatus(question.id, false, true), "Soalan diarkibkan.")}
                    disabled={archived}
                  >
                    Archive
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {questions.length === 0 ? <EmptyAdminPanel title="Tiada soalan ditemui" text="Cuba ubah filter atau import PDF baharu." /> : null}
      </section>

      {manualOpen ? <ManualQuestionModal onClose={() => setManualOpen(false)} onCreated={loadQuestions} onMessage={onMessage} /> : null}
      {selectedQuestion ? <QuestionViewModal question={selectedQuestion} onClose={() => setSelectedQuestion(null)} /> : null}
    </AdminShell>
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

  async function runImportAction(action: () => Promise<void>, successMessage: string) {
    setBusyAction(true);
    onMessage(null);
    try {
      await action();
      await loadImport();
      onMessage(successMessage);
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction(false);
    }
  }

  const highConfidenceIds = drafts.filter((draft) => !draft.imported_question_id && confidenceLevel(draft.confidence) === "High").map((draft) => draft.id);
  const approvedCount = drafts.filter((draft) => draft.review_status === "approved" && !draft.imported_question_id).length;

  return (
    <AdminShell title="Import PDF" text="Upload PDF, biarkan sistem ekstrak, semak draft, kemudian publish ke bank soalan.">
      {!importRow ? (
        <section className="rounded-2xl bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
              <FileUp size={24} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-black">Step 1: Upload PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Admin hanya perlu pilih PDF dan beri nama sumber jika mahu. Metadata akan dicadangkan kemudian.</p>
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
              {busyAction ? "Uploading..." : "Upload PDF"}
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
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="secondary-button" disabled={busyAction || importRow.status === "processing"} onClick={() => runImportAction(() => processPdfImport(importRow.id), "Pemprosesan PDF dimulakan.")}>
                  Process PDF
                </button>
                <button type="button" className="secondary-button" disabled={busyAction || highConfidenceIds.length === 0} onClick={() => runImportAction(() => setImportDraftStatus(highConfidenceIds, "approved"), "Semua draft high confidence diluluskan.")}>
                  Approve All High Confidence
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
                  Import Approved Questions
                </button>
              </div>
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
            {drafts.length === 0 ? <EmptyAdminPanel title="Belum ada draft" text="Klik Process PDF selepas upload. Draft akan muncul di sini untuk disemak." /> : null}
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
    <AdminShell title="Import History" text="Buka semula PDF yang pernah diimport dan teruskan semakan draft.">
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
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [correctLabel, setCorrectLabel] = useState("A");
  const [options, setOptions] = useState(() => defaultDraftOptions());
  const [busy, setBusy] = useState(false);

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
    onMessage("Cadangan metadata awal diisi. AI server-side boleh ditambah pada fungsi ini selepas OPENAI_API_KEY disediakan.");
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
            <textarea className="field" value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Tulis soalan di sini" required />
          </Label>
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

function QuestionViewModal({ question, onClose }: { question: AdminQuestionRow; onClose: () => void }) {
  return (
    <section className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-ocean-700">
              Bahagian {question.section} / {question.category ?? "Umum"} / {question.difficulty}
            </p>
            <h2 className="mt-2 text-2xl font-black">Soalan</h2>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {question.question_image_url ? <img src={question.question_image_url} alt="" className="mt-5 max-h-80 rounded-xl border border-slate-200 object-contain" /> : null}
        <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-800">{question.question_text}</p>
        <div className="mt-5 grid gap-2 text-sm text-slate-600">
          <SummaryRow label="Source" value={question.source_title ?? "Manual"} />
          <SummaryRow label="Status" value={questionStatusLabel(question)} />
          <SummaryRow label="Topik" value={question.topic ?? "-"} />
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
  onSave: (draft: ImportedQuestionDraft) => Promise<void>;
  onStatus: (status: DraftReviewStatus) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [localDraft, setLocalDraft] = useState(draft);

  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  const confidence = confidenceLevel(localDraft.confidence);

  function updateOption(index: number, value: string) {
    setLocalDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, option_text: value } : option)),
    }));
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
              <input className="field" value={localDraft.correct_option_label ?? ""} onChange={(event) => setLocalDraft({ ...localDraft, correct_option_label: event.target.value.toUpperCase() })} />
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
          {localDraft.question_type === "objective" ? (
            <div className="grid gap-3">
              {localDraft.options.map((option, index) => (
                <div key={option.id ?? `${option.option_label}-${index}`} className="grid gap-2 sm:grid-cols-[64px_1fr]">
                  <span className="grid h-12 place-items-center rounded-xl bg-white text-sm font-black text-slate-600">{option.option_label ?? optionLabels[index] ?? index + 1}</span>
                  <input className="field" value={option.option_text ?? ""} onChange={(event) => updateOption(index, event.target.value)} placeholder="Teks pilihan" />
                </div>
              ))}
            </div>
          ) : null}
          <button type="button" className="primary-button w-full sm:w-auto" onClick={() => onSave(localDraft)}>
            Simpan Edit
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

function defaultDraftOptions() {
  return optionLabels.map((label, index) => ({
    option_label: label,
    option_text: "",
    option_image_url: null,
    is_correct: label === "A",
    sort_order: index + 1,
  }));
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
    <AdminShell title="Subscriptions" text="Pelan disediakan untuk workflow manual premium. Payment gateway belum ditambah.">
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
    return <LockedState title="Log masuk diperlukan" text="Cipta akaun atau log masuk dahulu untuk simpan cubaan dan mata latihan." onNavigate={onNavigate} />;
  }
  return (
    <div className="space-y-6">
      <PageHeader icon={Target} title="Pilih Latihan" text="Setiap cubaan akan menyusun soalan dan pilihan jawapan secara rawak." />
      <div className="grid gap-5 lg:grid-cols-3">
        <ModeCard title="Simulasi Penuh" text="30 soalan rawak Bahagian A dan B." icon={ShieldCheck} disabled={busy} onClick={() => onStartQuiz("full", null, 30)} />
        <ModeCard title="Bahagian A" text="10 soalan Kecerdasan Insaniah." icon={HeartHandshake} disabled={busy} onClick={() => onStartQuiz("section", "A", 10)} />
        <ModeCard title="Bahagian B" text="15 soalan Kecerdasan Intelek." icon={Brain} disabled={busy} onClick={() => onStartQuiz("section", "B", 15)} />
        <ModeCard title="Cabaran Pantas" text="10 soalan rawak pendek." icon={Zap} disabled={busy} onClick={() => onStartQuiz("quick", null, 10)} />
        <ModeCard title="Bahagian C" text="Tajuk karangan rawak dengan editor penulisan, timer dan autosave." icon={PenLine} disabled={busy} onClick={onStartEssay} />
      </div>
    </div>
  );
}

function EssayPage({
  payload,
  result,
  busy,
  onAutosave,
  onSubmit,
  onNavigate,
  onStartEssay,
}: {
  payload: EssayAttemptPayload | null;
  result: EssaySubmitResult | null;
  busy: boolean;
  onAutosave: (responseText: string) => Promise<{ word_count: number; autosaved_at: string } | null>;
  onSubmit: (responseText: string) => void;
  onNavigate: (route: AppRoute) => void;
  onStartEssay: () => void;
}) {
  const [responseText, setResponseText] = useState(payload?.response.response_text ?? "");
  const [lastSavedText, setLastSavedText] = useState(payload?.response.response_text ?? "");
  const [saveStatus, setSaveStatus] = useState(payload?.response.autosaved_at ? `Disimpan ${formatTimeOnly(payload.response.autosaved_at)}` : "Belum disimpan");
  const [remainingSeconds, setRemainingSeconds] = useState(() => essayRemainingSeconds(payload));
  const wordCount = useMemo(() => countWords(responseText), [responseText]);
  const minWords = payload?.question.essay_min_words ?? 80;

  useEffect(() => {
    setResponseText(payload?.response.response_text ?? "");
    setLastSavedText(payload?.response.response_text ?? "");
    setSaveStatus(payload?.response.autosaved_at ? `Disimpan ${formatTimeOnly(payload.response.autosaved_at)}` : "Belum disimpan");
    setRemainingSeconds(essayRemainingSeconds(payload));
  }, [payload]);

  useEffect(() => {
    if (!payload || result) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds(essayRemainingSeconds(payload));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [payload, result]);

  useEffect(() => {
    if (!payload || result || responseText === lastSavedText) {
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
  }, [lastSavedText, onAutosave, payload, responseText, result]);

  if (result) {
    return <EssayResultPanel result={result} onNavigate={onNavigate} onStartEssay={onStartEssay} />;
  }

  if (!payload) {
    return (
      <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
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

  return (
    <div className="grid gap-6 lg:grid-cols-[0.68fr_0.32fr]">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Bahagian C / {payload.question.topic ?? "Artikulasi Penulisan"}</p>
            <h1 className="mt-2 text-2xl font-black leading-snug text-slate-950">{payload.question.question_text}</h1>
          </div>
          <span className="w-fit rounded-xl bg-sun-50 px-4 py-2 text-sm font-black text-amber-700">AI marking akan datang</span>
        </div>

        {payload.question.question_image_url ? <QuestionImage src={payload.question.question_image_url} /> : null}

        <div className="mt-5">
          <label className="grid gap-3">
            <span className="text-sm font-black text-slate-700">Karangan anda</span>
            <textarea
              className="field min-h-[420px] text-base leading-8"
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              placeholder="Tulis karangan di sini. Jawapan akan disimpan automatik semasa anda menaip."
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-500">{saveStatus}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="secondary-button" onClick={() => onNavigate("/app/simulasi")}>
              Kembali
            </button>
            <button type="button" className="primary-button" disabled={busy || responseText.trim().length === 0} onClick={() => onSubmit(responseText)}>
              {busy ? "Menghantar..." : "Submit Karangan"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-black">Status Penulisan</h2>
          <div className="mt-5 grid gap-3">
            <SummaryRow label="Masa" value={formatTimer(remainingSeconds)} />
            <SummaryRow label="Patah perkataan" value={`${wordCount}`} />
            <SummaryRow label="Sasaran" value={`${minWords}+ perkataan`} />
            <SummaryRow label="Autosave" value={saveStatus.replace("Disimpan ", "")} />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.min(100, Math.round((wordCount / Math.max(1, minWords)) * 100))}%` }} />
          </div>
        </section>

        <section className="rounded-2xl border border-ocean-100 bg-ocean-50 p-6">
          <h2 className="text-lg font-black text-ocean-900">Tip Ringkas</h2>
          <div className="mt-4 grid gap-3 text-sm font-semibold leading-6 text-slate-700">
            <p>Mulakan dengan pendahuluan yang jelas.</p>
            <p>Isi karangan boleh disusun dalam 2 hingga 3 perenggan.</p>
            <p>Akhiri dengan penutup yang merumuskan idea utama.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function EssayResultPanel({ result, onNavigate, onStartEssay }: { result: EssaySubmitResult; onNavigate: (route: AppRoute) => void; onStartEssay: () => void }) {
  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
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

function QuizPage({
  payload,
  result,
  busy,
  onAnswer,
  onComplete,
  onNavigate,
}: {
  payload: AttemptPayload | null;
  result: CompleteAttemptResult | null;
  busy: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onComplete: () => void;
  onNavigate: (route: AppRoute) => void;
}) {
  const [index, setIndex] = useState(0);

  if (result) {
    return <ResultPanel result={result} onNavigate={onNavigate} />;
  }

  if (!payload) {
    return <EmptyState title="Tiada cubaan aktif" text="Mulakan simulasi baharu atau sambung cubaan yang belum selesai." onNavigate={onNavigate} />;
  }

  const current = payload.questions[index];
  const answered = payload.questions.filter((question) => question.selected_option_id).length;
  const complete = answered === payload.questions.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between gap-4">
          <span className="rounded-xl bg-ocean-50 px-3 py-2 text-sm font-black text-ocean-700">
            Soalan {index + 1} / {payload.questions.length}
          </span>
          <span className="text-sm font-bold text-slate-500">{current.section} - {current.category}</span>
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
                current.selected_option_id === option.id ? "border-ocean-500 bg-ocean-50 text-ocean-800" : "border-slate-200 bg-white hover:border-ocean-200"
              }`}
            >
              <OptionContent text={option.option_text} imageUrl={option.option_image_url ?? null} />
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex((currentIndex) => Math.max(0, currentIndex - 1))}>
            Sebelum
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => (index < payload.questions.length - 1 ? setIndex((currentIndex) => currentIndex + 1) : onComplete())}
            disabled={busy || (index === payload.questions.length - 1 && !complete)}
          >
            {index < payload.questions.length - 1 ? "Seterusnya" : busy ? "Mengira..." : "Hantar Keputusan"}
          </button>
        </div>
      </section>

      <aside className="rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-lg font-black">Kemajuan</h2>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.round((answered / payload.questions.length) * 100)}%` }} />
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-600">
          {answered} daripada {payload.questions.length} dijawab.
        </p>
        <div className="mt-5 grid grid-cols-5 gap-2">
          {payload.questions.map((question, questionIndex) => (
            <button
              key={question.id}
              type="button"
              onClick={() => setIndex(questionIndex)}
              className={`grid h-10 place-items-center rounded-xl text-sm font-black ${
                questionIndex === index
                  ? "bg-ocean-600 text-white"
                  : question.selected_option_id
                    ? "bg-leaf-50 text-leaf-600"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {questionIndex + 1}
            </button>
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

function ResultPanel({ result, onNavigate }: { result: CompleteAttemptResult; onNavigate: (route: AppRoute) => void }) {
  return (
    <section className="rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sun-100 text-amber-700">
        <Trophy size={30} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-black">Keputusan Disimpan</h1>
      <p className="mt-3 text-slate-600">
        {result.correct_answers} / {result.total_questions} betul - {result.percentage}%
      </p>
      <p className="mt-2 text-lg font-black text-ocean-700">+{result.xp_earned} mata</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
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
        <PageHeader icon={UserRound} title="Profil Calon" text="Lengkapkan maklumat ringkas supaya kemajuan latihan lebih tersusun." compact />
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
    return <LockedState title="Prestasi peribadi dikunci" text="Log masuk untuk melihat sejarah markah dan mata latihan." onNavigate={onNavigate} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Award} title="Prestasi Saya" text="Lihat perkembangan latihan, markah terbaik dan lencana yang telah dibuka." />
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
                <div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.min(100, Number(attempt.percentage))}%` }} />
              </div>
              <span className="text-sm font-black text-slate-900">{attempt.percentage}%</span>
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
      <PageHeader icon={History} title="Sejarah Cubaan" text="Semak semula rekod latihan yang telah selesai." />
      <section className="grid gap-4">
        {attempts.map((attempt, index) => (
          <article key={attempt.id} className="rounded-2xl bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Simulasi #{attempts.length - index}</h2>
                <p className="text-sm text-slate-500">{formatDate(attempt.started_at)}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Skor" value={`${attempt.percentage}%`} />
                <Metric label="Betul" value={`${attempt.correct_answers}/${attempt.total_questions}`} />
                <Metric label="Mata" value={`+${attempt.xp_earned}`} />
              </div>
            </div>
          </article>
        ))}
        {attempts.length === 0 ? <EmptyState title="Belum ada sejarah" text="Mulakan latihan pertama untuk melihat rekod di sini." onNavigate={onNavigate} /> : null}
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
      <PageHeader icon={Trophy} title="Lencana" text="Kumpul lencana apabila berjaya mencapai sasaran latihan." />
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

function GuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader icon={BookOpen} title="Panduan" text="Kenali bahagian utama PKSK dan pilih latihan yang sesuai." />
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
          <StepCard number="1" title="Lengkapkan profil" text="Masukkan nama, sekolah dan kelas supaya rekod latihan tersimpan dengan kemas." />
          <StepCard number="2" title="Pilih latihan" text="Cuba simulasi penuh, ulang kaji mengikut bahagian atau cabaran pantas harian." />
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
          <h1 className="text-2xl font-black">Sistem latihan belum bersedia</h1>
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
        Mula Latihan
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeOnly(value: string): string {
  return new Intl.DateTimeFormat("ms-MY", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function countWords(value: string): number {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function essayRemainingSeconds(payload: EssayAttemptPayload | null): number {
  if (!payload) {
    return 0;
  }
  const limitMinutes = payload.question.essay_time_limit ?? 30;
  const limitSeconds = limitMinutes * 60;
  const startedAt = new Date(payload.attempt.started_at).getTime();
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

function getCurrentRoute(): AppRoute {
  const rawPath = window.location.pathname.replace(/\/$/, "") || "/";
  const legacyTarget = legacyRouteMap[rawPath];
  if (legacyTarget) {
    window.history.replaceState({}, "", legacyTarget);
    return legacyTarget;
  }
  const path = rawPath as AppRoute;
  return validRoutes.has(path) ? path : "/";
}

export default App;
