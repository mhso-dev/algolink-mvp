import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { extractRole, type AppRole } from "@/lib/role";

export type SessionUser = {
  user: User;
  role: AppRole;
  displayName: string;
};

export function extractDisplayName(user: User | null): string {
  if (!user) return "(로그인 필요)";
  return (
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "(이름 없음)"
  );
}

export async function requireUser(): Promise<SessionUser> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return {
    user,
    role: extractRole(user),
    displayName: extractDisplayName(user),
  };
}
