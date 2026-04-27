import { cookies } from "next/headers";
import { Building2, Plus, Search } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  company_name: string;
  address: string | null;
};

type ClientContactRow = {
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export default async function ClientsPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [clientsRes, contactsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, address")
      .order("company_name")
      .returns<ClientRow[]>(),
    supabase
      .from("client_contacts")
      .select("client_id, name, email, phone")
      .returns<ClientContactRow[]>(),
  ]);

  const clients = clientsRes.data ?? [];
  const contactsByClient = new Map<string, ClientContactRow>();
  for (const c of contactsRes.data ?? []) {
    if (!contactsByClient.has(c.client_id)) contactsByClient.set(c.client_id, c);
  }
  const error = clientsRes.error?.message;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--color-primary)]" />
            고객사 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            등록된 고객사 {clients.length}곳 — 사업자등록증·담당자 정보·인수인계 메모를 보관합니다.
          </p>
        </div>
        <Button>
          <Plus /> 고객사 등록
        </Button>
      </header>

      <Card className="p-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
          <Input placeholder="고객사명·담당자 검색" className="pl-8" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-[var(--color-state-alert)]">데이터 조회 오류: {error}</p>
        ) : clients.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">
            아직 등록된 고객사가 없어요.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>고객사</TableHead>
                <TableHead>주소</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>연락처</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const contact = contactsByClient.get(c.id);
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-medium">{c.company_name}</TableCell>
                    <TableCell className="text-sm text-[var(--color-text-muted)] line-clamp-1">
                      {c.address ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{contact?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm font-tabular text-[var(--color-text-muted)]">
                      {contact?.phone ?? contact?.email ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
