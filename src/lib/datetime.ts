const pad = (value: number) => String(value).padStart(2, "0");

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 显示层唯一日期时间格式：yyyy-MM-dd HH:mm:ss；内部存储保持 ISO8601。 */
export function formatDateTime(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "未获取";
  }
  const date = toDate(value);
  if (date === null) return "未获取";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 显示层唯一日期格式：yyyy-MM-dd。 */
export function formatDate(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "未获取";
  }
  const date = toDate(value);
  if (date === null) return "未获取";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 纯时间点标签，仅用于日程时间段等非完整日期场景。 */
export function formatClock(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "未获取";
  }
  const date = toDate(value);
  if (date === null) return "未获取";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nowDateTimeText(): string {
  return formatDateTime(new Date());
}
