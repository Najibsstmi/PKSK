import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Menu,
  PencilLine,
  Rocket,
  Save,
  Sparkles,
  Target,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { pkskSections, practiceModes, states } from "./data/pksk";
import type { CandidateProfile, PracticeMode } from "./types";

type AppRoute = "/" | "/mod" | "/profil" | "/pencapaian" | "/panduan";

const emptyProfile: CandidateProfile = {
  name: "",
  school: "",
  state: "",
  className: "",
};

const navItems: Array<{ to: AppRoute; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mod", label: "Pilih Mod", icon: Target },
  { to: "/profil", label: "Profil Calon", icon: UserRound },
  { to: "/pencapaian", label: "Pencapaian", icon: Award },
  { to: "/panduan", label: "Panduan", icon: BookOpen },
];

const validRoutes = new Set<AppRoute>(navItems.map((item) => item.to));

const accentStyles: Record<PracticeMode["accent"], string> = {
  ocean: "border-ocean-100 bg-ocean-50 text-ocean-700",
  coral: "border-coral-100 bg-coral-50 text-coral-600",
  leaf: "border-leaf-100 bg-leaf-50 text-leaf-600",
};

function App() {
  const [profile, setProfile] = useState<CandidateProfile>(emptyProfile);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => getCurrentRoute());

  useEffect(() => {
    const savedProfile = window.localStorage.getItem("pksk-candidate-profile");

    if (!savedProfile) {
      return;
    }

    try {
      setProfile(JSON.parse(savedProfile) as CandidateProfile);
    } catch {
      window.localStorage.removeItem("pksk-candidate-profile");
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      setCurrentRoute(getCurrentRoute());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const isProfileReady = useMemo(() => {
    return Object.values(profile).every((value) => value.trim().length > 0);
  }, [profile]);

  function saveProfile(nextProfile: CandidateProfile) {
    setProfile(nextProfile);
    window.localStorage.setItem("pksk-candidate-profile", JSON.stringify(nextProfile));
  }

  function navigate(to: AppRoute) {
    window.history.pushState({}, "", to);
    setCurrentRoute(to);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => navigate("/")}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ocean-600 text-white shadow-soft">
              <GraduationCap size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight">Simulator PKSK</span>
              <span className="block truncate text-xs font-medium text-slate-500">Fasa 1 Tahun 6</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
            {navItems.map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                  currentRoute === item.to
                    ? "bg-ocean-50 text-ocean-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <item.icon size={17} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-label={isMenuOpen ? "Tutup menu" : "Buka menu"}
          >
            {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>

        {isMenuOpen ? (
          <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Navigasi mudah alih">
            <div className="mx-auto grid max-w-7xl gap-2">
              {navItems.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold ${
                    currentRoute === item.to ? "bg-ocean-50 text-ocean-700" : "text-slate-600"
                  }`}
                >
                  <item.icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        {currentRoute === "/" ? (
          <Dashboard profile={profile} isProfileReady={isProfileReady} onNavigate={navigate} />
        ) : null}
        {currentRoute === "/mod" ? <ModeSelection isProfileReady={isProfileReady} /> : null}
        {currentRoute === "/profil" ? <ProfilePage profile={profile} onSave={saveProfile} /> : null}
        {currentRoute === "/pencapaian" ? (
          <AchievementPage profile={profile} isProfileReady={isProfileReady} />
        ) : null}
        {currentRoute === "/panduan" ? <GuidePage /> : null}
      </main>
    </div>
  );
}

function Dashboard({
  profile,
  isProfileReady,
  onNavigate,
}: {
  profile: CandidateProfile;
  isProfileReady: boolean;
  onNavigate: (to: AppRoute) => void;
}) {
  const displayName = profile.name || "Calon PKSK";

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-lg bg-white shadow-soft">
        <div className="grid lg:min-h-[430px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative order-1 min-h-[220px] lg:min-h-[430px]">
            <img
              src="/assets/pksk-hero.png"
              alt="Murid Tahun 6 belajar bersama menggunakan tablet dan buku latihan"
              className="h-full w-full object-cover object-left"
            />
          </div>

          <div className="order-2 flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-8 lg:p-10">
            <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-sun-100 px-3 py-2 text-sm font-bold text-amber-700">
              <Sparkles size={17} aria-hidden="true" />
              Fasa 1 stabil untuk latihan awal
            </div>
            <div className="max-w-[300px] space-y-4 sm:max-w-xl">
              <h1 className="max-w-full break-words text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                Selamat datang, {displayName}
              </h1>
              <p className="break-words text-base leading-7 text-slate-600 sm:text-lg">
                Mulakan persediaan PKSK dengan profil calon, pilihan mod latihan dan panduan bahagian utama sebelum bank soalan penuh ditambah.
              </p>
            </div>
            <div className="flex max-w-[300px] flex-col gap-3 sm:max-w-none sm:flex-row">
              <button
                type="button"
                onClick={() => onNavigate(isProfileReady ? "/mod" : "/profil")}
                className="inline-flex h-12 w-full max-w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-bold text-white shadow-soft transition hover:bg-ocean-700 sm:w-auto"
              >
                {isProfileReady ? "Pilih Mod Latihan" : "Lengkapkan Profil"}
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate("/panduan")}
                className="inline-flex h-12 w-full max-w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                <BookOpen size={18} aria-hidden="true" />
                Lihat Panduan
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={ClipboardList} label="Mod Latihan" value="3" tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Clock3} label="Sasaran Harian" value="10 min" tone="bg-coral-50 text-coral-600" />
        <StatCard icon={CalendarCheck} label="Status Profil" value={isProfileReady ? "Lengkap" : "Belum"} tone="bg-leaf-50 text-leaf-600" />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {practiceModes.map((mode) => (
          <ModeCard key={mode.id} mode={mode} onNavigate={onNavigate} />
        ))}
      </section>
    </div>
  );
}

function ModeSelection({ isProfileReady }: { isProfileReady: boolean }) {
  const [selectedMode, setSelectedMode] = useState<PracticeMode["id"]>("full");
  const currentMode = practiceModes.find((mode) => mode.id === selectedMode) ?? practiceModes[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-ocean-50 text-ocean-700">
            <Target size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-black">Pilih Mod</h1>
            <p className="text-sm text-slate-500">Mulakan latihan mengikut masa dan tahap kesediaan.</p>
          </div>
        </div>

        <div className="grid gap-3">
          {practiceModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelectedMode(mode.id)}
              className={`rounded-lg border p-4 text-left transition ${
                selectedMode === mode.id ? "border-ocean-500 bg-ocean-50" : "border-slate-200 bg-white hover:border-ocean-200"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-950">{mode.title}</span>
                <span className={`rounded-md border px-2 py-1 text-xs font-bold ${accentStyles[mode.accent]}`}>{mode.status}</span>
              </span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{mode.subtitle}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-soft">
        <div className={`mb-5 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${accentStyles[currentMode.accent]}`}>
          <Clock3 size={17} aria-hidden="true" />
          {currentMode.duration}
        </div>
        <h2 className="text-3xl font-black text-slate-950">{currentMode.title}</h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">{currentMode.focus}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Step icon={UserRound} title="Profil" text="Kenal pasti calon sebelum sesi bermula." />
          <Step icon={Brain} title="Latihan" text="Ikut bahagian dan masa yang ditetapkan." />
          <Step icon={Award} title="Refleksi" text="Lihat pencapaian asas selepas latihan." />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-700">
            {isProfileReady
              ? "Profil calon sudah lengkap. Mod ini sedia digunakan untuk Fasa 1."
              : "Lengkapkan profil dahulu supaya rekod latihan boleh disimpan pada peringkat seterusnya."}
          </p>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({
  profile,
  onSave,
}: {
  profile: CandidateProfile;
  onSave: (profile: CandidateProfile) => void;
}) {
  const [draft, setDraft] = useState<CandidateProfile>(profile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
    setSaved(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-coral-50 text-coral-600">
            <UserRound size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-black">Profil Calon</h1>
            <p className="text-sm text-slate-500">Maklumat asas disimpan pada peranti ini.</p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label text="Nama Calon">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="field"
              placeholder="Contoh: Ahmad Hakimi"
              required
            />
          </Label>
          <Label text="Sekolah">
            <input
              value={draft.school}
              onChange={(event) => setDraft({ ...draft, school: event.target.value })}
              className="field"
              placeholder="Nama sekolah rendah"
              required
            />
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Negeri">
              <select
                value={draft.state}
                onChange={(event) => setDraft({ ...draft, state: event.target.value })}
                className="field"
                required
              >
                <option value="">Pilih negeri</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Kelas">
              <input
                value={draft.className}
                onChange={(event) => setDraft({ ...draft, className: event.target.value })}
                className="field"
                placeholder="6 Amanah"
                required
              />
            </Label>
          </div>
          <button
            type="submit"
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-bold text-white shadow-soft transition hover:bg-ocean-700"
          >
            <Save size={18} aria-hidden="true" />
            Simpan Profil
          </button>
          {saved ? <p className="text-sm font-semibold text-leaf-600">Profil berjaya disimpan.</p> : null}
        </form>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-soft">
        <h2 className="text-xl font-black">Ringkasan Calon</h2>
        <div className="mt-5 grid gap-3">
          <SummaryRow label="Nama" value={draft.name || "Belum diisi"} />
          <SummaryRow label="Sekolah" value={draft.school || "Belum diisi"} />
          <SummaryRow label="Negeri" value={draft.state || "Belum diisi"} />
          <SummaryRow label="Kelas" value={draft.className || "Belum diisi"} />
        </div>
      </section>
    </div>
  );
}

function AchievementPage({
  profile,
  isProfileReady,
}: {
  profile: CandidateProfile;
  isProfileReady: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black">Pencapaian</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Fasa 1 menyediakan papan pemuka pencapaian asas. Markah sebenar boleh disambung selepas bank soalan dimasukkan.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-sun-100 px-3 py-2 text-sm font-bold text-amber-700">
            <Flame size={17} aria-hidden="true" />
            Sasaran 7 hari
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Rocket} label="Sesi Dicuba" value="0" tone="bg-ocean-50 text-ocean-700" />
        <StatCard icon={Award} label="Lencana" value={isProfileReady ? "1" : "0"} tone="bg-sun-50 text-amber-700" />
        <StatCard icon={PencilLine} label="Karangan" value="Belum" tone="bg-coral-50 text-coral-600" />
      </section>

      <section className="rounded-lg bg-white p-6 shadow-soft">
        <h2 className="text-xl font-black">Cadangan Hari Ini</h2>
        <p className="mt-3 leading-7 text-slate-600">
          {isProfileReady
            ? `${profile.name}, cuba satu Cabaran Pantas selama 10 minit untuk biasakan diri dengan susunan aplikasi.`
            : "Lengkapkan profil calon dahulu, kemudian cuba Cabaran Pantas selama 10 minit."}
        </p>
      </section>
    </div>
  );
}

function GuidePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-black">Panduan PKSK</h1>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          Kandungan Fasa 1 disusun sebagai kerangka latihan. Setiap bahagian boleh menerima bank soalan, pemasa dan semakan prestasi dalam fasa seterusnya.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {pkskSections.map((section) => (
          <article key={section.title} className="rounded-lg bg-white p-6 shadow-soft">
            <span className="text-sm font-black uppercase text-ocean-700">{section.title}</span>
            <h2 className="mt-2 text-xl font-black text-slate-950">{section.label}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {section.examples.map((example) => (
                <span key={example} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {example}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ModeCard({
  mode,
  onNavigate,
}: {
  mode: PracticeMode;
  onNavigate: (to: AppRoute) => void;
}) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`rounded-md border px-2 py-1 text-xs font-bold ${accentStyles[mode.accent]}`}>{mode.status}</span>
        <span className="text-sm font-bold text-slate-500">{mode.duration}</span>
      </div>
      <h2 className="text-xl font-black text-slate-950">{mode.title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{mode.subtitle}</p>
      <button
        type="button"
        onClick={() => onNavigate("/mod")}
        className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-ocean-700"
      >
        Lihat mod
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </article>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-lg ${tone}`}>
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

function Step({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
        <Icon size={19} aria-hidden="true" />
      </span>
      <h3 className="mt-3 font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function getCurrentRoute(): AppRoute {
  const path = window.location.pathname as AppRoute;
  return validRoutes.has(path) ? path : "/";
}

export default App;
