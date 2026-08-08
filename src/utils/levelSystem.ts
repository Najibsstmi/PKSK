export type LevelProgress = {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressXp: number;
  neededXp: number;
  percentage: number;
};

export function calculateLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.max(totalXp, 0) / 500) + 1);
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const level = calculateLevel(totalXp);
  const currentLevelXp = (level - 1) * 500;
  const nextLevelXp = level * 500;
  const progressXp = Math.max(totalXp - currentLevelXp, 0);
  const neededXp = nextLevelXp - currentLevelXp;

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp,
    neededXp,
    percentage: Math.min(100, Math.round((progressXp / neededXp) * 100)),
  };
}
