// SPEC-CONFIRM-001 §M4 REQ-CONFIRM-ASSIGNMENTS-001 — 정식 배정 요청 inbox.
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { getMyAssignmentRequests } from "@/lib/responses/queries";
import { Container } from "@/components/app/container";
import { AssignmentCard } from "@/components/instructor/assignment-card";
import { respondToAssignment } from "./actions";
import type { ResponseStatus } from "@/lib/responses";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const session = await requireUser();
  if (session.role !== "instructor") {
    redirect("/dashboard");
  }
  const ctx = await ensureInstructorRow();
  if (!ctx) {
    return (
      <Container variant="narrow" className="py-10 text-center text-sm text-[var(--color-text-muted)]">
        강사 프로필 초기화에 실패했습니다.
      </Container>
    );
  }

  const requests = await getMyAssignmentRequests(ctx.instructorId);

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-[var(--color-primary)]" />
        <h1 className="text-2xl font-bold tracking-tight">배정 요청</h1>
      </header>
      <p className="text-sm text-[var(--color-text-muted)]">
        운영자가 보낸 정식 배정 요청 목록입니다. 수락 시 일정에 자동 등록됩니다.
      </p>

      {requests.length === 0 ? (
        <div className="rounded-md border border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-text-muted)]">
          현재 받은 배정 요청이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <AssignmentCard
              key={r.id}
              data={r}
              responseAction={async (input: {
                status: ResponseStatus;
                conditionalNote?: string | null;
              }) => {
                "use server";
                return await respondToAssignment({
                  projectId: r.id,
                  status: input.status,
                  conditionalNote: input.conditionalNote ?? null,
                });
              }}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
