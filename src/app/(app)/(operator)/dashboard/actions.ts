"use server";
// @MX:NOTE: SPEC-DASHBOARD-001 §M5 — 상태 전환 Server Action.
import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/guards";
import { transitionProjectStatus } from "@/lib/dashboard/queries";
import type { ProjectStatus } from "@/lib/projects";

export type TransitionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function transitionProjectStatusAction(
  projectId: string,
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus,
): Promise<TransitionResult> {
  await requireRole(["operator", "admin"]);
  const res = await transitionProjectStatus(projectId, fromStatus, toStatus);
  if (res.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    return { ok: true };
  }
  switch (res.reason) {
    case "forbidden_transition":
      return { ok: false, message: "허용되지 않는 상태 전환입니다." };
    case "concurrent_modified":
      return {
        ok: false,
        message: "다른 사용자가 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요.",
      };
    case "rls_denied":
    default:
      return { ok: false, message: "상태 전환 권한이 없거나 일시적인 오류가 발생했습니다." };
  }
}
