export function isoDate(value: string | Date = new Date()): string {
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("유효한 날짜를 입력해 주세요.");
  const normalized = date.toISOString().slice(0, 10);
  if (typeof value === "string" && normalized !== value) throw new Error("유효한 날짜를 입력해 주세요.");
  return normalized;
}

export function currentDate(timeZone = process.env.TIME_ZONE?.trim() || "Asia/Seoul"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${isoDate(to)}T00:00:00.000Z`).getTime() - new Date(`${isoDate(from)}T00:00:00.000Z`).getTime()) / 86_400_000);
}
