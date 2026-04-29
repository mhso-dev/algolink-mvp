// SPEC-CONFIRM-001 §M4 REQ-CONFIRM-INQUIRIES-001 — 사전 가용성 문의 inbox.
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { getMyInquiries } from "@/lib/responses/queries";
import { Container } from "@/components/app/container";
import { InquiryCard } from "@/components/instructor/inquiry-card";
import { respondToInquiry } from "./actions";
import type { ResponseStatus } from "@/lib/responses";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
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

  const inquiries = await getMyInquiries(ctx.instructorId);

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center gap-2">
        <Inbox className="h-5 w-5 text-[var(--color-primary)]" />
        <h1 className="text-2xl font-bold tracking-tight">사전 문의</h1>
      </header>
      <p className="text-sm text-[var(--color-text-muted)]">
        고객사 제안 전 운영자가 보낸 사전 가용성 문의 목록입니다. 수락 시 일정 자동 등록은 되지 않습니다.
      </p>

      {inquiries.length === 0 ? (
        <div className="rounded-md border border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-text-muted)]">
          현재 받은 사전 문의가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {inquiries.map((q) => (
            <InquiryCard
              key={q.id}
              data={q}
              responseAction={async (input: {
                status: ResponseStatus;
                conditionalNote?: string | null;
              }) => {
                "use server";
                return await respondToInquiry({
                  inquiryId: q.id,
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
