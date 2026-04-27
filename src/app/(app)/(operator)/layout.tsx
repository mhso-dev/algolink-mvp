import { requireRole } from "@/auth/guards";

// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-004: operator+admin 공용 라우트 가드.
// instructor 접근 시 /me/dashboard로 silent redirect.
export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["operator", "admin"]);
  return <>{children}</>;
}
