import { requireSupabase } from "../lib/supabase";
import type { PkskSectionCode } from "../types/quiz";

export type SectionPerformance = {
  best_score: number | null;
  attempts: number;
  latest_at: string | null;
};

export type PersonalPerformanceBreakdown = {
  sections: Record<PkskSectionCode, SectionPerformance>;
  completed_sections: number;
  overall_average: number | null;
};

export type AcademyLeaderboardRow = {
  section: PkskSectionCode;
  rank: number;
  display_name: string;
  percentage: number;
  achieved_at: string | null;
  is_current_user: boolean;
};

export type AcademyLeaderboardMap = Record<PkskSectionCode, AcademyLeaderboardRow[]>;

export function emptyPersonalPerformanceBreakdown(): PersonalPerformanceBreakdown {
  return {
    sections: {
      A: emptySectionPerformance(),
      B: emptySectionPerformance(),
      C: emptySectionPerformance(),
    },
    completed_sections: 0,
    overall_average: null,
  };
}

export function emptyAcademyLeaderboardMap(): AcademyLeaderboardMap {
  return { A: [], B: [], C: [] };
}

export async function fetchPersonalPerformanceBreakdown(): Promise<PersonalPerformanceBreakdown> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_performance_breakdown");

  if (error) {
    throw new Error(mapPerformanceMessage(error.message));
  }

  return normalizePersonalBreakdown(data);
}

export async function fetchAcademyLeaderboards(): Promise<AcademyLeaderboardMap> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_section_leaderboard");

  if (error) {
    throw new Error(mapPerformanceMessage(error.message));
  }

  const map = emptyAcademyLeaderboardMap();
  for (const row of data ?? []) {
    const section = normalizeSection(row.section);
    if (!section) continue;
    map[section].push({
      section,
      rank: Number(row.rank) || map[section].length + 1,
      display_name: sanitizeDisplayName(row.display_name),
      percentage: normalizePercentage(row.percentage),
      achieved_at: row.achieved_at ?? null,
      is_current_user: Boolean(row.is_current_user),
    });
  }

  return map;
}

function normalizePersonalBreakdown(value: unknown): PersonalPerformanceBreakdown {
  if (!value || typeof value !== "object") {
    return emptyPersonalPerformanceBreakdown();
  }

  const raw = value as {
    sections?: Partial<Record<PkskSectionCode, Partial<SectionPerformance>>>;
    completed_sections?: number;
    overall_average?: number | null;
  };

  const sections = {
    A: normalizeSectionPerformance(raw.sections?.A),
    B: normalizeSectionPerformance(raw.sections?.B),
    C: normalizeSectionPerformance(raw.sections?.C),
  };

  return {
    sections,
    completed_sections: Number(raw.completed_sections) || countCompletedSections(sections),
    overall_average: raw.overall_average == null ? null : normalizePercentage(raw.overall_average),
  };
}

function emptySectionPerformance(): SectionPerformance {
  return { best_score: null, attempts: 0, latest_at: null };
}

function normalizeSectionPerformance(value: Partial<SectionPerformance> | undefined): SectionPerformance {
  return {
    best_score: value?.best_score == null ? null : normalizePercentage(value.best_score),
    attempts: Math.max(0, Number(value?.attempts ?? 0) || 0),
    latest_at: typeof value?.latest_at === "string" ? value.latest_at : null,
  };
}

function countCompletedSections(sections: Record<PkskSectionCode, SectionPerformance>): number {
  return (["A", "B", "C"] as const).filter((section) => sections[section].best_score !== null).length;
}

function normalizeSection(value: unknown): PkskSectionCode | null {
  return value === "A" || value === "B" || value === "C" ? value : null;
}

function normalizePercentage(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(100, Math.max(0, number));
}

function sanitizeDisplayName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Murid PKSK";
}

function mapPerformanceMessage(message: string): string {
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk dahulu.";
  }
  if (message.includes("ACCOUNT_BLOCKED")) {
    return "Akaun ini belum boleh menggunakan fungsi prestasi.";
  }
  if (message.includes("PGRST202") || message.includes("schema cache") || message.includes("Could not find the function")) {
    return "Fungsi prestasi akademi belum dipasang pada database Supabase.";
  }

  return message;
}
