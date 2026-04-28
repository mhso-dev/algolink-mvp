"use server";

// SPEC-NOTIFY-001 §M5 — 알림 페이지 Server Actions.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { markAsRead, markAllAsRead } from "@/lib/notifications/queries";
import { NOTIFY_ERRORS } from "@/lib/notifications/errors";

export async function markReadAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: NOTIFY_ERRORS.UNAUTHORIZED };
  const supabase = createClient(await cookies());
  const r = await markAsRead(supabase, id);
  if (!r.ok) return { ok: false, error: NOTIFY_ERRORS.DB_INSERT };
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllReadAction(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, count: 0, error: NOTIFY_ERRORS.UNAUTHORIZED };
  const supabase = createClient(await cookies());
  const r = await markAllAsRead(supabase, user.id);
  if (!r.ok) return { ok: false, count: 0, error: NOTIFY_ERRORS.DB_INSERT };
  revalidatePath("/notifications");
  return { ok: true, count: r.count };
}
