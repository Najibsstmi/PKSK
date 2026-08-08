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
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { pkskSections, states } from "./data/pksk";
import { fetchBadgesWithProgress, calculatePerformance } from "./services/achievementService";
import { fetchProfile, saveProfile, type ProfileInput } from "./services/profileService";
import {
  completeAttempt,
  fetchActiveAttempt,
  fetchAttemptHistory,
  generateQuiz,
  getAttemptPayload,
  submitAnswer,
} from "./services/questionService";
import type { BadgeWithProgress } from "./types/achievement";
import type { ProfileRow, QuizAttemptRow } from "./types/database";
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, QuizMode } from "./types/quiz";
import { getLevelProgress } from "./utils/levelSystem";

type AppRoute = "/" | "/simulasi" | "/latihan" | "/quiz" | "/profile" | "/performance" | "/history" | "/achievements" | "/guide";
type AuthMode = "login" | "register";

const navItems: Array<{ to: AppRoute; label: string; icon: LucideIcon; authOnly?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/simulasi", label: "Simulasi", icon: Target, authOnly: true },
  { to: "/performance", label: "Pencapaian", icon: Award, authOnly: true },
  { to: "/achievements", label: "Lencana", icon: Trophy, authOnly: true },
  { to: "/history", label: "Sejarah", icon: History, authOnly: true },
  { to: "/guide", label: "Panduan", icon: BookOpen },
];

const bottomNavItems = navItems.filter((item) => ["/", "/simulasi", "/performance", "/achievements", "/guide"].includes(item.to));
const validRoutes = new Set<AppRoute>(navItems.map((item) => item.to).concat(["/latihan", "/quiz", "/profile"]));

const avatars = ["Cemerlang", "Berani", "Bijak", "Tekun", "Kreatif"];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [badges, setBadges] = useState<BadgeWithProgress[]>([]);
  const [activePayload, setActivePayload] = useState<AttemptPayload | null>(null);
  const [result, setResult] = useState<CompleteAttemptResult | null>(null);

  const isLoggedIn = Boolean(session?.user);
  const profileReady = Boolean(profile?.display_name && profile?.school && profile?.state && profile?.class_name);
  const earnedBadgeCount = badges.filter((badge) => badge.earned).length;
  const performance = useMemo(() => calculatePerformance(profile, attempts, earnedBadgeCount), [attempts, earnedBadgeCount, profile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

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
      const nextProfile = await fetchProfile(userId);
      const nextAttempts = await fetchAttemptHistory();
      const nextBadges = await fetchBadgesWithProgress(nextProfile, nextAttempts);
      const activeAttempt = await fetchActiveAttempt();
      setProfile(nextProfile);
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
      setMessage("Sila log masuk dahulu untuk memulakan simulasi.");
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

  const page = (() => {
    if (loading) {
      return <LoadingPage />;
    }

    if (!isSupabaseConfigured) {
      return <SetupNotice />;
    }

    if (currentRoute === "/") {
      return (
        <Dashboard
          isLoggedIn={isLoggedIn}
          profile={profile}
          profileReady={profileReady}
          performance={performance}
          activePayload={activePayload}
          onNavigate={navigate}
          onResume={handleResumeQuiz}
          onStartQuiz={handleStartQuiz}
          onAuthMode={setAuthMode}
        />
      );
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
        isMenuOpen={isMenuOpen}
        profile={profile}
        onNavigate={navigate}
        onMenu={() => setIsMenuOpen((current) => !current)}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 lg:px-8 lg:pb-16">
        {message ? <MessageBanner message={message} onDismiss={() => setMessage(null)} /> : null}
        {!isLoggedIn && isSupabaseConfigured && currentRoute === "/" ? (
          <AuthPanel mode={authMode} busy={busy} onMode={setAuthMode} onSubmit={handleAuth} />
        ) : null}
        {page}
      </main>

      <BottomNav currentRoute={currentRoute} isLoggedIn={isLoggedIn} onNavigate={navigate} />
    </div>
  );
}

function TopBar({
  currentRoute,
  isLoggedIn,
  isMenuOpen,
  profile,
  onNavigate,
  onMenu,
  onSignOut,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
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
  onNavigate,
}: {
  currentRoute: AppRoute;
  isLoggedIn: boolean;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Navigasi bawah">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {bottomNavItems.map((item) => {
          const disabled = item.authOnly && !isLoggedIn;
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

function Dashboard({
  isLoggedIn,
  profile,
  profileReady,
  performance,
  activePayload,
  onNavigate,
  onResume,
  onStartQuiz,
  onAuthMode,
}: {
  isLoggedIn: boolean;
  profile: ProfileRow | null;
  profileReady: boolean;
  performance: ReturnType<typeof calculatePerformance>;
  activePayload: AttemptPayload | null;
  onNavigate: (route: AppRoute) => void;
  onResume: () => void;
  onStartQuiz: (mode: QuizMode, section: PkskSectionCode | null, numberOfQuestions: number) => void;
  onAuthMode: (mode: AuthMode) => void;
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
                {isLoggedIn ? `Selamat kembali, ${displayName}` : "Simulator PKSK profesional"}
              </h1>
              <p className="break-words text-base leading-7 text-slate-600 sm:text-lg">
                Jalankan latihan rawak, simpan rekod kemajuan dan buka lencana pencapaian.
              </p>
            </div>
            {isLoggedIn ? (
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
                  <button type="button" onClick={() => onNavigate(profileReady ? "/simulasi" : "/profile")} className="primary-button">
                    {profileReady ? "Mula Latihan" : "Lengkapkan Profil"}
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
                  <button type="button" onClick={() => onAuthMode("register")} className="primary-button">
                    Daftar Akaun
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
    </div>
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
