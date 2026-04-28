// SPEC-NOTIFY-001 §M2 — 알림 조회 / 읽음 마킹.
// @MX:ANCHOR: listMyNotifications + getUnreadCount는 헤더/페이지에서 fan_in 높음.
// @MX:REASON: RLS(notifications_recipient_select)에 의존 — 본인 알림만 노출.

import { NOTIFICATION_PAGE_SIZE, DROPDOWN_LIMIT } from "./constants";
import type { NotificationRow, NotificationType, ReadFilter } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface ListNotificationsOpts {
  userId: string;
  types?: NotificationType[];
  read?: ReadFilter;
  page: number;
  pageSize?: number;
}

export interface ListNotificationsResult {
  items: NotificationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listMyNotifications(
  supabase: SupaLike,
  opts: ListNotificationsOpts,
): Promise<ListNotificationsResult> {
  const pageSize = opts.pageSize ?? NOTIFICATION_PAGE_SIZE;
  const page = Math.max(1, opts.page);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("recipient_id", opts.userId);

  if (opts.types && opts.types.length > 0) {
    q = q.in("type", opts.types);
  }
  if (opts.read === "unread") {
    q = q.is("read_at", null);
  } else if (opts.read === "read") {
    q = q.not("read_at", "is", null);
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("[notify.queries] listMyNotifications failed", error);
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  }
  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    items: (data ?? []) as NotificationRow[],
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getUnreadCount(
  supabase: SupaLike,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) {
    console.error("[notify.queries] getUnreadCount failed", error);
    return 0;
  }
  return count ?? 0;
}

export async function getRecentNotifications(
  supabase: SupaLike,
  userId: string,
  limit: number = DROPDOWN_LIMIT,
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[notify.queries] getRecentNotifications failed", error);
    return [];
  }
  return (data ?? []) as NotificationRow[];
}

/** 단일 알림 read 마킹. RLS가 본인 소유 강제. */
export async function markAsRead(
  supabase: SupaLike,
  id: string,
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) {
    console.error("[notify.queries] markAsRead failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/** 본인의 모든 unread 알림을 read로 일괄 처리. */
export async function markAllAsRead(
  supabase: SupaLike,
  userId: string,
): Promise<{ ok: boolean; count: number }> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null)
    .select("id");
  if (error) {
    console.error("[notify.queries] markAllAsRead failed", error);
    return { ok: false, count: 0 };
  }
  return { ok: true, count: (data ?? []).length };
}

export async function getNotificationById(
  supabase: SupaLike,
  id: string,
): Promise<NotificationRow | null> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as NotificationRow | null) ?? null;
}
