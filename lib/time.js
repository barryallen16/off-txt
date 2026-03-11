// Small date helpers for the inbox lists.

const pad = (value) => String(value).padStart(2, "0");

function asDate(value) {
  const date = new Date(Number(value) || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** "14:32" */
export function formatClock(value) {
  const date = asDate(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Today", "Yesterday", "22 Oct" */
export function dayLabel(value) {
  const date = asDate(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
