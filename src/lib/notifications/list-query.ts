// SPEC-NOTIFY-001 §M2 — URL searchParams → ListFilters 파싱.
import { NOTIFICATION_TYPES, type NotificationType, type ListFilters, type ReadFilter } from "./types";

const VALID_TYPES = new Set<string>(NOTIFICATION_TYPES);
const VALID_READ: ReadFilter[] = ["all", "unread", "read"];

export function parseListFilters(
  raw: Record<string, string | string[] | undefined>,
): ListFilters {
  const typeRaw = raw.type;
  const types: NotificationType[] = [];
  const collect = (s: string) => {
    s.split(",")
      .map((t) => t.trim())
      .filter((t) => VALID_TYPES.has(t))
      .forEach((t) => {
        if (!types.includes(t as NotificationType)) types.push(t as NotificationType);
      });
  };
  if (typeof typeRaw === "string") collect(typeRaw);
  else if (Array.isArray(typeRaw)) typeRaw.forEach(collect);

  const readRaw = typeof raw.read === "string" ? raw.read : "all";
  const read: ReadFilter = VALID_READ.includes(readRaw as ReadFilter)
    ? (readRaw as ReadFilter)
    : "all";

  let page = 1;
  const pageRaw = typeof raw.page === "string" ? Number(raw.page) : NaN;
  if (Number.isFinite(pageRaw) && pageRaw >= 1) {
    page = Math.floor(pageRaw);
  }

  return { types, read, page };
}

export function buildListQueryString(filters: ListFilters): string {
  const sp = new URLSearchParams();
  if (filters.types.length > 0) sp.set("type", filters.types.join(","));
  if (filters.read !== "all") sp.set("read", filters.read);
  if (filters.page > 1) sp.set("page", String(filters.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
