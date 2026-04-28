// SPEC-NOTIFY-001 §M5 — 헤더 종 아이콘 (서버 컴포넌트).
// 카운트 + 최근 10건을 SSR로 fetch한 뒤 클라이언트 NotificationDropdown으로 위임.

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { getUnreadCount, getRecentNotifications } from "@/lib/notifications/queries";
import { NotificationDropdown } from "./NotificationDropdown";

export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = createClient(await cookies());
  const [unread, recent] = await Promise.all([
    getUnreadCount(supabase, user.id),
    getRecentNotifications(supabase, user.id, 10),
  ]);
  return <NotificationDropdown unreadCount={unread} recent={recent} />;
}
