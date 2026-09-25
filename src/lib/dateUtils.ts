const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type MonthGroup = {
  label: string;
  year: number;
  month: number;
  weeks: string[];
};

export function groupWeeksByMonth(weekStarts: string[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const ws of weekStarts) {
    const date = new Date(ws + "T00:00:00");
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;

    if (!groups.has(key)) {
      groups.set(key, {
        label: `${MONTH_NAMES[month]} ${year}`,
        year,
        month,
        weeks: [],
      });
    }
    groups.get(key)!.weeks.push(ws);
  }

  return Array.from(groups.values());
}

export function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  // Use local date parts to avoid UTC timezone shift
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getCurrentMonday();
}

export function generateWeekStarts(startMonday: string, count: number): string[] {
  const result: string[] = [];
  const [y, m, d] = startMonday.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);
  for (let i = 0; i < count; i++) {
    const yy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    result.push(`${yy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

export function getYearStartMonday(year: number = new Date().getFullYear()): string {
  const jan1 = new Date(year, 0, 1);
  // Days back from Jan 1 to the Monday of its week: Mon 0, Tue 1, … Sun 6.
  const back = (jan1.getDay() + 6) % 7;
  const monday = new Date(year, 0, 1 - back);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return String(date.getDate());
}
