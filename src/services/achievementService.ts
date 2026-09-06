import { requireSupabase } from "../lib/supabase";
import type { BadgeRow, ProfileRow, QuizAttemptRow, UserBadgeRow } from "../types/database";
import type { BadgeWithProgress, UserBadgeMap } from "../types/achievement";
import type { PerformanceStats } from "../types/quiz";

export async function fetchBadgesWithProgress(profile: ProfileRow | null, attempts: QuizAttemptRow[]): Promise<BadgeWithProgress[]> {
  const client = requireSupabase();
  const [{ data: badges, error: badgeError }, { data: userBadges, error: userBadgeError }] = await Promise.all([
    client.from("badges").select("*").eq("is_active", true).order("requirement_value", { ascending: true }),
    client.from("user_badges").select("*"),
  ]);

  if (badgeError) {
    throw new Error(badgeError.message);
  }
  if (userBadgeError) {
    throw new Error(userBadgeError.message);
  }

  const earnedMap = (userBadges ?? []).reduce<UserBadgeMap>((map, userBadge) => {
    map[userBadge.badge_id] = userBadge;
    return map;
  }, {});

  return (badges ?? []).map((badge) => withBadgeProgress(badge, earnedMap[badge.id], profile, attempts));
}

export function calculatePerformance(profile: ProfileRow | null, attempts: QuizAttemptRow[], badgeCount: number): PerformanceStats {
  const completed = attempts.filter((attempt) => attempt.status === "completed");
  const scoredPracticeAttempts = completed.filter((attempt) => attempt.mode !== "quick");
  const totalAttempts = completed.length;
  const bestScore = completed.reduce((best, attempt) => Math.max(best, officialAttemptScore(attempt)), 0);
  const averageScore =
    totalAttempts === 0
      ? 0
      : Math.round(completed.reduce((sum, attempt) => sum + officialAttemptScore(attempt), 0) / totalAttempts);
  const bestSectionA = bestSection(scoredPracticeAttempts, "section_a_score");
  const bestSectionB = bestSection(scoredPracticeAttempts, "section_b_score");
  const bestSectionC = bestSection(scoredPracticeAttempts, "section_c_score", { requirePositive: true });
  const completedSections = [bestSectionA, bestSectionB, bestSectionC].filter((value) => value !== null).length;
  const overallBestAverage =
    bestSectionA !== null && bestSectionB !== null && bestSectionC !== null
      ? Math.round((bestSectionA + bestSectionB + bestSectionC) / 3)
      : null;

  return {
    totalAttempts,
    bestScore,
    averageScore,
    totalXp: profile?.xp ?? 0,
    level: profile?.level ?? 1,
    badgeCount,
    sectionA: averageSection(scoredPracticeAttempts, "section_a_score"),
    sectionB: averageSection(scoredPracticeAttempts, "section_b_score"),
    sectionC: averageSection(scoredPracticeAttempts, "section_c_score"),
    bestSectionA,
    bestSectionB,
    bestSectionC,
    completedSections,
    overallBestAverage,
  };
}

function withBadgeProgress(
  badge: BadgeRow,
  earnedBadge: UserBadgeRow | undefined,
  profile: ProfileRow | null,
  attempts: QuizAttemptRow[],
): BadgeWithProgress {
  const completed = attempts.filter((attempt) => attempt.status === "completed");
  const bestScore = completed.reduce((best, attempt) => Math.max(best, Number(attempt.percentage)), 0);
  const quickAttempts = completed.filter((attempt) => attempt.mode === "quick").length;
  const sectionA = maxSection(completed, "section_a_score");
  const sectionB = maxSection(completed, "section_b_score");

  const progressValue = (() => {
    switch (badge.code) {
      case "first_step":
        return completed.length;
      case "quick_thinker":
        return quickAttempts;
      case "consistent_5":
        return completed.length;
      case "score_80":
      case "score_90":
      case "perfect_score":
        return bestScore;
      case "section_a_master":
        return sectionA;
      case "section_b_master":
        return sectionB;
      case "pksk_master":
        return Math.max(completed.length, profile?.level ?? 1);
      default:
        return 0;
    }
  })();

  return {
    ...badge,
    earned: Boolean(earnedBadge),
    earned_at: earnedBadge?.earned_at ?? null,
    progress_value: progressValue,
    progress_label: `${Math.min(Math.round(progressValue), Number(badge.requirement_value))} / ${badge.requirement_value}`,
  };
}

function averageSection(attempts: QuizAttemptRow[], key: "section_a_score" | "section_b_score" | "section_c_score"): number | null {
  const values = attempts.map((attempt) => attempt[key]).filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + Number(value), 0) / values.length);
}

function maxSection(attempts: QuizAttemptRow[], key: "section_a_score" | "section_b_score" | "section_c_score"): number {
  return attempts.reduce((best, attempt) => Math.max(best, Number(attempt[key] ?? 0)), 0);
}

function bestSection(
  attempts: QuizAttemptRow[],
  key: "section_a_score" | "section_b_score" | "section_c_score",
  options: { requirePositive?: boolean } = {},
): number | null {
  const values = attempts
    .map((attempt) => attempt[key])
    .filter((value): value is number => value !== null && (!options.requirePositive || Number(value) > 0));
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values.map(Number));
}

function officialAttemptScore(attempt: QuizAttemptRow): number {
  const score = Number(attempt.score ?? 0);
  return score > 0 ? score : Number(attempt.percentage ?? 0);
}
