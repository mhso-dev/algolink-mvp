import { requireRole } from "@/auth/guards";

// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-003: instructor 전용 라우트 가드.
// 다른 역할 접근 시 requireRole 내부에서 자기 역할의 home으로 silent redirect.
export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("instructor");
  return <>{children}</>;
}
