import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  Crown,
  Footprints,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PenLine,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
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
  setUserRole,
  unblockUser,
} from "./services/adminService";
import { fetchBadgesWithProgress, calculatePerformance } from "./services/achievementService";
import { fetchGuestPreview, scoreGuestPreview } from "./services/guestPreviewService";
import { fetchProfile, saveProfile, type ProfileInput } from "./services/profileService";
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
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, QuizMode } from "./types/quiz";
import { getLevelProgress } from "./utils/levelSystem";

type AppRoute =
  | "/"
  | "/preview"
  | "/premium"
  | "/login"
  | "/register"
  | "/simulasi"
  | "/latihan"
  | "/quiz"
  | "/profile"
  | "/performance"
  | "/history"
  | "/achievements"
  | "/guide"
  | "/admin"
  | "/admin/users"
  | "/admin/subscriptions"
  | "/admin/questions"
  | "/admin/settings";
type AuthMode = "login" | "register";

const navItems: Array<{ to: AppRoute; label: string; icon: LucideIcon; authOnly?: boolean; premiumOnly?: boolean; adminOnly?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/simulasi", label: "Simulasi", icon: Target, authOnly: true, premiumOnly: true },
  { to: "/latihan", label: "Latihan", icon: Brain, authOnly: true, premiumOnly: true },
  { to: "/performance", label: "Pencapaian", icon: Award, authOnly: true, premiumOnly: true },
  { to: "/achievements", label: "Lencana", icon: Trophy, authOnly: true, premiumOnly: true },
  { to: "/history", label: "Sejarah", icon: History, authOnly: true, premiumOnly: true },
  { to: "/guide", label: "Panduan", icon: BookOpen },
  { to: "/admin", label: "Admin Panel", icon: Users, authOnly: true, adminOnly: true },
];

const bottomNavItems = navItems.filter((item) => ["/", "/simulasi", "/performance", "/achievements", "/guide"].includes(item.to));
const adminRoutes: AppRoute[] = ["/admin", "/admin/users", "/admin/subscriptions", "/admin/questions", "/admin/settings"];
const premiumRoutes = new Set<AppRoute>(["/simulasi", "/latihan", "/performance", "/history", "/achievements"]);
const validRoutes = new Set<AppRoute>(
  navItems.map((item) => item.to).concat(["/preview", "/premium", "/login", "/register", "/quiz", "/profile", "/admin/users", "/admin/subscriptions", "/admin/questions", "/admin/settings"]),
);

