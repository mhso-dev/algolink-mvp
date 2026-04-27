import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { extractRole } from "@/lib/role";
import { getDefaultLandingPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * 루트(/) — 인증/역할에 따라 자동 분기.
 * - 미인증: /login
 * - 강사: /me
 * - 담당자/관리자: /dashboard
 */
export default async function Home() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  redirect(getDefaultLandingPath(extractRole(user)));
}
