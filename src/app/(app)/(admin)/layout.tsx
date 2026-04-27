import { requireRole } from "@/auth/guards";

// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-005: admin 전용 라우트 가드.
// operator/instructor 접근 시 자기 역할 home으로 silent redirect.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");
  return <>{children}</>;
}