const avatars = ["Cemerlang", "Berani", "Bijak", "Tekun", "Kreatif"];
const defaultAppSettings: AppSettings = {
  free_preview_section_a_limit: 5,
  free_preview_section_b_limit: 5,
  free_preview_section_c_enabled: false,
};

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
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [badges, setBadges] = useState<BadgeWithProgress[]>([]);
  const [activePayload, setActivePayload] = useState<AttemptPayload | null>(null);
  const [result, setResult] = useState<CompleteAttemptResult | null>(null);
  const [guestPayload, setGuestPayload] = useState<GuestPreviewPayload | null>(null);
  const [guestResult, setGuestResult] = useState<GuestPreviewResult | null>(null);
  const [guestAnswers, setGuestAnswers] = useState<Record<string, string>>({});

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
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAccessStatus(null);
        setAttempts([]);
        setBadges([]);
        setActivePayload(null);
        window.localStorage.removeItem("pksk-active-attempt");
      }
    });

    return () => subscription.unsubscribe();
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
    setAuthMode(mode);
    navigate(mode === "login" ? "/login" : "/register");
  }

  function openPaywall() {
    navigate("/premium");
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    navigate("/");
  }

  async function handleAuth(email: string, password: string, displayName: string) {
    if (!supabase) {
      setMessage("Sistem latihan belum bersedia. Sila cuba semula selepas tetapan selesai.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
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
          navigate("/profile");
        } else {
          setMessage("Akaun berjaya didaftarkan. Sila semak e-mel jika pengesahan diperlukan, kemudian log masuk.");
          setAuthMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw new Error(error.message);
        }
        navigate("/");
      }
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
      navigate("/");
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
      navigate("/quiz");
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
    navigate("/quiz");
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
    const storageKey = `pksk-guest-preview-completed-${section}`;
    if (window.localStorage.getItem(storageKey) === "true") {
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

    if (isLoggedIn && !accessStatus) {
      return <LoadingPage />;
    }

    if (currentRoute === "/") {
      return (
        <Dashboard
          isLoggedIn={isLoggedIn}
          access={access}
          profile={profile}
          profileReady={profileReady}
          performance={performance}
          activePayload={activePayload}
          settings={appSettings}
          onNavigate={navigate}
          onResume={handleResumeQuiz}
          onStartQuiz={handleStartQuiz}
          onStartGuestPreview={handleStartGuestPreview}
          onAuthMode={openAuth}
          onShowPaywall={openPaywall}
        />
      );
    }
    if (currentRoute === "/login" || currentRoute === "/register") {
      return <AuthPage mode={authMode} busy={busy} onMode={openAuth} onSubmit={handleAuth} />;
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
        />
      );
    }
    if (currentRoute === "/premium") {
      return <PaywallPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
    }
    if (adminRoutes.includes(currentRoute)) {
      if (!isLoggedIn) {
        return <AuthPage mode="login" busy={busy} onMode={openAuth} onSubmit={handleAuth} />;
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
      if (currentRoute === "/admin/subscriptions") {
        return <AdminSubscriptionsPage />;
      }
      if (currentRoute === "/admin/settings") {
        return <AdminSettingsPage settings={appSettings} />;
      }
      return <AdminDashboardPage onNavigate={navigate} onMessage={setMessage} />;
    }
    if (premiumRoutes.has(currentRoute) && !access.canUsePremiumFeature()) {
      return <PaywallPage isLoggedIn={isLoggedIn} access={access} onAuth={openAuth} onNavigate={navigate} />;
    }
    if (currentRoute === "/simulasi" || currentRoute === "/latihan") {
      return <ModePage isLoggedIn={isLoggedIn} busy={busy} onStartQuiz={handleStartQuiz} onNavigate={navigate} />;
    }
    if (currentRoute === "/quiz") {
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
    if (currentRoute === "/profile") {
      return <ProfilePage profile={profile} busy={busy} onSave={handleProfileSave} />;
    }
    if (currentRoute === "/performance") {
      return <PerformancePage stats={performance} attempts={attempts} isLoggedIn={isLoggedIn} onNavigate={navigate} />;
    }
    if (currentRoute === "/history") {
      return <HistoryPage attempts={attempts} isLoggedIn={isLoggedIn} onNavigate={navigate} />;
    }
    if (currentRoute === "/achievements") {
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

      <BottomNav currentRoute={currentRoute} isLoggedIn={isLoggedIn} access={access} onNavigate={navigate} />
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
  return (
    <div className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onNavigate("/")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ocean-600 text-white shadow-soft">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight">Simulator PKSK</span>
            <span className="block truncate text-xs font-medium text-slate-500">Latihan Tahun 6</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
          {navItems.map((item) => {
            if (item.authOnly && !isLoggedIn) {
              return null;
            }
            if (item.premiumOnly && !access.isPremium) {
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
          {isLoggedIn ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate("/profile")}
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
            {navItems.map((item) => {
              if (item.authOnly && !isLoggedIn) {
                return null;
              }
              if (item.premiumOnly && !access.isPremium) {
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
          const disabled = (item.authOnly && !isLoggedIn) || (item.premiumOnly && !access.isPremium) || (item.adminOnly && !access.isAdmin);
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

function AuthPanel({
  mode,
  busy,
  onMode,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  onMode: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string, displayName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(email, password, displayName || email.split("@")[0]);
  }

  return (
    <section className="mb-6 rounded-2xl border border-ocean-100 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{mode === "login" ? "Log Masuk" : "Daftar Akaun"}</h2>
          <p className="text-sm text-slate-500">Simpan markah, perkembangan dan lencana sendiri.</p>
        </div>
        <button
          type="button"
          onClick={() => onMode(mode === "login" ? "register" : "login")}
          className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
        >
          {mode === "login" ? "Daftar" : "Log masuk"}
        </button>
      </div>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit}>
        {mode === "register" ? (
          <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama paparan" />
        ) : null}
        <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mel" required />
        <input
          className="field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Kata laluan"
          minLength={6}
          required
        />
        <button type="submit" disabled={busy} className="inline-flex h-12 items-center justify-center rounded-xl bg-ocean-600 px-5 text-sm font-bold text-white">
          {busy ? "Tunggu..." : mode === "login" ? "Masuk" : "Daftar"}
        </button>
      </form>
    </section>
  );
}

function AuthPage({
  mode,
  busy,
  onMode,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  onMode: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string, displayName: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={UserRound}
        title={mode === "login" ? "Log Masuk" : "Daftar Akaun"}
        text={mode === "login" ? "Masuk untuk sambung latihan premium dan lihat rekod kemajuan." : "Daftar akaun untuk membuka akses premium apabila langganan diaktifkan."}
      />
      <AuthPanel mode={mode} busy={busy} onMode={onMode} onSubmit={onSubmit} />
    </div>
  );
}

function Dashboard({
  isLoggedIn,
  access,
  profile,
  profileReady,
  performance,
  activePayload,
  settings,
  onNavigate,
  onResume,
  onStartQuiz,
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
  settings: AppSettings;
  onNavigate: (route: AppRoute) => void;
  onResume: () => void;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
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
                {isLoggedIn ? `Selamat kembali, ${displayName}` : "Cuba Simulator PKSK Percuma"}
              </h1>
              <p className="break-words text-base leading-7 text-slate-600 sm:text-lg">
                {isLoggedIn
                  ? "Jalankan latihan rawak, simpan rekod kemajuan dan buka lencana pencapaian."
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
                  <button type="button" onClick={() => (access.isPremium ? onNavigate(profileReady ? "/simulasi" : "/profile") : onShowPaywall())} className="primary-button">
                    {access.isPremium ? (profileReady ? "Mula Latihan" : "Lengkapkan Profil") : "Buka Akses Premium"}
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  {activePayload ? (
                    <button type="button" onClick={onResume} className="secondary-button">
                      Sambung Cubaan
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
        <FreePreviewSection settings={settings} onStartGuestPreview={onStartGuestPreview} onLogin={() => onAuthMode("login")} />
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
            <ModeCard title="Latihan Mengikut Bahagian" text="Pilih Bahagian A atau B untuk fokus." icon={Brain} onClick={() => onNavigate("/latihan")} />
            <ModeCard title="Cabaran Pantas" text="10 soalan pendek untuk ulang kaji harian." icon={Clock3} onClick={() => onStartQuiz("quick", null, 10)} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function FreePreviewSection({
  settings,
  onStartGuestPreview,
  onLogin,
}: {
  settings: AppSettings;
  onStartGuestPreview: (section: "A" | "B") => void;
  onLogin: () => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]">
      <PreviewCard
        title="Bahagian A"
        text="Cuba soalan Kecerdasan Insaniah secara percuma."
        count={settings.free_preview_section_a_limit}
        icon={HeartHandshake}
        onClick={() => onStartGuestPreview("A")}
      />
      <PreviewCard
        title="Bahagian B"
        text="Cuba soalan Kecerdasan Intelek secara percuma."
        count={settings.free_preview_section_b_limit}
        icon={Brain}
        onClick={() => onStartGuestPreview("B")}
      />
      <article className="rounded-2xl bg-white p-6 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sun-100 text-amber-700">
          <Crown size={23} aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-black">Akses Penuh</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Log masuk apabila akses premium telah diaktifkan oleh pentadbir.</p>
        <button type="button" className="secondary-button mt-5 w-full" onClick={onLogin}>
          Log Masuk
        </button>
      </article>
    </section>
  );
}

function PreviewCard({
  title,
  text,
  count,
  icon: Icon,
  onClick,
}: {
  title: string;
  text: string;
  count: number;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <article className="rounded-2xl bg-white p-6 shadow-soft">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
        <Icon size={23} aria-hidden="true" />
      </span>
      <p className="mt-5 text-sm font-black uppercase text-ocean-700">Cuba {count} Soalan Percuma</p>
      <h2 className="mt-2 text-2xl font-black text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
      <button type="button" className="primary-button mt-5 w-full" onClick={onClick}>
        Mula Preview
      </button>
    </article>
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
}: {
  payload: GuestPreviewPayload | null;
  answers: Record<string, string>;
  result: GuestPreviewResult | null;
  busy: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onComplete: () => void;
  onNavigate: (route: AppRoute) => void;
  onShowPaywall: () => void;
}) {
  if (!payload) {
    return <EmptyState title="Preview belum dimulakan" text="Pilih Bahagian A atau B untuk mencuba soalan percuma." onNavigate={onNavigate} />;
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
                    {option.option_text}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>
      {result ? (
        <section className="rounded-2xl border border-sun-200 bg-sun-50 p-6 shadow-soft">
          <h2 className="text-2xl font-black">Anda telah menyelesaikan versi percuma.</h2>
          <p className="mt-2 text-lg font-black text-ocean-700">
            Skor ringkas: {result.correct_answers}/{result.total_questions} betul ({result.percentage}%)
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">Buka akses penuh untuk simulasi tanpa had, bank soalan penuh, sejarah cubaan dan lencana pencapaian.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="primary-button" onClick={onShowPaywall}>
              Daftar & Dapatkan Premium
            </button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("/")}>
              Kembali
            </button>
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
  const statusText = access.isBlocked
    ? "Akaun ini sedang disemak oleh pentadbir."
    : access.isExpired
      ? "Akses premium telah tamat."
      : isLoggedIn
        ? "Akaun anda belum mempunyai akses premium."
        : "Cuba preview percuma dahulu, kemudian daftar untuk membuka akses penuh.";

  return (
    <section className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-soft sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
            <Crown size={28} aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Unlock PKSK Premium</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">{statusText}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-black">Premium includes:</h2>
          <div className="mt-5 grid gap-3">
            {["Unlimited Simulations", "Full Question Bank", "Performance Tracking", "Attempt History", "Mata & Level", "Professional Badges", "Randomized Practice"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-leaf-100 text-xs font-black text-leaf-700">OK</span>
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" className="primary-button" onClick={() => onAuth("register")}>
              Get Premium
            </button>
            <button type="button" className="secondary-button" onClick={() => (isLoggedIn ? onNavigate("/") : onAuth("login"))}>
              {isLoggedIn ? "Kembali" : "Login"}
            </button>
          </div>
        </div>
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
    { to: "/admin/settings", label: "System Settings" },
  ];
  function navigateAdmin(to: AppRoute) {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const loadQuestions = useCallback(async () => {
    try {
      const nextQuestions = await fetchAdminQuestions(search);
      setQuestions(nextQuestions);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }, [onMessage, search]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  return (
    <AdminShell title="Question Bank" text="Paparan asas bank soalan. Edit dan activate/deactivate boleh dikembangkan fasa seterusnya.">
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari soalan, kategori atau bahagian" />
          <button type="button" className="secondary-button" onClick={loadQuestions}>
            Search
          </button>
        </div>
      </section>
      <section className="grid gap-4">
        {questions.map((question) => (
          <article key={question.id} className="rounded-2xl bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-ocean-700">
                  Bahagian {question.section} / {question.category ?? "Umum"} / {question.difficulty}
                </p>
                <h2 className="mt-2 text-base font-black leading-6 text-slate-950">{question.question_text}</h2>
              </div>
              <div className="flex gap-2">
                <span className={`rounded-lg px-3 py-2 text-xs font-black ${question.is_active ? "bg-leaf-50 text-leaf-700" : "bg-slate-100 text-slate-500"}`}>
                  {question.is_active ? "Active" : "Inactive"}
                </span>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                  Edit
                </button>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                  Activate / Deactivate
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </AdminShell>
  );
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

function AccessDeniedPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral-50 text-coral-600">
        <LockKeyhole size={26} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-black">403 Access Denied</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Halaman ini hanya untuk admin yang diberi kebenaran.</p>
      <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/")}>
        Kembali ke Dashboard
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
  onNavigate,
}: {
  isLoggedIn: boolean;
  busy: boolean;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
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
        <ModeCard title="Bahagian C" text="Struktur karangan tersedia; penandaan AI dibuat fasa lain." icon={PenLine} disabled onClick={() => undefined} />
      </div>
    </div>
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
              {option.option_text}
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
        <button type="button" className="primary-button" onClick={() => onNavigate("/performance")}>
          Lihat Prestasi
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate("/history")}>
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
      <button type="button" className="primary-button mx-auto mt-6" onClick={() => onNavigate("/simulasi")}>
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

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Ralat tidak dijangka. Cuba semula.";
}

function getCurrentRoute(): AppRoute {
  const path = window.location.pathname as AppRoute;
  return validRoutes.has(path) ? path : "/";
}

export default App;
