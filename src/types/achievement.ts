import type { BadgeRow, UserBadgeRow } from "./database";

export type BadgeWithProgress = BadgeRow & {
  earned: boolean;
  earned_at: string | null;
  progress_value: number;
  progress_label: string;
};

export type UserBadgeMap = Record<string, UserBadgeRow>;
