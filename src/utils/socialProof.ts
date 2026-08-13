export function formatRelativeTime(value: string, now = new Date()): string {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Baru sahaja";
  }

  const diffMs = Math.max(0, now.getTime() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return "Baru sahaja";
  }

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes} minit yang lalu`;
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return `${hours} jam yang lalu`;
  }

  if (diffMs < 2 * dayMs) {
    return "Semalam";
  }

  const days = Math.floor(diffMs / dayMs);
  if (days < 7) {
    return `${days} hari yang lalu`;
  }

  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
