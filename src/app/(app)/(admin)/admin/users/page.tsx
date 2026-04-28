// SPEC-ADMIN-001 §3.2 F-301 — admin 회원 리스트.
// 가드: admin layout이 1차, 본 페이지에서 추가 검사.
import Link from "next/link";
import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/auth/guards";
import { listUsers } from "@/lib/admin/users/queries";
import { parseAdminUserListQuery } from "@/lib/admin/users/list-query";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const query = parseAdminUserListQuery(sp);
  const { rows, total } = await listUsers(query);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-[var(--color-primary)]" />
          회원 / 권한
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          시스템 사용자의 역할과 활성 상태를 관리합니다. (관리자 전용)
        </p>
      </header>

      <form className="flex flex-wrap gap-2 items-end" action="/admin/users">
        <label className="flex flex-col gap-1 text-sm">
          <span>이메일 검색</span>
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="email 부분 일치"
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>역할</span>
          <select name="role" defaultValue={query.role ?? ""} className="border rounded px-2 py-1 text-sm">
            <option value="">전체</option>
            <option value="instructor">instructor</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>활성</span>
          <select
            name="is_active"
            defaultValue={query.isActive === null ? "" : String(query.isActive)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            <option value="true">활성</option>
            <option value="false">비활성</option>
          </select>
        </label>
        <button
          type="submit"
          className="border rounded px-3 py-1 text-sm bg-[var(--color-primary)] text-white"
        >
          적용
        </button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이메일</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>활성</TableHead>
                <TableHead className="text-right">상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                    조건에 일치하는 사용자가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.nameKr}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge>활성</Badge>
                      ) : (
                        <Badge variant="alert">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-sm underline text-[var(--color-primary)]"
                      >
                        상세
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <footer className="flex justify-between text-sm text-[var(--color-text-muted)]">
        <span>총 {total}명</span>
        <span>
          {query.page} / {totalPages} 페이지
        </span>
      </footer>
    </div>
  );
}
